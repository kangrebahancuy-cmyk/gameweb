import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { ACTIVE_SKILLS, type ActiveSkillId, type CharacterData } from '@ero/shared';
import { NameTakenError, VersionConflict, type CharacterStore, type StoredCharacter } from '../store';
import { accounts, auditLog, characterSkills, characters, farmPlots, inventoryItems, questProgress } from './schema';

type Db = PgDatabase<PgQueryResultHKT>;

const pgCode = (e: unknown): string | undefined => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
};

export class PgCharacterStore implements CharacterStore {
  constructor(private db: Db) {}

  private async touchAccount(accountId: string) {
    await this.db.insert(accounts).values({ id: accountId })
      .onConflictDoUpdate({ target: accounts.id, set: { lastLoginAt: new Date() } });
  }

  async load(accountId: string): Promise<StoredCharacter | null> {
    await this.touchAccount(accountId);
    const [c] = await this.db.select().from(characters).where(and(eq(characters.accountId, accountId), eq(characters.slot, 0))).limit(1);
    if (!c) return null;
    const [skills, inv, plots, quests] = await Promise.all([
      this.db.select().from(characterSkills).where(eq(characterSkills.characterId, c.id)),
      this.db.select().from(inventoryItems).where(eq(inventoryItems.characterId, c.id)),
      this.db.select().from(farmPlots).where(eq(farmPlots.characterId, c.id)),
      this.db.select().from(questProgress).where(eq(questProgress.characterId, c.id)),
    ]);
    const skillXp = Object.fromEntries(ACTIVE_SKILLS.map((s) => [s, 0])) as Record<ActiveSkillId, number>;
    for (const s of skills) if ((ACTIVE_SKILLS as readonly string[]).includes(s.skill)) skillXp[s.skill as ActiveSkillId] = s.xp;
    const inventory: CharacterData['inventory'] = Array.from({ length: 28 }, () => null);
    for (const i of inv) if (i.slot >= 0 && i.slot < 28) inventory[i.slot] = { id: i.itemId, qty: i.qty };
    const data: CharacterData = {
      name: c.name, x: c.x, y: c.y, hp: c.hp, coins: c.coins, farmRows: c.farmRows, skills: skillXp, inventory,
      plots: plots.map((p) => ({
        x: p.x, y: p.y, state: p.state as 'tilled' | 'planted',
        ...(p.cropId ? { cropId: p.cropId } : {}), ...(p.plantedAt !== null ? { plantedAt: p.plantedAt } : {}),
      })),
      quests: Object.fromEntries(quests.map((q) => [q.questId, { step: q.step, progress: q.progress, done: q.done }])),
    };
    return { id: c.id, version: c.version, data };
  }

  async create(accountId: string, data: CharacterData): Promise<StoredCharacter> {
    await this.touchAccount(accountId);
    try {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(characters).values({
          accountId, slot: 0, name: data.name, x: data.x, y: data.y, hp: data.hp, coins: data.coins, farmRows: data.farmRows,
        }).returning({ id: characters.id });
        await this.writeChildren(tx as unknown as Db, row!.id, data);
        return row!.id;
      });
      return { id, version: 0, data };
    } catch (e) {
      if (pgCode(e) === '23505') {
        // either the name is taken or this account already has a character (race): disambiguate
        const existing = await this.load(accountId);
        if (existing) return existing;
        throw new NameTakenError();
      }
      throw e;
    }
  }

  private async writeChildren(tx: Db, characterId: string, d: CharacterData) {
    await tx.delete(characterSkills).where(eq(characterSkills.characterId, characterId));
    await tx.insert(characterSkills).values(ACTIVE_SKILLS.map((s) => ({ characterId, skill: s, xp: Math.floor(d.skills[s]) })));
    await tx.delete(inventoryItems).where(eq(inventoryItems.characterId, characterId));
    const inv = d.inventory.flatMap((s, slot) => (s ? [{ characterId, slot, itemId: s.id, qty: s.qty }] : []));
    if (inv.length) await tx.insert(inventoryItems).values(inv);
    await tx.delete(farmPlots).where(eq(farmPlots.characterId, characterId));
    if (d.plots.length) {
      await tx.insert(farmPlots).values(d.plots.map((p) => ({
        characterId, x: p.x, y: p.y, state: p.state, cropId: p.cropId ?? null, plantedAt: p.plantedAt ?? null,
      })));
    }
    await tx.delete(questProgress).where(eq(questProgress.characterId, characterId));
    const quests = Object.entries(d.quests);
    if (quests.length) {
      await tx.insert(questProgress).values(quests.map(([questId, q]) => ({ characterId, questId, step: q.step, progress: q.progress, done: q.done })));
    }
  }

  async save(_accountId: string, id: string, d: CharacterData, expectedVersion: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const res = await tx.update(characters).set({
        x: d.x, y: d.y, hp: Math.max(1, d.hp), coins: d.coins, farmRows: d.farmRows,
        version: sql`${characters.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(characters.id, id), eq(characters.version, expectedVersion))).returning({ version: characters.version });
      if (res.length === 0) throw new VersionConflict();
      await this.writeChildren(tx as unknown as Db, id, d);
      return res[0]!.version;
    });
  }

  async audit(accountId: string, characterId: string | null, action: string, detail: Record<string, unknown>) {
    await this.db.insert(auditLog).values({ accountId, characterId, action, detail });
  }
}

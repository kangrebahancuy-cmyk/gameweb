import { DurableObject } from 'cloudflare:workers';
import type { CharacterData } from '@ero/shared';
import type { Env } from './env';
import { NameTakenError, VersionConflict, type CharacterStore, type StoredCharacter } from './store';

/**
 * LOCAL-DEVELOPMENT character storage: one Durable Object per account.
 * Production uses Neon through Hyperdrive (see db/pg-store.ts); this lets `wrangler dev` run with zero setup.
 * It does not enforce global name uniqueness.
 */
export class CharVault extends DurableObject<Env> {
  async load(): Promise<StoredCharacter | null> {
    return (await this.ctx.storage.get<StoredCharacter>('c')) ?? null;
  }
  async create(data: CharacterData): Promise<StoredCharacter> {
    const existing = await this.load();
    if (existing) return existing;
    const c: StoredCharacter = { id: crypto.randomUUID(), version: 0, data };
    await this.ctx.storage.put('c', c);
    return c;
  }
  async save(data: CharacterData, expectedVersion: number): Promise<number> {
    const cur = await this.load();
    if (!cur || cur.version !== expectedVersion) throw new VersionConflict();
    const next = cur.version + 1;
    await this.ctx.storage.put('c', { ...cur, version: next, data });
    return next;
  }
}

export class VaultStore implements CharacterStore {
  constructor(private ns: DurableObjectNamespace<CharVault>) {}
  private stub(accountId: string) { return this.ns.get(this.ns.idFromName(accountId)); }
  load(accountId: string) { return this.stub(accountId).load(); }
  create(accountId: string, data: CharacterData) { return this.stub(accountId).create(data); }
  async save(accountId: string, _id: string, data: CharacterData, expectedVersion: number) {
    try {
      return await this.stub(accountId).save(data, expectedVersion);
    } catch (e) {
      if (String((e as Error)?.message).includes('version_conflict')) throw new VersionConflict();
      throw e;
    }
  }
}
export { NameTakenError };

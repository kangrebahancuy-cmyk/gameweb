import type { CharacterData } from '@ero/shared';

export interface StoredCharacter {
  id: string;
  version: number;
  data: CharacterData;
}

export class NameTakenError extends Error { constructor() { super('name_taken'); } }
export class VersionConflict extends Error { constructor() { super('version_conflict'); } }

/** Persistence boundary used by the room. Production = Neon (PgCharacterStore); local dev = CharVault DO. */
export interface CharacterStore {
  load(accountId: string): Promise<StoredCharacter | null>;
  create(accountId: string, data: CharacterData): Promise<StoredCharacter>;
  /** Optimistic concurrency: throws VersionConflict if another session saved in between. Returns the new version. */
  save(accountId: string, id: string, data: CharacterData, expectedVersion: number): Promise<number>;
  audit?(accountId: string, characterId: string | null, action: string, detail: Record<string, unknown>): Promise<void>;
}

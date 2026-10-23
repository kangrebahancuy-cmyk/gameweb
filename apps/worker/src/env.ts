import type { WorldRoom } from './room';
import type { CharVault } from './vault';

export interface Env {
  WORLD_ROOM: DurableObjectNamespace<WorldRoom>;
  CHAR_VAULT: DurableObjectNamespace<CharVault>;
  /** Present in production (wrangler.prod.jsonc). Absent in local dev. */
  HYPERDRIVE?: Hyperdrive;
  SUPABASE_URL?: string;
  /** Legacy HS256 secret. Leave unset when the Supabase project signs with asymmetric keys (JWKS is used instead). */
  SUPABASE_JWT_SECRET?: string;
  DEV_AUTH?: string;
  ALLOWED_ORIGINS?: string;
  MAX_ROOM_PLAYERS?: string;
  MAX_SHARDS?: string;
}

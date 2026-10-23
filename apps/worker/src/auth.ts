import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';

export interface Identity { sub: string; role: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let jwks: { url: string; fn: JWTVerifyGetKey } | undefined;

/**
 * Validates the Supabase access token sent in the first WebSocket message.
 *  - HS256 legacy projects: set SUPABASE_JWT_SECRET
 *  - asymmetric projects: only SUPABASE_URL is needed (JWKS is fetched and cached)
 *  - local development: DEV_AUTH=true accepts `dev.<uuid>` tokens. wrangler.prod.jsonc forces DEV_AUTH=false.
 */
export async function verifyToken(token: string, env: Env): Promise<Identity> {
  if (env.DEV_AUTH === 'true' && token.startsWith('dev.')) {
    const sub = token.slice(4);
    if (!UUID.test(sub)) throw new Error('bad dev token');
    return { sub: sub.toLowerCase(), role: 'player' };
  }
  if (!env.SUPABASE_URL) throw new Error('auth not configured');
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  const key: Uint8Array | JWTVerifyGetKey = env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : getJwks(`${issuer}/.well-known/jwks.json`);
  const { payload } = await jwtVerify(token, key as never, { issuer, audience: 'authenticated' });
  if (!payload.sub || !UUID.test(payload.sub)) throw new Error('bad subject');
  const role = (payload['app_metadata'] as { role?: string } | undefined)?.role ?? 'player';
  return { sub: payload.sub.toLowerCase(), role };
}

function getJwks(url: string): JWTVerifyGetKey {
  if (!jwks || jwks.url !== url) jwks = { url, fn: createRemoteJWKSet(new URL(url)) };
  return jwks.fn;
}

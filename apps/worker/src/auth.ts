import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';

export interface Identity { sub: string; role: string }

/**
 * kind 'config'  = the Worker is set up in a way that cannot accept this client (message is safe to show the player/developer)
 * kind 'expired' = the token was valid but has expired; the client should sign in again
 * kind 'invalid' = bad signature/issuer/audience/subject
 */
export class AuthError extends Error {
  constructor(public kind: 'config' | 'expired' | 'invalid', message: string) { super(message); }
}

/** Which login mode this Worker accepts. Exposed (without secrets) by /api/health to ease debugging. */
export function authMode(env: Env): { devGuests: boolean; supabaseUrl: boolean; hs256Secret: boolean } {
  return { devGuests: env.DEV_AUTH === 'true', supabaseUrl: !!env.SUPABASE_URL, hs256Secret: !!env.SUPABASE_JWT_SECRET };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let jwks: { url: string; fn: JWTVerifyGetKey } | undefined;

/**
 * Validates the Supabase access token sent in the first WebSocket message.
 *  - HS256 legacy projects: set SUPABASE_JWT_SECRET
 *  - asymmetric projects: only SUPABASE_URL is needed (JWKS is fetched and cached)
 *  - local development: DEV_AUTH=true accepts `dev.<uuid>` tokens. wrangler.prod.jsonc forces DEV_AUTH=false.
 */
export async function verifyToken(token: string, env: Env): Promise<Identity> {
  if (token.startsWith('dev.')) {
    if (env.DEV_AUTH !== 'true') throw new AuthError('config', 'This server does not accept guest logins (DEV_AUTH is off). Sign in with an account.');
    const sub = token.slice(4);
    if (!UUID.test(sub)) throw new AuthError('invalid', 'bad dev token');
    return { sub: sub.toLowerCase(), role: 'player' };
  }
  if (!env.SUPABASE_URL) {
    throw new AuthError('config', 'Server login is not configured: set SUPABASE_URL on the Worker (or run it with DEV_AUTH=true and the client with VITE_DEV_AUTH=true and no Supabase keys).');
  }
  let alg: string | undefined;
  try { alg = decodeProtectedHeader(token).alg; } catch { throw new AuthError('invalid', 'malformed token'); }
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  let key: Uint8Array | JWTVerifyGetKey;
  if (alg?.startsWith('HS')) {
    if (!env.SUPABASE_JWT_SECRET) throw new AuthError('config', 'Your Supabase project signs tokens with HS256: set the SUPABASE_JWT_SECRET secret on the Worker.');
    key = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  } else {
    key = getJwks(`${issuer}/.well-known/jwks.json`);
  }
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, key as never, { issuer, audience: 'authenticated' }));
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw new AuthError('expired', 'Session expired. Please sign in again.');
    if (e instanceof errors.JWKSNoMatchingKey || e instanceof errors.JWKSTimeout) throw new AuthError('config', 'Cannot verify the token with the Supabase keys. Check that SUPABASE_URL belongs to the same project as the client.');
    if (e instanceof errors.JWTClaimValidationFailed && e.claim === 'iss') throw new AuthError('config', 'Token issuer does not match SUPABASE_URL: the client and the Worker point at different Supabase projects.');
    throw new AuthError('invalid', e instanceof Error ? e.message : 'invalid token');
  }
  if (!payload.sub || !UUID.test(payload.sub)) throw new AuthError('invalid', 'bad subject');
  const role = (payload['app_metadata'] as { role?: string } | undefined)?.role ?? 'player';
  return { sub: payload.sub.toLowerCase(), role };
}

function getJwks(url: string): JWTVerifyGetKey {
  if (!jwks || jwks.url !== url) jwks = { url, fn: createRemoteJWKSet(new URL(url)) };
  return jwks.fn;
}

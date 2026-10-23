import type { ServerMsg } from '@ero/shared';

const TYPES = new Set(['welcome', 'snap', 'state', 'ev', 'dialog', 'chat', 'err']);

/** Cheap structural check so a malformed frame can never crash the UI. The server is trusted for content, not for shape. */
export function ServerMsgGuard(m: unknown): m is ServerMsg {
  return typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string' && TYPES.has((m as { t: string }).t);
}

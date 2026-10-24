import { authMode } from './auth';
import type { Env } from './env';

export { WorldRoom } from './room';
export { CharVault } from './vault';

const REGION = 'starter';

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin');
  const list = allowedOrigins(env);
  if (origin && list.includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return {};
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors(req, env), 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' } });
    }

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, time: Date.now(), auth: authMode(env) }, { headers: cors(req, env) });
    }

    if (url.pathname === '/api/status') {
      const max = Math.max(1, Number(env.MAX_SHARDS ?? 4) || 4);
      let online = 0, capacity = 0;
      for (let n = 1; n <= max; n++) {
        const r = await env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(`${REGION}-${n}`)).fetch('https://room/capacity');
        const j = (await r.json()) as { count: number; cap: number };
        online += j.count; capacity += j.cap;
      }
      return Response.json({ ok: true, region: REGION, online, capacity }, { headers: cors(req, env) });
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const origin = req.headers.get('Origin');
      const list = allowedOrigins(env);
      if (origin && list.length && !list.includes(origin)) return new Response('Origin not allowed', { status: 403 });
      // Pick the first shard with room. The shard re-checks capacity, so races only cost a retry on the client.
      const max = Math.max(1, Number(env.MAX_SHARDS ?? 4) || 4);
      for (let n = 1; n <= max; n++) {
        const stub = env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(`${REGION}-${n}`));
        const cap = (await (await stub.fetch('https://room/capacity')).json()) as { count: number; cap: number };
        if (cap.count < cap.cap) return stub.fetch(req);
      }
      return Response.json({ error: 'all_rooms_full' }, { status: 503, headers: cors(req, env) });
    }

    return new Response('Elder Realms Online API', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

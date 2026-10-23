const e = import.meta.env;

export const ENV = {
  supabaseUrl: (e.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (e.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  /** Local development only. A production build must never set this. */
  devAuth: e.VITE_DEV_AUTH === 'true',
  wsUrl: (e.VITE_WS_URL as string | undefined) ?? defaultWsUrl(),
};

function defaultWsUrl(): string {
  const { protocol, hostname } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (local) return `ws://${hostname}:8787/ws`;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}/ws`;
}

export const supabaseConfigured = () => ENV.supabaseUrl !== '' && ENV.supabaseAnonKey !== '';

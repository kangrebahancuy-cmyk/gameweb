import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { ENV, supabaseConfigured } from '../env';

let client: SupabaseClient | undefined;
export function supabase(): SupabaseClient {
  if (!supabaseConfigured()) throw new Error('Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  client ??= createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

/* ---- local-development guest identity (only honoured by a Worker that has DEV_AUTH=true) ---- */
const DEV_KEY = 'ero.devId';
export function devIdentity(): string {
  try {
    let id = localStorage.getItem(DEV_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem(DEV_KEY, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}
/** `?guest=2` lets you open a second independent guest in another tab for multiplayer testing. */
export function devIdentityFor(slot: string | null): string {
  if (!slot) return devIdentity();
  try {
    const key = `${DEV_KEY}.${slot}`;
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export interface AuthUser { id: string; email: string | null; dev: boolean }

export async function currentUser(): Promise<AuthUser | null> {
  if (ENV.devAuth && !supabaseConfigured()) {
    const slot = new URLSearchParams(window.location.search).get('guest');
    return { id: devIdentityFor(slot), email: null, dev: true };
  }
  const { data } = await supabase().auth.getSession();
  return data.session ? toUser(data.session) : null;
}
const toUser = (s: Session): AuthUser => ({ id: s.user.id, email: s.user.email ?? null, dev: false });

export async function accessToken(user: AuthUser): Promise<string> {
  if (user.dev) return `dev.${user.id}`;
  const { data, error } = await supabase().auth.getSession(); // refreshes when expired
  if (error || !data.session) throw new Error('Session expired. Please sign in again.');
  return data.session.access_token;
}

export function onAuthChange(cb: (user: AuthUser | null, event: string) => void): () => void {
  if (!supabaseConfigured()) return () => undefined;
  const { data } = supabase().auth.onAuthStateChange((event: string, session: Session | null) => cb(session ? toUser(session) : null, event));
  return () => data.subscription.unsubscribe();
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}
export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signOut() { if (supabaseConfigured()) await supabase().auth.signOut(); }
export async function requestPasswordReset(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}
export async function setNewPassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw error;
}

import { useEffect, useState, type FormEvent } from 'react';
import { requestPasswordReset, setNewPassword, signIn, signUp } from '../auth/session';
import { ENV, supabaseConfigured } from '../env';

type Mode = 'login' | 'register' | 'forgot';

function httpBase(): string {
  return ENV.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
}

function ServerStatus() {
  const [s, setS] = useState<string>('checking server...');
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${httpBase()}/api/status`, { signal: ctl.signal })
      .then((r) => r.json() as Promise<{ online: number; capacity: number }>)
      .then((j) => setS(`Server online - ${j.online}/${j.capacity} players`))
      .catch(() => { if (!ctl.signal.aborted) setS('Server unreachable'); });
    return () => ctl.abort();
  }, []);
  return <p className="status-line">{s}</p>;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') await signIn(email, password);
      else if (mode === 'register') {
        const r = await signUp(email, password);
        setMsg({ text: r.needsConfirmation ? 'Check your email to confirm your account, then sign in.' : 'Account created!', error: false });
      } else {
        await requestPasswordReset(email);
        setMsg({ text: 'If that address has an account, a reset link is on its way.', error: false });
      }
    } catch (err) {
      setMsg({ text: (err as Error).message || 'Something went wrong.', error: true });
    } finally { setBusy(false); }
  };

  return (
    <main className="landing">
      <h1>Elder Realms Online</h1>
      <p className="tag">A cozy pixel-art farming adventure you share with friends. Plant, harvest, fight slimes, and build your farm.</p>
      {!supabaseConfigured() ? (
        <div className="card"><p>Sign-in is not configured for this build. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</p></div>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="tabs">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>
          <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode !== 'forgot' && (
            <label>Password<input type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          )}
          {msg && <p className={msg.error ? 'err' : 'ok'} role="alert">{msg.text}</p>}
          <button type="submit" disabled={busy}>{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</button>
          {mode !== 'forgot' ? <button type="button" className="link" onClick={() => setMode('forgot')}>Forgot your password?</button>
            : <button type="button" className="link" onClick={() => setMode('login')}>Back to sign in</button>}
        </form>
      )}
      <ServerStatus />
    </main>
  );
}

export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <main className="landing">
      <form className="card" onSubmit={async (e) => { e.preventDefault(); try { await setNewPassword(pw); onDone(); } catch (err) { setMsg((err as Error).message); } }}>
        <h2>Choose a new password</h2>
        <label>New password<input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {msg && <p className="err" role="alert">{msg}</p>}
        <button type="submit">Save password</button>
      </form>
    </main>
  );
}

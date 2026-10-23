import { useEffect, useState } from 'react';
import { currentUser, onAuthChange, signOut, type AuthUser } from './auth/session';
import { AuthScreen, ResetPasswordScreen } from './ui/AuthScreen';
import { GameScreen } from './ui/GameScreen';

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = still checking
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let alive = true;
    currentUser().then((u) => { if (alive) setUser(u); }).catch(() => { if (alive) setUser(null); });
    const off = onAuthChange((u, event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setUser(u);
    });
    return () => { alive = false; off(); };
  }, []);

  if (user === undefined) return <div className="splash">Elder Realms Online</div>;
  if (recovery) return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
  if (!user) return <AuthScreen />;
  return <GameScreen user={user} onLogout={() => { void signOut().finally(() => (user.dev ? window.location.reload() : setUser(null))); }} />;
}

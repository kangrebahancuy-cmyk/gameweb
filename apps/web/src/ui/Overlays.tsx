import { useState } from 'react';
import type { GameSocket } from '../net/socket';
import { useGame } from '../state/store';

export function ConnectionOverlays({ socket, onLogout }: { socket: GameSocket; onLogout: () => void }) {
  const conn = useGame((s) => s.conn);
  const needName = useGame((s) => s.needName);
  const fatal = useGame((s) => s.fatal);
  if (fatal) {
    return (
      <div className="overlay"><div className="card">
        <h2>Disconnected</h2><p>{fatal}</p>
        <div className="row"><button onClick={() => { useGame.setState({ fatal: null }); socket.connect(); }}>Reconnect</button><button onClick={onLogout}>Sign out</button></div>
      </div></div>
    );
  }
  if (needName !== null) return <NamePrompt message={needName} socket={socket} />;
  if (conn === 'connecting' || conn === 'reconnecting') {
    return <div className="banner">{conn === 'connecting' ? 'Connecting to the Starter Valley...' : 'Connection lost. Reconnecting...'}</div>;
  }
  return null;
}

function NamePrompt({ message, socket }: { message: string; socket: GameSocket }) {
  const [name, setName] = useState('');
  const valid = /^[A-Za-z0-9_ -]{3,16}$/.test(name.trim());
  return (
    <div className="overlay"><form className="card" onSubmit={(e) => { e.preventDefault(); if (valid) void socket.submitName(name.trim()); }}>
      <h2>Create your character</h2>
      <p>{message}</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Character name" aria-label="Character name" />
      <p className="hint">3-16 letters, numbers, spaces, - or _</p>
      <button type="submit" disabled={!valid}>Enter the world</button>
    </form></div>
  );
}

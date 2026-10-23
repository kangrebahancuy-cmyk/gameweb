import { useEffect, useMemo } from 'react';
import { accessToken, type AuthUser } from '../auth/session';
import { input } from '../game/input';
import { ENV } from '../env';
import { setSocket } from '../net/instance';
import { GameSocket } from '../net/socket';
import { useGame, world } from '../state/store';
import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { ConnectionOverlays } from './Overlays';
import { useKeyboard } from './useKeyboard';

export function GameScreen({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const socket = useMemo(() => new GameSocket({ url: ENV.wsUrl, getToken: () => accessToken(user) }), [user]);
  useKeyboard();
  useEffect(() => {
    useGame.setState({ conn: 'idle', fatal: null, needName: null, playerId: null, self: null, dialog: null, panel: null, chatOpen: false, chat: [], toasts: [] });
    world.reset();
    setSocket(socket);
    socket.connect();
    return () => { socket.close(); setSocket(undefined); input.clear(); };
  }, [socket]);
  return (
    <div className="game-root">
      <GameCanvas socket={socket} />
      <Hud onLogout={onLogout} />
      <ConnectionOverlays socket={socket} onLogout={onLogout} />
    </div>
  );
}

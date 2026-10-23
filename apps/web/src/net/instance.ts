import type { ClientAction } from '@ero/shared';
import type { GameSocket } from './socket';

let current: GameSocket | undefined;
export const setSocket = (s: GameSocket | undefined) => { current = s; };
export const getSocket = () => current;
export const sendAction = (a: ClientAction) => current?.send(a);

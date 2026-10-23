import { buildStarterMap } from '@ero/shared';

/** Deterministic, so UI (minimap) and Phaser build identical maps; the UI just reuses one instance. */
let map: ReturnType<typeof buildStarterMap> | undefined;
export const getMap = () => (map ??= buildStarterMap());

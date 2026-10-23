import { COIN_ICON, ICON_SHEETS, ITEMS, type IconRef } from '@ero/shared';

export function Icon({ icon, size = 32 }: { icon: IconRef; size?: number }) {
  const sheet = ICON_SHEETS[icon.sheet];
  const k = size / Math.max(icon.w, icon.h);
  return (
    <span
      className="icon"
      style={{
        width: icon.w * k, height: icon.h * k,
        backgroundImage: `url(${sheet.url})`,
        backgroundPosition: `${-icon.x * k}px ${-icon.y * k}px`,
        backgroundSize: `${sheet.w * k}px ${sheet.h * k}px`,
      }}
    />
  );
}

export function ItemIcon({ id, size = 32 }: { id: string; size?: number }) {
  const def = ITEMS[id];
  return def ? <Icon icon={def.icon} size={size} /> : <span className="icon" style={{ width: size, height: size }} />;
}

export const CoinIcon = ({ size = 16 }: { size?: number }) => <Icon icon={COIN_ICON} size={size} />;

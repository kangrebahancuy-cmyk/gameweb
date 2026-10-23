import { INVENTORY_SLOTS, ITEMS, MAX_STACK } from './content';

export interface ItemStack { id: string; qty: number }
export type Inventory = (ItemStack | null)[];

export const emptyInventory = (): Inventory => Array.from({ length: INVENTORY_SLOTS }, () => null);

export function countItem(inv: Inventory, id: string): number {
  let n = 0;
  for (const s of inv) if (s && s.id === id) n += s.qty;
  return n;
}

/** All items are stackable in the vertical slice; one slot per item type. */
export function canAdd(inv: Inventory, id: string, qty: number): boolean {
  if (!ITEMS[id] || !Number.isInteger(qty) || qty <= 0) return false;
  const existing = inv.find((s) => s && s.id === id);
  if (existing) return existing.qty + qty <= MAX_STACK;
  return inv.some((s) => s === null);
}

export function canAddAll(inv: Inventory, items: ItemStack[]): boolean {
  const copy = inv.map((s) => (s ? { ...s } : null));
  for (const it of items) if (!addItem(copy, it.id, it.qty)) return false;
  return true;
}

export function addItem(inv: Inventory, id: string, qty: number): boolean {
  if (!canAdd(inv, id, qty)) return false;
  const existing = inv.find((s) => s && s.id === id);
  if (existing) existing.qty += qty;
  else inv[inv.findIndex((s) => s === null)] = { id, qty };
  return true;
}

export function removeItem(inv: Inventory, id: string, qty: number): boolean {
  if (!Number.isInteger(qty) || qty <= 0 || countItem(inv, id) < qty) return false;
  const i = inv.findIndex((s) => s && s.id === id);
  const s = inv[i]!;
  s.qty -= qty;
  if (s.qty === 0) inv[i] = null;
  return true;
}

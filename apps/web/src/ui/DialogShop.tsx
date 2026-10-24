import { useEffect, useState } from 'react';
import { FARM_EXPANSION_COST, ITEMS, SHOP_STOCK, countItem } from '@ero/shared';
import { getMap } from '../game/mapSingleton';
import { sendAction } from '../net/instance';
import { useGame } from '../state/store';
import { CoinIcon, ItemIcon } from './Icon';

export function DialogBox() {
  const d = useGame((s) => s.dialog);
  const close = useGame((s) => s.closeAll);
  const [i, setI] = useState(0);
  const [shop, setShop] = useState(false);
  useEffect(() => { setI(0); setShop(false); }, [d]);
  if (!d) return null;
  if (shop && d.shop) return <ShopWindow npc={d.npc} name={d.name} onClose={close} />;
  const last = i >= d.lines.length - 1;
  return (
    <div className="dialog" role="dialog">
      <div className="who">{d.name}</div>
      <p>{d.lines[i]}</p>
      <div className="row">
        {!last && <button onClick={() => setI(i + 1)}>Next</button>}
        {last && d.shop && <button onClick={() => setShop(true)}>Shop</button>}
        {last && <button onClick={close}>Close</button>}
      </div>
    </div>
  );
}

function ShopWindow({ npc, name, onClose }: { npc: string; name: string; onClose: () => void }) {
  const self = useGame((s) => s.self);
  if (!self) return null;
  const stock = SHOP_STOCK[npc] ?? [];
  const sellable = self.inventory.flatMap((s) => (s && ITEMS[s.id]?.sell !== undefined ? [s] : []));
  const rowsLeft = self.farmRows;
  return (
    <div className="panel shop" role="dialog" aria-label={`${name}'s shop`}>
      <header><h2>{name}&apos;s General Store</h2><button className="x" onClick={onClose} aria-label="Close">x</button></header>
      <div className="body">
      <div className="coins"><CoinIcon /> {self.coins.toLocaleString()} coins</div>
      <h3>Buy</h3>
      <ul className="shoplist">
        {stock.map((id) => {
          const def = ITEMS[id]!;
          return (
            <li key={id}>
              <ItemIcon id={id} size={24} /><span className="n">{def.name}</span><span className="p">{def.buy}<CoinIcon size={12} /></span>
              <button disabled={self.coins < (def.buy ?? 0)} onClick={() => sendAction({ t: 'shop', npc, op: 'buy', item: id, qty: 1 })}>x1</button>
              <button disabled={self.coins < (def.buy ?? 0) * 5} onClick={() => sendAction({ t: 'shop', npc, op: 'buy', item: id, qty: 5 })}>x5</button>
            </li>
          );
        })}
      </ul>
      <h3>Sell</h3>
      <ul className="shoplist">
        {sellable.length === 0 && <li className="hint">Nothing to sell yet.</li>}
        {sellable.map((s) => (
          <li key={s.id}>
            <ItemIcon id={s.id} size={24} /><span className="n">{ITEMS[s.id]!.name} ({s.qty})</span><span className="p">{ITEMS[s.id]!.sell}<CoinIcon size={12} /></span>
            <button onClick={() => sendAction({ t: 'shop', npc, op: 'sell', item: s.id, qty: 1 })}>x1</button>
            <button onClick={() => sendAction({ t: 'shop', npc, op: 'sell', item: s.id, qty: countItem(self.inventory, s.id) })}>All</button>
          </li>
        ))}
      </ul>
      <h3>Farm</h3>
      <div className="row">
        <span>Your farm has {rowsLeft} rows.</span>
        <button disabled={self.coins < FARM_EXPANSION_COST || rowsLeft >= getMap().farm.maxRows} onClick={() => sendAction({ t: 'expand_farm' })}>
          Add a row ({FARM_EXPANSION_COST} coins)
        </button>
      </div>
      </div>
    </div>
  );
}

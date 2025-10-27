import type { BalanceConfig } from '../logic/balance';

export interface ScreenPoint {
  x: number;
  y: number;
}

export function toScreen(tileX: number, tileY: number, balance: BalanceConfig): ScreenPoint {
  const { tileWidth, tileHeight } = balance.iso;
  const x = (tileX - tileY) * (tileWidth / 2);
  const y = (tileX + tileY) * (tileHeight / 2);
  return { x, y };
}

export function toTile(screenX: number, screenY: number, balance: BalanceConfig): { tileX: number; tileY: number } {
  const { tileWidth, tileHeight } = balance.iso;
  const halfW = tileWidth / 2;
  const halfH = tileHeight / 2;
  const tx = Math.floor((screenX / halfW + screenY / halfH) / 2);
  const ty = Math.floor((screenY / halfH - screenX / halfW) / 2);
  return { tileX: tx, tileY: ty };
}

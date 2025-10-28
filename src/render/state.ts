import type { TileType } from '../ecs/world';
import type { MonsterKind } from '../logic/balance';

export interface RenderTile {
  tileX: number;
  tileY: number;
  type: TileType;
  corrupted: boolean;
  corruption: number;
}

export interface RenderEntity {
  id: number;
  tileX: number;
  tileY: number;
  kind: 'hero' | 'monster' | 'town' | 'loot';
  monsterKind?: MonsterKind;
  hp?: number;
  hpMax?: number;
  integrity?: number;
}

export interface FloatingNumberView {
  x: number;
  y: number;
  value: number;
  life: number;
  crit: boolean;
}

export interface HudState {
  doomClockSeconds: number;
  darkEnergy: number;
  gold: number;
  warn30: boolean;
  warn10: boolean;
}

export interface RenderSnapshot {
  tiles: RenderTile[];
  entities: RenderEntity[];
  floating: FloatingNumberView[];
  hud: HudState;
}

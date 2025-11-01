import type { TileType } from '../ecs/world';
import type { MonsterKind } from '../logic/balance';
import type { SpriteId } from './sprites';

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
  spriteId: SpriteId;
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

export interface DarkEnergyMarkerView {
  value: number;
  label: string;
  ready: boolean;
  cooldownSeconds: number;
}

export interface DarkEnergyHudView {
  value: number;
  max: number;
  markers: DarkEnergyMarkerView[];
}

export interface HudState {
  doomClockSeconds: number;
  darkEnergy: DarkEnergyHudView;
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

import type { TileType } from '../ecs/world';
import type { MonsterKind } from '../logic/balance';
import type { VillageMood } from '../logic/simulation/entities';
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
  kind: 'hero' | 'monster' | 'town' | 'loot' | 'villager' | 'militia';
  monsterKind?: MonsterKind;
  hp?: number;
  hpMax?: number;
  integrity?: number;
  panic?: boolean;
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

export type RunCompletion = 'survival' | 'resource' | 'extinction' | null;

export interface RunSummaryView {
  status: 'running' | 'won' | 'lost';
  timeSurvivedSeconds: number;
  villagersBorn: number;
  resourcesGathered: number;
  surviveGoalSeconds: number;
  resourceGoal: number;
  completedCondition: RunCompletion;
  reason: string | null;
}

export interface DebugOverlayView {
  villagerCount: number;
  monsterCount: number;
  activeGatherers: number;
  monstersChasingVillagers: number;
  resourceStockpile: number;
}

export interface HudState {
  doomClockSeconds: number;
  darkEnergy: DarkEnergyHudView;
  gold: number;
  warn30: boolean;
  warn10: boolean;
  villagerCount: number;
  villagerCapacity: number;
  resourceStockpile: number;
  villageMood: VillageMood;
}

export interface RenderSnapshot {
  tiles: RenderTile[];
  entities: RenderEntity[];
  floating: FloatingNumberView[];
  hud: HudState;
  run: RunSummaryView;
  debug: DebugOverlayView;
}

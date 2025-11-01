import type { MonsterKind } from '../logic/balance';
import type { SpriteId } from '../render/sprites';

export type Entity = number;

export interface Transform {
  tileX: number;
  tileY: number;
}

export interface RenderIso {
  spriteId: SpriteId;
}

export interface Health {
  hp: number;
  max: number;
}

export interface Clickable {}

export interface MonsterTag {
  kind: MonsterKind;
}

export interface HeroTag {}

export interface Town {
  integrity: number;
  rallied?: boolean;
}

export interface Corruption {
  level: number;
}

export interface RallyAura {
  radius: number;
  bonus: number;
  durationTicks: number;
  remainingTicks: number;
  cooldownTicks: number;
}

export interface CleanseChannel {
  tLeftTicks: number;
  totalTicks: number;
  cooldownTicks: number;
  targetTileX: number;
  targetTileY: number;
}

export interface DoomClock {
  seconds: number;
}

export interface DarkEnergy {
  value: number;
  cadenceTicks: number;
  cadenceCounter: number;
  cooldowns: {
    corruptTile: number;
    spawnWave: number;
    drainClock: number;
  };
}

export interface SpawnPoint {
  rate: number;
  timer: number;
}

export interface Loot {
  type: string;
  amount: number;
}

export interface MonsterState {
  moveCooldown: number;
  attackCooldown: number;
}

export interface HeroState {
  moveCooldown: number;
}

export type ComponentStores = {
  transforms: Map<Entity, Transform>;
  renderIso: Map<Entity, RenderIso>;
  health: Map<Entity, Health>;
  clickable: Set<Entity>;
  monster: Map<Entity, MonsterTag>;
  monsterState: Map<Entity, MonsterState>;
  hero: Set<Entity>;
  heroState: Map<Entity, HeroState>;
  town: Map<Entity, Town>;
  corruption: Map<Entity, Corruption>;
  rallyAura: Map<Entity, RallyAura>;
  cleanse: Map<Entity, CleanseChannel>;
  doomClock: Map<Entity, DoomClock>;
  darkEnergy: Map<Entity, DarkEnergy>;
  spawnPoint: Map<Entity, SpawnPoint>;
  loot: Map<Entity, Loot>;
};

export function createComponentStores(): ComponentStores {
  return {
    transforms: new Map(),
    renderIso: new Map(),
    health: new Map(),
    clickable: new Set(),
    monster: new Map(),
    monsterState: new Map(),
    hero: new Set(),
    heroState: new Map(),
    town: new Map(),
    corruption: new Map(),
    rallyAura: new Map(),
    cleanse: new Map(),
    doomClock: new Map(),
    darkEnergy: new Map(),
    spawnPoint: new Map(),
    loot: new Map(),
  };
}

import type { BalanceConfig, MonsterKind } from '../logic/balance';
import { createIntentState, type IntentState, type AbilityIntent, type ClickIntent } from '../logic/intents';
import type { RenderSnapshot } from '../render/state';
import { RNG } from '../utils/rng';
import {
  type ComponentStores,
  type Entity,
  createComponentStores,
  type Transform,
  type RenderIso,
  type Health,
  type MonsterTag,
  type HeroState,
  type MonsterState,
  type Town,
  type DoomClock,
  type DarkEnergy,
  type Corruption,
} from './components';

export type TileType = 'plain' | 'road' | 'town';

export interface TileState {
  type: TileType;
  corruption: number;
  corrupted: boolean;
  corruptProgress: number;
  corrupting: boolean;
}

export interface GridState {
  width: number;
  height: number;
  tiles: TileState[];
}

export interface EconomyState {
  gold: number;
  shards: number;
}

export interface FloatingNumber {
  tileX: number;
  tileY: number;
  value: number;
  lifeTicks: number;
  crit: boolean;
}

export interface World {
  nextEntityId: number;
  entities: Set<Entity>;
  components: ComponentStores;
  grid: GridState;
  intents: IntentState;
  rng: RNG;
  time: {
    tick: number;
    seconds: number;
  };
  view: RenderSnapshot;
  balance: BalanceConfig;
  economy: EconomyState;
  lastSelectedEntity: Entity | null;
  floatingNumbers: FloatingNumber[];
  currentIntents: {
    clicks: ClickIntent[];
    abilities: AbilityIntent[];
  };
}

export function createGrid(width: number, height: number): GridState {
  const tiles: TileState[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({ type: 'plain', corruption: 0, corrupted: false, corruptProgress: 0, corrupting: false });
    }
  }
  return { width, height, tiles };
}

export function gridIndex(grid: GridState, x: number, y: number): number {
  return y * grid.width + x;
}

export function getTile(grid: GridState, x: number, y: number): TileState | undefined {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
    return undefined;
  }
  return grid.tiles[gridIndex(grid, x, y)];
}

function baseRenderSnapshot(): RenderSnapshot {
  return {
    tiles: [],
    entities: [],
    floating: [],
    hud: {
      doomClockSeconds: 0,
      darkEnergy: { value: 0, max: 1, markers: [] },
      gold: 0,
      warn30: false,
      warn10: false,
    },
  };
}

export function createWorld(balance: BalanceConfig): World {
  const grid = createGrid(balance.grid.width, balance.grid.height);
  const components = createComponentStores();
  const world: World = {
    nextEntityId: 1,
    entities: new Set(),
    components,
    grid,
    intents: createIntentState(),
    rng: new RNG(balance.rng.seed),
    time: { tick: 0, seconds: 0 },
    view: baseRenderSnapshot(),
    balance,
    economy: { gold: 0, shards: 0 },
    lastSelectedEntity: null,
    floatingNumbers: [],
    currentIntents: { clicks: [], abilities: [] },
  };

  spawnInitialEntities(world);
  return world;
}

export function createEntity(world: World): Entity {
  const id = world.nextEntityId++;
  world.entities.add(id);
  return id;
}

export function removeEntity(world: World, entity: Entity): void {
  world.entities.delete(entity);
  const { components } = world;
  components.transforms.delete(entity);
  components.renderIso.delete(entity);
  components.health.delete(entity);
  components.clickable.delete(entity);
  components.monster.delete(entity);
  components.monsterState.delete(entity);
  components.hero.delete(entity);
  components.heroState.delete(entity);
  components.town.delete(entity);
  components.corruption.delete(entity);
  components.rallyAura.delete(entity);
  components.cleanse.delete(entity);
  components.doomClock.delete(entity);
  components.darkEnergy.delete(entity);
  components.spawnPoint.delete(entity);
  components.loot.delete(entity);
}

function addTransform(world: World, entity: Entity, data: Transform): void {
  world.components.transforms.set(entity, data);
}

function addRenderIso(world: World, entity: Entity, data: RenderIso): void {
  world.components.renderIso.set(entity, data);
}

function addHealth(world: World, entity: Entity, data: Health): void {
  world.components.health.set(entity, data);
}

function addMonster(world: World, entity: Entity, data: MonsterTag, state: MonsterState): void {
  world.components.monster.set(entity, data);
  world.components.monsterState.set(entity, state);
}

function addHero(world: World, entity: Entity, state: HeroState): void {
  world.components.hero.add(entity);
  world.components.heroState.set(entity, state);
}

function addTown(world: World, entity: Entity, data: Town): void {
  world.components.town.set(entity, data);
}

function addDoomClock(world: World, entity: Entity, data: DoomClock): void {
  world.components.doomClock.set(entity, data);
}

function addDarkEnergy(world: World, entity: Entity, data: DarkEnergy): void {
  world.components.darkEnergy.set(entity, data);
}

function spawnInitialEntities(world: World): void {
  const balance = world.balance;
  const { town: townSpawn, hero: heroSpawn, monsters: monsterSpawns } = balance.initialSpawns;

  const townTile = getTile(world.grid, townSpawn.tileX, townSpawn.tileY);
  if (townTile) {
    townTile.type = 'town';
  }
  const roadOffsets: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (const [dx, dy] of roadOffsets) {
    const tile = getTile(world.grid, townSpawn.tileX + dx, townSpawn.tileY + dy);
    if (tile && tile.type === 'plain') {
      tile.type = 'road';
    }
  }

  // Town entity
  const town = createEntity(world);
  addTransform(world, town, { tileX: townSpawn.tileX, tileY: townSpawn.tileY });
  addRenderIso(world, town, { spriteId: 'town' });
  addTown(world, town, { integrity: balance.town.integrityMax });
  world.components.clickable.add(town);

  // Hero entity
  const hero = createEntity(world);
  addTransform(world, hero, { tileX: heroSpawn.tileX, tileY: heroSpawn.tileY });
  addRenderIso(world, hero, { spriteId: 'hero' });
  addHealth(world, hero, { hp: balance.hero.hp, max: balance.hero.hp });
  addHero(world, hero, {
    moveCooldown: Math.round((balance.hero.moveIntervalMs / 1000) * balance.ticksPerSecond),
  });
  world.components.clickable.add(hero);

  // Doom clock entity
  const doomEntity = createEntity(world);
  addDoomClock(world, doomEntity, { seconds: balance.doomClock.startSeconds });
  addDarkEnergy(world, doomEntity, {
    value: 0,
    cadenceTicks: Math.max(1, Math.round(balance.darkEnergy.aiCadenceSeconds * balance.ticksPerSecond)),
    cadenceCounter: 0,
    cooldowns: {
      corruptTile: 0,
      spawnWave: 0,
      drainClock: 0,
    },
  });

  // Initial monsters near the town
  for (const spawn of monsterSpawns) {
    spawnMonster(world, spawn.tileX, spawn.tileY, spawn.kind);
  }

  // Seed some corruption tiles for contrast
  const tile = getTile(world.grid, townSpawn.tileX - 1, townSpawn.tileY - 1);
  if (tile) {
    tile.corruption = 0.2;
    tile.corrupted = true;
    tile.corruptProgress = 1;
    tile.corrupting = false;
  }
}

export function spawnMonster(world: World, tileX: number, tileY: number, kind: MonsterKind): Entity {
  const balance = world.balance;
  const entity = createEntity(world);
  addTransform(world, entity, { tileX, tileY });
  addRenderIso(world, entity, { spriteId: `monster-${kind}` });
  addHealth(world, entity, {
    hp: balance.monsters.kinds[kind].hp,
    max: balance.monsters.kinds[kind].hp,
  });
  addMonster(world, entity, { kind }, {
    moveCooldown: Math.round(
      (balance.monsters.base.stepIntervalMs / 1000) * balance.ticksPerSecond / balance.monsters.kinds[kind].speedMul,
    ),
    attackCooldown: Math.round((balance.monsters.base.attack.cooldownMs / 1000) * balance.ticksPerSecond),
  });
  world.components.clickable.add(entity);
  return entity;
}

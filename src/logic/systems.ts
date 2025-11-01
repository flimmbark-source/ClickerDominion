import type { Entity, Transform } from '../ecs/components';
import {
  getTile,
  gridIndex,
  removeEntity,
  spawnMonster,
  spawnVillager,
  type FloatingNumber,
  type World,
} from '../ecs/world';
import { consumeIntents, beginTick } from './intents';
import { findPath } from './pathfinding';
import type { DarkEnergyMarkerView } from '../render/state';
import type { VillageMood, TilePosition } from './simulation/entities';
import type { ResourceType } from './balance';

export type System = (world: World) => void;

type TownTarget = { entity: Entity; transform: Transform };

type DarkActionKey = keyof World['balance']['darkEnergy']['actions'];

export function createSystemPipeline(): System[] {
  return [
    timeSystem,
    doomClockSystem,
    inputIntentSystem,
    combatResolutionSystem,
    statusEffectSystem,
    villageSystem,
    villagerAiSystem,
    monsterAiSystem,
    darkLordSystem,
    corruptionSystem,
    spawningSystem,
    economySystem,
    renderSyncSystem,
  ];
}

function timeSystem(world: World): void {
  beginTick(world.intents);
  world.time.tick += 1;
  world.time.seconds = world.time.tick / world.balance.ticksPerSecond;

  for (let i = world.floatingNumbers.length - 1; i >= 0; i -= 1) {
    const fn = world.floatingNumbers[i];
    fn.lifeTicks -= 1;
    if (fn.lifeTicks <= 0) {
      world.floatingNumbers.splice(i, 1);
    }
  }
}

function doomClockSystem(world: World): void {
  const drain = world.balance.doomClock.baseDrainPerSecond;
  if (drain <= 0) {
    return;
  }
  const secondsPerTick = 1 / world.balance.ticksPerSecond;
  adjustDoomClock(world, -drain * secondsPerTick);
}

function inputIntentSystem(world: World): void {
  world.currentIntents = consumeIntents(world.intents);

  if (world.currentIntents.abilities.length > 0) {
    for (const ability of world.currentIntents.abilities) {
      if (ability.type === 'rally') {
        triggerRally(world, ability.tileX, ability.tileY);
      } else if (ability.type === 'cleanse') {
        triggerCleanse(world, ability.tileX, ability.tileY);
      }
    }
  }
}

function combatResolutionSystem(world: World): void {
  const balance = world.balance;
  const { clicks } = world.currentIntents;
  if (clicks.length === 0) {
    return;
  }
  for (const click of clicks) {
    const target = findTopClickable(world, click.tileX, click.tileY);
    if (!target) {
      if (balance.doomClock.drainPerActionSeconds > 0) {
        adjustDoomClock(world, -balance.doomClock.drainPerActionSeconds);
      }
      continue;
    }
    const health = world.components.health.get(target);
    if (!health) {
      if (balance.doomClock.drainPerActionSeconds > 0) {
        adjustDoomClock(world, -balance.doomClock.drainPerActionSeconds);
      }
      continue;
    }
    const { damage, crit } = computeClickDamage(world);
    health.hp = Math.max(0, health.hp - damage);
    if (balance.clickCombat.floatingNumbers) {
      pushFloatingNumber(world, click.tileX, click.tileY, damage, crit);
    }
    if (health.hp <= 0) {
      onEntityDefeated(world, target);
      adjustDoomClock(world, balance.doomClock.onMonsterKillSeconds);
      const dark = getDarkEnergy(world);
      if (dark) {
        dark.value += balance.darkEnergy.perMonsterKillGain;
      }
    }
    if (balance.doomClock.drainPerActionSeconds > 0) {
      adjustDoomClock(world, -balance.doomClock.drainPerActionSeconds);
    }
  }
}

function statusEffectSystem(world: World): void {
  for (const [entity, aura] of world.components.rallyAura.entries()) {
    if (aura.remainingTicks > 0) {
      aura.remainingTicks -= 1;
    }
    if (aura.remainingTicks <= 0) {
      aura.remainingTicks = 0;
      if (aura.cooldownTicks > 0) {
        aura.cooldownTicks -= 1;
      }
    }
    if (aura.remainingTicks === 0 && aura.cooldownTicks === 0) {
      // keep aura ready but inactive
      world.components.rallyAura.set(entity, {
        ...aura,
        remainingTicks: 0,
      });
    }
  }

  for (const [entity, cleanse] of world.components.cleanse.entries()) {
    if (cleanse.tLeftTicks > 0) {
      cleanse.tLeftTicks -= 1;
      const tile = getTile(world.grid, cleanse.targetTileX, cleanse.targetTileY);
      if (tile) {
        const reduction = world.balance.town.cleanse.corruptionReductionPerTick;
        tile.corruption = Math.max(0, tile.corruption - reduction);
        tile.corruptProgress = Math.max(0, tile.corruptProgress - reduction);
        if (tile.corruption <= 0.0001) {
          tile.corruption = 0;
        }
        if (tile.corruptProgress <= 0.0001) {
          tile.corruptProgress = 0;
          tile.corrupting = false;
        }
        tile.corrupted = tile.corruption > 0.0001;
      }
      if (cleanse.tLeftTicks <= 0) {
        cleanse.tLeftTicks = 0;
      }
    } else if (cleanse.cooldownTicks > 0) {
      cleanse.cooldownTicks -= 1;
    }
  }

  // ensure hero/town status flags line up
  for (const [entity, town] of world.components.town.entries()) {
    town.rallied = hasActiveRally(world, entity);
  }

  // dark energy base gain per tick handled in darkLordSystem
}

function villageSystem(world: World): void {
  for (const [entity, village] of world.components.villages.entries()) {
    village.tick({
      spawnVillager: () => spawnVillager(world, entity),
    });
  }
}

function villagerAiSystem(world: World): void {
  if (world.components.villagers.size === 0) {
    return;
  }

  const fleeRadius = Math.max(0, Math.round(world.balance.villagers.fleeRadius));

  for (const [entity, villager] of world.components.villagers.entries()) {
    const transform = world.components.transforms.get(entity);
    if (!transform) {
      continue;
    }

    const homeTransform = world.components.transforms.get(villager.homeVillageId);
    if (!homeTransform) {
      villager.setIdle();
      continue;
    }

    if (
      fleeRadius > 0 &&
      villager.state.type !== 'fleeing' &&
      hasNearbyThreat(world, transform.tileX, transform.tileY, fleeRadius)
    ) {
      const pathToHome = computePath(world, transform.tileX, transform.tileY, homeTransform.tileX, homeTransform.tileY);
      if (pathToHome) {
        villager.startFleeing(pathToHome);
      }
    }

    switch (villager.state.type) {
      case 'idle': {
        if (villager.state.idleTicks > 0) {
          villager.state.idleTicks = Math.max(0, villager.state.idleTicks - 1);
          break;
        }
        const target = findNearestResource(world, transform.tileX, transform.tileY);
        if (!target) {
          villager.setIdle(villager.idleTicksBetweenJobs);
          break;
        }
        if (target.path.length === 0) {
          villager.startGathering(target.target, target.resourceType, target.gatherTicks);
          break;
        }
        villager.startTravelToResource(
          target.path,
          target.resourceType,
          target.target,
          target.gatherTicks,
        );
        break;
      }

      case 'travelToResource': {
        if (villager.state.path.length > 0) {
          const next = villager.state.path.shift();
          if (next) {
            transform.tileX = next.x;
            transform.tileY = next.y;
          }
        }
        if (villager.state.path.length === 0) {
          const { target, resourceType, gatherTicks } = villager.state;
          if (transform.tileX === target.x && transform.tileY === target.y) {
            villager.startGathering(target, resourceType, gatherTicks);
          }
        }
        break;
      }

      case 'gathering': {
        const { target, resourceType } = villager.state;
        const tile = getTile(world.grid, target.x, target.y);
        const node = tile?.resourceNode;
        if (!tile || !node || node.isDepleted() || node.type !== resourceType) {
          villager.carriedResource = 0;
          villager.carriedResourceType = null;
          villager.setIdle();
          break;
        }

        if (villager.state.remainingTicks > 0) {
          villager.state.remainingTicks -= 1;
          if (villager.state.remainingTicks < 0) {
            villager.state.remainingTicks = 0;
          }
          const gatherable = villager.carryCapacity - villager.state.collected;
          if (gatherable > 0) {
            const gathered = node.gatherTick(gatherable);
            villager.state.collected = Math.min(
              villager.carryCapacity,
              villager.state.collected + gathered,
            );
          }
          tile.resourceAmount = node.remainingResource;
          tile.resourceState = node.state;
          tile.resourceType = node.type;
        }

        tile.resourceAmount = node.remainingResource;
        tile.resourceState = node.state;
        tile.resourceType = node.type;

        const nodeDepleted = node.isDepleted();
        const capacityReached = villager.state.collected >= villager.carryCapacity - 1e-6;
        const finished =
          villager.state.remainingTicks <= 0 || nodeDepleted || capacityReached;

        if (!finished) {
          break;
        }

        const collected = Math.min(villager.carryCapacity, villager.state.collected);
        if (collected <= 0) {
          villager.carriedResource = 0;
          villager.carriedResourceType = null;
          villager.setIdle();
          break;
        }

        villager.carriedResource = collected;
        villager.carriedResourceType = resourceType;
        const pathHome = computePath(world, transform.tileX, transform.tileY, homeTransform.tileX, homeTransform.tileY);
        if (!pathHome) {
          villager.carriedResource = 0;
          villager.carriedResourceType = null;
          villager.setIdle();
          break;
        }
        villager.startReturnHome(pathHome);
        break;
      }

      case 'returnHome': {
        if (villager.state.path.length > 0) {
          const next = villager.state.path.shift();
          if (next) {
            transform.tileX = next.x;
            transform.tileY = next.y;
          }
        }
        if (villager.state.path.length === 0 && transform.tileX === homeTransform.tileX && transform.tileY === homeTransform.tileY) {
          if (villager.carriedResource > 0) {
            villager.startDepositing();
          } else {
            villager.setIdle();
          }
        }
        break;
      }

      case 'depositing': {
        if (villager.state.remainingTicks > 0) {
          villager.state.remainingTicks -= 1;
        }
        if (villager.state.remainingTicks > 0) {
          break;
        }
        if (villager.carriedResource > 0) {
          const village = world.components.villages.get(villager.homeVillageId);
          const resourceType = villager.carriedResourceType;
          if (village && resourceType) {
            const resourceDef = world.balance.resources.types[resourceType];
            if (resourceDef) {
              village.deliverResources(villager.carriedResource, resourceDef.effects);
            } else {
              village.addResources(villager.carriedResource);
            }
          } else if (village) {
            village.addResources(villager.carriedResource);
          }
        }
        villager.carriedResource = 0;
        villager.carriedResourceType = null;
        villager.setIdle();
        break;
      }

      case 'fleeing': {
        if (villager.state.path.length > 0) {
          const next = villager.state.path.shift();
          if (next) {
            transform.tileX = next.x;
            transform.tileY = next.y;
          }
        }
        if (villager.state.path.length === 0) {
          if (transform.tileX === homeTransform.tileX && transform.tileY === homeTransform.tileY) {
            if (villager.carriedResource > 0) {
              villager.startDepositing();
            } else {
              villager.setIdle();
            }
          } else {
            villager.setIdle();
          }
        }
        break;
      }
    }
  }
}

function monsterAiSystem(world: World): void {
  const balance = world.balance;
  const townTargets: TownTarget[] = Array.from(world.components.town.keys())
    .map((entity) => {
      const transform = world.components.transforms.get(entity);
      return transform ? { entity, transform } : null;
    })
    .filter((value): value is TownTarget => value !== null);
  if (townTargets.length === 0) {
    return;
  }

  const occupied = new Set<number>();
  for (const [entity, transform] of world.components.transforms.entries()) {
    occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
  }

  const corruptingTiles = new Set<number>();

  for (const [entity, monster] of world.components.monster.entries()) {
    const state = world.components.monsterState.get(entity);
    const transform = world.components.transforms.get(entity);
    if (!state || !transform) {
      continue;
    }
    if (state.moveCooldown > 0) {
      state.moveCooldown -= 1;
      continue;
    }
    const target = findNearestTownTarget(townTargets, transform.tileX, transform.tileY);
    if (!target) {
      continue;
    }
    const goal = target.transform;
    const path = findPath(
      world.grid,
      { x: transform.tileX, y: transform.tileY },
      { x: goal.tileX, y: goal.tileY },
      (x, y) => {
        const idx = gridIndex(world.grid, x, y);
        if (idx === gridIndex(world.grid, goal.tileX, goal.tileY)) {
          return true;
        }
        return !occupied.has(idx);
      },
    );
    if (path.length >= 2) {
      const next = path[1];
      occupied.delete(gridIndex(world.grid, transform.tileX, transform.tileY));
      transform.tileX = next.x;
      transform.tileY = next.y;
      occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
      handleTownContact(world, transform.tileX, transform.tileY, corruptingTiles);
    } else if (path.length === 1) {
      handleTownContact(world, transform.tileX, transform.tileY, corruptingTiles);
    }
    state.moveCooldown = Math.max(1, Math.round((balance.monsters.base.stepIntervalMs / 1000) * balance.ticksPerSecond / balance.monsters.kinds[monster.kind].speedMul));
    state.attackCooldown = Math.max(0, state.attackCooldown - 1);
  }

  for (let i = 0; i < world.grid.tiles.length; i += 1) {
    const tile = world.grid.tiles[i];
    if (tile.type === 'town') {
      tile.corrupting = corruptingTiles.has(i);
    }
  }
}

function findNearestTownTarget(targets: TownTarget[], fromX: number, fromY: number): TownTarget | undefined {
  let best: TownTarget | undefined;
  let bestDist = Infinity;
  for (const target of targets) {
    const dist = Math.abs(target.transform.tileX - fromX) + Math.abs(target.transform.tileY - fromY);
    if (dist < bestDist || (dist === bestDist && target.entity < (best?.entity ?? Infinity))) {
      best = target;
      bestDist = dist;
    }
  }
  return best;
}

function handleTownContact(world: World, tileX: number, tileY: number, corruptingTiles: Set<number>): void {
  const tile = getTile(world.grid, tileX, tileY);
  if (!tile || tile.type !== 'town') {
    return;
  }
  const townEntity = findTownAt(world, tileX, tileY);
  if (!townEntity) {
    return;
  }
  const town = world.components.town.get(townEntity);
  if (!town) {
    return;
  }
  const balance = world.balance;
  corruptingTiles.add(gridIndex(world.grid, tileX, tileY));
  town.integrity = Math.max(0, town.integrity - balance.monsters.base.attack.damage);
  tile.corruptProgress = Math.min(1, tile.corruptProgress + balance.town.corruptProgressPerTick);
  tile.corruption = Math.max(tile.corruption, tile.corruptProgress);
  if (town.integrity === 0) {
    world.components.town.delete(townEntity);
  }
  if (balance.doomClock.penalties.townDamageSeconds > 0) {
    adjustDoomClock(world, -balance.doomClock.penalties.townDamageSeconds);
  }
}

function darkLordSystem(world: World): void {
  const dark = getDarkEnergy(world);
  if (!dark) {
    return;
  }
  const balance = world.balance;
  const secondsPerTick = 1 / balance.ticksPerSecond;
  const corruptedTiles = world.grid.tiles.reduce((count, tile) => (tile.corrupted ? count + 1 : count), 0);
  const gainPerTick =
    balance.darkEnergy.baseGainPerSecond * secondsPerTick +
    corruptedTiles * balance.darkEnergy.perCorruptedTileGain * secondsPerTick;
  dark.value += gainPerTick;

  for (const key of Object.keys(dark.cooldowns) as DarkActionKey[]) {
    if (dark.cooldowns[key] > 0) {
      dark.cooldowns[key] -= 1;
    }
  }

  dark.cadenceCounter += 1;
  if (dark.cadenceCounter >= dark.cadenceTicks) {
    dark.cadenceCounter = 0;
    executeDarkLordAction(world);
  }
}

function corruptionSystem(world: World): void {
  const spreadIncrease = world.balance.corruption.tileIncreasePerTick;
  const decay = world.balance.corruption.tileDecreasePerTick;
  const progressRate = world.balance.town.corruptProgressPerTick;
  const maxCorruption = world.balance.corruption.tileMax;
  for (const tile of world.grid.tiles) {
    if (tile.corrupted) {
      tile.corruption = Math.min(maxCorruption, Math.max(tile.corruption, 1) + spreadIncrease);
      continue;
    }

    if (tile.corrupting) {
      tile.corruptProgress = Math.min(1, tile.corruptProgress + progressRate);
    } else {
      tile.corruptProgress = Math.max(0, tile.corruptProgress - decay);
    }

    tile.corruption = Math.max(0, tile.corruption - decay);
    tile.corruption = Math.max(tile.corruption, tile.corruptProgress);

    if (tile.corruptProgress >= 0.999) {
      tile.corrupted = true;
      tile.corruption = 1;
      tile.corruptProgress = 1;
      tile.corrupting = false;
    } else if (tile.corruption <= 0.0001) {
      tile.corruption = 0;
    }
  }
}

function spawningSystem(world: World): void {
  // Dark lord actions handle major spawns. This system can ensure spawn points tick down.
  for (const [entity, spawnPoint] of world.components.spawnPoint.entries()) {
    spawnPoint.timer -= 1;
    if (spawnPoint.timer <= 0) {
      const transform = world.components.transforms.get(entity);
      if (transform) {
        spawnMonster(world, transform.tileX, transform.tileY, 'imp');
      }
      spawnPoint.timer = spawnPoint.rate;
    }
  }
}

function economySystem(world: World): void {
  // Currently economy updates occur on kill events.
  // Clamp values to non-negative to avoid numeric drift.
  world.economy.gold = Math.max(0, world.economy.gold);
  world.economy.shards = Math.max(0, world.economy.shards);
}

function renderSyncSystem(world: World): void {
  const snapshot = world.view;
  snapshot.tiles = [];
  for (let y = 0; y < world.grid.height; y += 1) {
    for (let x = 0; x < world.grid.width; x += 1) {
      const tile = getTile(world.grid, x, y);
      if (!tile) continue;
      snapshot.tiles.push({
        tileX: x,
        tileY: y,
        corruption: tile.corruption,
        corrupted: tile.corrupted,
        type: tile.type,
      });
    }
  }

  snapshot.entities = [];
  for (const entity of world.entities) {
    const transform = world.components.transforms.get(entity);
    if (!transform) continue;
    const renderIso = world.components.renderIso.get(entity);
    if (!renderIso) continue;
    if (world.components.hero.has(entity)) {
      const health = world.components.health.get(entity);
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'hero',
        hp: health?.hp,
        hpMax: health?.max,
      });
    } else if (world.components.monster.has(entity)) {
      const monster = world.components.monster.get(entity)!;
      const health = world.components.health.get(entity);
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'monster',
        monsterKind: monster.kind,
        hp: health?.hp,
        hpMax: health?.max,
      });
    } else if (world.components.town.has(entity)) {
      const town = world.components.town.get(entity)!;
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'town',
        integrity: town.integrity,
      });
    } else if (world.components.villagers.has(entity)) {
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'villager',
      });
    } else if (world.components.loot.has(entity)) {
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'loot',
      });
    }
  }

  snapshot.floating = world.floatingNumbers.map((fn) => ({
    x: fn.tileX,
    y: fn.tileY,
    value: fn.value,
    life: fn.lifeTicks,
    crit: fn.crit,
  }));

  const doom = Array.from(world.components.doomClock.values())[0];
  const dark = getDarkEnergy(world);
  const darkValue = dark?.value ?? 0;
  const markers = createDarkEnergyMarkers(world, dark);
  const meterMax = computeDarkEnergyMeterMax(darkValue, markers);
  let villagerCount = 0;
  let villagerCapacity = 0;
  let resourceStockpile = 0;
  let villageMood: VillageMood = 'normal';
  const villageIterator = world.components.villages.entries().next();
  if (!villageIterator.done) {
    const [, village] = villageIterator.value;
    villagerCount = village.population;
    villagerCapacity = village.capacity;
    resourceStockpile = village.resourceStockpile;
    villageMood = village.getMood();
  }
  snapshot.hud = {
    doomClockSeconds: doom?.seconds ?? 0,
    darkEnergy: {
      value: darkValue,
      max: meterMax,
      markers,
    },
    gold: world.economy.gold,
    warn30: (doom?.seconds ?? 0) <= world.balance.ui.flashThresholds.t30,
    warn10: (doom?.seconds ?? 0) <= world.balance.ui.flashThresholds.t10,
    villagerCount,
    villagerCapacity,
    resourceStockpile,
    villageMood,
  };
}

interface ResourceSearchResult {
  target: TilePosition;
  path: TilePosition[];
  resourceType: ResourceType;
  gatherTicks: number;
}

function findNearestResource(world: World, startX: number, startY: number): ResourceSearchResult | null {
  const queue: TilePosition[] = [{ x: startX, y: startY }];
  const visited = new Set<number>();
  const parents = new Map<number, number>();
  const startIdx = gridIndex(world.grid, startX, startY);
  visited.add(startIdx);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const tile = getTile(world.grid, current.x, current.y);
    const node = tile?.resourceNode;
    if (tile && node && !node.isDepleted()) {
      const targetIdx = gridIndex(world.grid, current.x, current.y);
      const path = reconstructTilePath(parents, targetIdx, startIdx, world.grid);
      return {
        target: { x: current.x, y: current.y },
        path: path.slice(1),
        resourceType: node.type,
        gatherTicks: node.gatherDurationTicks,
      };
    }

    for (const neighbor of neighborTiles(world.grid, current.x, current.y)) {
      const idx = gridIndex(world.grid, neighbor.x, neighbor.y);
      if (visited.has(idx)) {
        continue;
      }
      visited.add(idx);
      parents.set(idx, gridIndex(world.grid, current.x, current.y));
      queue.push(neighbor);
    }
  }

  return null;
}

function computePath(world: World, startX: number, startY: number, goalX: number, goalY: number): TilePosition[] | null {
  if (startX === goalX && startY === goalY) {
    return [];
  }

  const path = findPath(
    world.grid,
    { x: startX, y: startY },
    { x: goalX, y: goalY },
    (x, y) => x >= 0 && y >= 0 && x < world.grid.width && y < world.grid.height,
  );

  if (path.length === 0) {
    return null;
  }

  return path.slice(1).map((point) => ({ x: point.x, y: point.y }));
}

function hasNearbyThreat(world: World, x: number, y: number, radius: number): boolean {
  if (radius <= 0) {
    return false;
  }
  for (const [monsterEntity] of world.components.monster.entries()) {
    const transform = world.components.transforms.get(monsterEntity);
    if (!transform) {
      continue;
    }
    const dist = Math.abs(transform.tileX - x) + Math.abs(transform.tileY - y);
    if (dist <= radius) {
      return true;
    }
  }
  return false;
}

function neighborTiles(grid: World['grid'], x: number, y: number): TilePosition[] {
  const neighbors: TilePosition[] = [];
  const deltas = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const delta of deltas) {
    const nx = x + delta.x;
    const ny = y + delta.y;
    if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) {
      continue;
    }
    neighbors.push({ x: nx, y: ny });
  }
  return neighbors;
}

function reconstructTilePath(
  parents: Map<number, number>,
  targetIdx: number,
  startIdx: number,
  grid: World['grid'],
): TilePosition[] {
  const path: TilePosition[] = [];
  let current = targetIdx;
  path.push(indexToPosition(grid, current));
  while (current !== startIdx) {
    const parent = parents.get(current);
    if (parent === undefined) {
      break;
    }
    current = parent;
    path.push(indexToPosition(grid, current));
  }
  path.reverse();
  return path;
}

function indexToPosition(grid: World['grid'], idx: number): TilePosition {
  const x = idx % grid.width;
  const y = Math.floor(idx / grid.width);
  return { x, y };
}

function triggerRally(world: World, tileX: number, tileY: number): void {
  const ticks = Math.round(world.balance.town.rally.durationSeconds * world.balance.ticksPerSecond);
  const cooldown = Math.round(world.balance.town.rally.cooldownSeconds * world.balance.ticksPerSecond);
  const entity = findTownAt(world, tileX, tileY) ?? findClosestTown(world, tileX, tileY);
  if (!entity) return;
  const existing = world.components.rallyAura.get(entity);
  if (existing && (existing.remainingTicks > 0 || existing.cooldownTicks > 0)) {
    return;
  }
  world.components.rallyAura.set(entity, {
    radius: world.balance.town.rally.radius,
    bonus: world.balance.town.rally.bonusMultiplier,
    durationTicks: ticks,
    remainingTicks: ticks,
    cooldownTicks: cooldown,
  });
}

function triggerCleanse(world: World, tileX: number, tileY: number): void {
  const ticks = Math.round(world.balance.town.cleanse.channelSeconds * world.balance.ticksPerSecond);
  const cooldown = Math.round(world.balance.town.cleanse.cooldownSeconds * world.balance.ticksPerSecond);
  const heroIterator = world.components.hero.values().next();
  if (heroIterator.done) return;
  const heroEntity = heroIterator.value as Entity;
  const existing = world.components.cleanse.get(heroEntity);
  if (existing && (existing.tLeftTicks > 0 || existing.cooldownTicks > 0)) {
    return;
  }
  world.components.cleanse.set(heroEntity, {
    tLeftTicks: ticks,
    totalTicks: ticks,
    cooldownTicks: cooldown,
    targetTileX: tileX,
    targetTileY: tileY,
  });
}

function findTownAt(world: World, tileX: number, tileY: number): Entity | undefined {
  for (const [entity, transform] of world.components.transforms.entries()) {
    if (world.components.town.has(entity) && transform.tileX === tileX && transform.tileY === tileY) {
      return entity;
    }
  }
  return undefined;
}

function findClosestTown(world: World, tileX: number, tileY: number): Entity | undefined {
  let best: { entity: Entity; dist: number } | undefined;
  for (const [entity, transform] of world.components.transforms.entries()) {
    if (!world.components.town.has(entity)) continue;
    const dist = Math.abs(transform.tileX - tileX) + Math.abs(transform.tileY - tileY);
    if (!best || dist < best.dist) {
      best = { entity, dist };
    }
  }
  return best?.entity;
}

function findTopClickable(world: World, tileX: number, tileY: number): Entity | null {
  let monsterHit: Entity | null = null;
  let otherHit: Entity | null = null;
  for (const entity of world.entities) {
    if (!world.components.clickable.has(entity)) continue;
    const transform = world.components.transforms.get(entity);
    if (!transform) continue;
    if (transform.tileX === tileX && transform.tileY === tileY) {
      if (world.components.monster.has(entity)) {
        monsterHit = entity;
        break;
      }
      otherHit = entity;
    }
  }
  return monsterHit ?? otherHit;
}

function computeClickDamage(world: World): { damage: number; crit: boolean } {
  const balance = world.balance;
  const crit = world.rng.next() < balance.clickCombat.critChance;
  const dmg = balance.clickCombat.baseDamage * (crit ? balance.clickCombat.critMultiplier : 1);
  return { damage: Math.round(dmg), crit };
}

function pushFloatingNumber(world: World, tileX: number, tileY: number, value: number, crit: boolean): void {
  const life = Math.round(0.8 * world.balance.ticksPerSecond);
  const fn: FloatingNumber = { tileX, tileY, value, lifeTicks: life, crit };
  world.floatingNumbers.push(fn);
}

function onEntityDefeated(world: World, entity: Entity): void {
  if (world.components.monster.has(entity)) {
    world.economy.gold += world.balance.economy.goldPerKill;
  }
  removeEntity(world, entity);
}

function hasActiveRally(world: World, entity: Entity): boolean {
  const aura = world.components.rallyAura.get(entity);
  return Boolean(aura && aura.remainingTicks > 0);
}

function getDarkEnergy(world: World) {
  for (const [, dark] of world.components.darkEnergy.entries()) {
    return dark;
  }
  return null;
}

function executeDarkLordAction(world: World): void {
  const balance = world.balance;
  const dark = getDarkEnergy(world);
  if (!dark) return;

  const priorities: DarkActionKey[] = ['corruptTile', 'spawnWave'];
  for (const action of priorities) {
    const config = balance.darkEnergy.actions[action];
    if (!config) {
      continue;
    }
    if (dark.value < config.cost) {
      continue;
    }
    if (dark.cooldowns[action] > 0) {
      continue;
    }
    if (action === 'corruptTile' && tryCorruptTile(world)) {
      dark.value -= config.cost;
      setActionCooldown(world, dark, action);
      if (balance.doomClock.penalties.corruptTileSeconds > 0) {
        adjustDoomClock(world, -balance.doomClock.penalties.corruptTileSeconds);
      }
      return;
    }
    if (action === 'spawnWave' && trySpawnWave(world)) {
      dark.value -= config.cost;
      setActionCooldown(world, dark, action);
      if (balance.doomClock.penalties.spawnWaveSeconds > 0) {
        adjustDoomClock(world, -balance.doomClock.penalties.spawnWaveSeconds);
      }
      return;
    }
  }
}

function tryCorruptTile(world: World): boolean {
  const maxCorruption = world.balance.corruption.tileMax;
  const indices = Array.from({ length: world.grid.tiles.length }, (_, idx) => idx);
  shuffleInPlace(indices, world.rng);

  const towns = indices.filter((idx) => {
    const tile = world.grid.tiles[idx];
    return tile.type === 'town' && !tile.corrupted;
  });

  if (towns.length > 0) {
    const tile = world.grid.tiles[towns[0]];
    tile.corruptProgress = 1;
    tile.corruption = Math.min(maxCorruption, Math.max(tile.corruption, 1));
    tile.corrupted = true;
    tile.corrupting = false;
    return true;
  }

  const candidates = indices.filter((idx) => {
    const tile = world.grid.tiles[idx];
    return tile.corruption < maxCorruption || !tile.corrupted;
  });
  if (candidates.length === 0) {
    return false;
  }

  const tile = world.grid.tiles[candidates[0]];
  const increment = world.balance.corruption.tileIncreasePerTick * world.balance.ticksPerSecond;
  tile.corruption = Math.min(maxCorruption, tile.corruption + increment);
  tile.corruptProgress = Math.min(1, Math.max(tile.corruptProgress, tile.corruption));
  tile.corrupted = tile.corruption >= 0.999;
  tile.corrupting = true;
  return true;
}

function trySpawnWave(world: World): boolean {
  const balance = world.balance;
  const wave = balance.darkEnergy.actions.spawnWave.wave;
  const padding = wave.spawnEdgePadding;
  if (world.grid.width <= padding * 2 || world.grid.height <= padding * 2) {
    return false;
  }

  const candidates: Array<{ x: number; y: number }> = [];
  for (let x = padding; x < world.grid.width - padding; x += 1) {
    candidates.push({ x, y: padding });
    candidates.push({ x, y: world.grid.height - padding - 1 });
  }
  for (let y = padding + 1; y < world.grid.height - padding - 1; y += 1) {
    candidates.push({ x: padding, y });
    candidates.push({ x: world.grid.width - padding - 1, y });
  }
  if (candidates.length === 0) {
    return false;
  }

  shuffleInPlace(candidates, world.rng);

  const occupied = new Set<number>();
  for (const transform of world.components.transforms.values()) {
    occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
  }

  let spawned = 0;
  for (const candidate of candidates) {
    if (spawned >= wave.size) {
      break;
    }
    const idx = gridIndex(world.grid, candidate.x, candidate.y);
    if (occupied.has(idx)) {
      continue;
    }
    spawnMonster(world, candidate.x, candidate.y, wave.monsterKind);
    occupied.add(idx);
    spawned += 1;
  }
  return spawned > 0;
}

function setActionCooldown(world: World, dark: NonNullable<ReturnType<typeof getDarkEnergy>>, action: DarkActionKey): void {
  const ticks = actionCooldownTicks(world, action);
  dark.cooldowns[action] = ticks;
}

function actionCooldownTicks(world: World, action: DarkActionKey): number {
  const seconds = world.balance.darkEnergy.actions[action]?.cooldownSeconds ?? 0;
  if (seconds <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(seconds * world.balance.ticksPerSecond));
}

function shuffleInPlace<T>(items: T[], rng: World['rng']): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.range(0, i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}

function createDarkEnergyMarkers(
  world: World,
  dark: ReturnType<typeof getDarkEnergy>,
): DarkEnergyMarkerView[] {
  const balance = world.balance;
  const entries = Object.entries(balance.darkEnergy.actions) as Array<[
    DarkActionKey,
    { cost: number; cooldownSeconds: number },
  ]>;
  const markers = entries.map(([key, config]) => {
    const cooldownTicks = dark ? dark.cooldowns[key] : 0;
    return {
      value: config.cost,
      label: formatActionLabel(key),
      ready: Boolean(dark && dark.value >= config.cost && cooldownTicks <= 0),
      cooldownSeconds: cooldownTicks / world.balance.ticksPerSecond,
    } satisfies DarkEnergyMarkerView;
  });
  markers.sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
  return markers;
}

function computeDarkEnergyMeterMax(value: number, markers: DarkEnergyMarkerView[]): number {
  const maxMarker = markers.reduce((max, marker) => Math.max(max, marker.value), 0);
  const base = Math.max(maxMarker, value, 1);
  const padded = Math.ceil((base * 1.05) / 5) * 5;
  return padded;
}

function formatActionLabel(action: DarkActionKey): string {
  switch (action) {
    case 'corruptTile':
      return 'Corrupt Tile';
    case 'spawnWave':
      return 'Spawn Wave';
    case 'drainClock':
      return 'Drain Clock';
    default:
      return action;
  }
}

function adjustDoomClock(world: World, deltaSeconds: number): void {
  if (deltaSeconds === 0) {
    return;
  }
  for (const doom of world.components.doomClock.values()) {
    doom.seconds = Math.max(0, doom.seconds + deltaSeconds);
  }
}

import type {
  Entity,
  MonsterBehaviorState,
  MonsterState,
  Transform,
  MilitiaState,
  MilitiaTag,
} from '../ecs/components';
import { RESOURCE_NODE_TYPES } from '../ecs/components';
import {
  getTile,
  gridIndex,
  removeEntity,
  spawnMonster,
  spawnVillager,
  spawnMilitia,
  spawnResourceNode,
  getResourcePlacementCandidates,
  type FloatingNumber,
  type World,
} from '../ecs/world';
import { consumeIntents, beginTick } from './intents';
import { findPath, findPathBfs } from './pathfinding';
import { GameEvent, type GameEventPayloads, type GameEventMessage } from './events/GameEvents';
import type { DarkEnergyMarkerView } from '../render/state';
import type { VillageMood, TilePosition } from './simulation/entities';
import type { MonsterKind, ResourceType } from './balance';
import { reportCheckPass, reportCheckFail } from '../utils/checks';

export type System = (world: World) => void;

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
    militiaAiSystem,
    monsterAiSystem,
    darkLordSystem,
    corruptionSystem,
    spawningSystem,
    resourceSpawnerSystem,
    economySystem,
    winLossSystem,
    renderSyncSystem,
  ];
}

function timeSystem(world: World): void {
  beginTick(world.intents);
  world.events.length = 0;
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
    const threshold = world.balance.militia.autoSpawnStockpileThreshold;
    if (
      threshold >= 0 &&
      village.resourceStockpile > threshold &&
      world.entityManager.getActiveMilitiaCount(entity) === 0
    ) {
      spawnMilitia(world, entity);
    }
  }
}

function villagerAiSystem(world: World): void {
  if (world.components.villagers.size === 0) {
    return;
  }

  villagerTaskSystem(world);
  villagerMovementSystem(world);
  gatheringSystem(world);
  returnSystem(world);
}

function villagerTaskSystem(world: World): void {
  if (world.components.resource.size === 0) {
    return;
  }

  const reservedResources = new Set<Entity>();
  for (const [, intent] of world.components.taskIntents.entries()) {
    if ((intent.type === 'gather' || intent.type === 'gathering') && intent.resourceId !== undefined) {
      reservedResources.add(intent.resourceId);
    }
  }

  for (const [villagerId] of world.components.villagers.entries()) {
    if (world.components.taskIntents.has(villagerId)) {
      continue;
    }
    if (world.components.inventories.has(villagerId)) {
      continue;
    }
    const transform = world.components.transforms.get(villagerId);
    if (!transform) {
      continue;
    }

    const target = findNearestResourceEntity(world, transform.tileX, transform.tileY, reservedResources);
    if (!target) {
      continue;
    }

    reservedResources.add(target.entity);
    world.components.taskIntents.set(villagerId, {
      type: 'gather',
      targetTile: { x: target.transform.tileX, y: target.transform.tileY },
      resourceId: target.entity,
    });
  }
}

function villagerMovementSystem(world: World): void {
  if (world.components.taskIntents.size === 0) {
    return;
  }

  for (const [villagerId, intent] of world.components.taskIntents.entries()) {
    const transform = world.components.transforms.get(villagerId);
    if (!transform) {
      continue;
    }

    if (intent.type === 'gather') {
      if (intent.resourceId !== undefined && !world.components.resource.has(intent.resourceId)) {
        world.components.taskIntents.delete(villagerId);
        continue;
      }
    }

    if (intent.type === 'gathering') {
      if (intent.resourceId !== undefined && !world.components.resource.has(intent.resourceId)) {
        world.components.taskIntents.delete(villagerId);
      }
      continue;
    }

    const target = intent.targetTile;
    if (!target) {
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    if (transform.tileX === target.x && transform.tileY === target.y) {
      if (intent.type === 'gather') {
        world.components.taskIntents.set(villagerId, {
          ...intent,
          type: 'gathering',
        });
      }
      continue;
    }

    const dx = target.x - transform.tileX;
    const dy = target.y - transform.tileY;
    if (dx !== 0) {
      transform.tileX += dx > 0 ? 1 : -1;
    } else if (dy !== 0) {
      transform.tileY += dy > 0 ? 1 : -1;
    }
    updateEntityPosition(world, villagerId, transform.tileX, transform.tileY);
  }
}

function gatheringSystem(world: World): void {
  if (world.components.taskIntents.size === 0) {
    return;
  }

  for (const [villagerId, intent] of world.components.taskIntents.entries()) {
    if (intent.type !== 'gathering') {
      continue;
    }

    const transform = world.components.transforms.get(villagerId);
    if (!transform) {
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    const resourceEntity =
      intent.resourceId !== undefined
        ? intent.resourceId
        : findResourceAtTile(world, transform.tileX, transform.tileY);
    if (resourceEntity === null) {
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    const resource = world.components.resource.get(resourceEntity);
    const resourceTransform = world.components.transforms.get(resourceEntity);
    if (!resource || !resourceTransform) {
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    if (resource.amount <= 0) {
      removeEntity(world, resourceEntity);
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    if (resourceTransform.tileX !== transform.tileX || resourceTransform.tileY !== transform.tileY) {
      continue;
    }

    world.components.inventories.set(villagerId, {
      resourceType: resource.type,
      amount: resource.amount,
    });
    removeEntity(world, resourceEntity);

    const returnTarget = findReturnTarget(world, villagerId, transform.tileX, transform.tileY);
    if (returnTarget) {
      world.components.taskIntents.set(villagerId, {
        type: 'return',
        targetTile: returnTarget,
      });
    } else {
      deliverInventory(world, villagerId);
      world.components.taskIntents.delete(villagerId);
    }
  }
}

function returnSystem(world: World): void {
  if (world.components.taskIntents.size === 0) {
    return;
  }

  for (const [villagerId, intent] of world.components.taskIntents.entries()) {
    if (intent.type !== 'return') {
      continue;
    }

    const inventory = world.components.inventories.get(villagerId);
    if (!inventory) {
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    const transform = world.components.transforms.get(villagerId);
    if (!transform) {
      deliverInventory(world, villagerId);
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    const target = intent.targetTile ?? findReturnTarget(world, villagerId, transform.tileX, transform.tileY);
    if (!target) {
      deliverInventory(world, villagerId);
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    if (transform.tileX === target.x && transform.tileY === target.y) {
      deliverInventory(world, villagerId);
      world.components.taskIntents.delete(villagerId);
      continue;
    }

    if (intent.targetTile === null || intent.targetTile.x !== target.x || intent.targetTile.y !== target.y) {
      world.components.taskIntents.set(villagerId, {
        ...intent,
        targetTile: target,
      });
    }
  }
}

interface NearestResourceResult {
  entity: Entity;
  transform: Transform;
  distance: number;
}

function findNearestResourceEntity(
  world: World,
  startX: number,
  startY: number,
  reserved: Set<Entity>,
): NearestResourceResult | null {
  let best: NearestResourceResult | null = null;
  for (const [resourceId] of world.components.resource.entries()) {
    if (reserved.has(resourceId)) {
      continue;
    }
    const transform = world.components.transforms.get(resourceId);
    if (!transform) {
      continue;
    }
    const resource = world.components.resource.get(resourceId);
    if (!resource || resource.amount <= 0) {
      continue;
    }
    const distance = Math.abs(transform.tileX - startX) + Math.abs(transform.tileY - startY);
    if (!best) {
      best = { entity: resourceId, transform, distance };
      continue;
    }
    if (distance < best.distance) {
      best = { entity: resourceId, transform, distance };
      continue;
    }
    if (distance === best.distance) {
      if (transform.tileX < best.transform.tileX) {
        best = { entity: resourceId, transform, distance };
        continue;
      }
      if (transform.tileX === best.transform.tileX && transform.tileY < best.transform.tileY) {
        best = { entity: resourceId, transform, distance };
      }
    }
  }
  return best;
}

function findResourceAtTile(world: World, x: number, y: number): Entity | null {
  for (const [resourceId] of world.components.resource.entries()) {
    const transform = world.components.transforms.get(resourceId);
    if (!transform) {
      continue;
    }
    if (transform.tileX === x && transform.tileY === y) {
      return resourceId;
    }
  }
  return null;
}

function findReturnTarget(world: World, villagerId: Entity, x: number, y: number): TilePosition | null {
  const villager = world.components.villagers.get(villagerId);
  if (villager) {
    const homeTransform = world.components.transforms.get(villager.homeVillageId);
    if (homeTransform) {
      return { x: homeTransform.tileX, y: homeTransform.tileY };
    }
  }

  let best: { target: TilePosition; distance: number } | null = null;
  for (const [villageId] of world.components.villages.entries()) {
    const transform = world.components.transforms.get(villageId);
    if (!transform) {
      continue;
    }
    const distance = Math.abs(transform.tileX - x) + Math.abs(transform.tileY - y);
    if (!best || distance < best.distance) {
      best = { target: { x: transform.tileX, y: transform.tileY }, distance };
    } else if (distance === best.distance) {
      if (transform.tileX < best.target.x) {
        best = { target: { x: transform.tileX, y: transform.tileY }, distance };
      } else if (transform.tileX === best.target.x && transform.tileY < best.target.y) {
        best = { target: { x: transform.tileX, y: transform.tileY }, distance };
      }
    }
  }
  return best?.target ?? null;
}

function deliverInventory(world: World, villagerId: Entity): void {
  const inventory = world.components.inventories.get(villagerId);
  if (!inventory) {
    return;
  }

  const { resourceType, amount } = inventory;
  if (amount > 0) {
    const current = world.meta.resources[resourceType] ?? 0;
    world.meta.resources[resourceType] = current + amount;
    world.stats.resourcesGathered += amount;

    const villager = world.components.villagers.get(villagerId);
    if (villager) {
      const village = world.components.villages.get(villager.homeVillageId);
      if (village) {
        const configKey: ResourceType | null =
          resourceType === 'stone' ? 'ore' : (resourceType as ResourceType);
        const resourceDef =
          configKey && configKey in world.balance.resources.types
            ? world.balance.resources.types[configKey]
            : null;
        if (resourceDef) {
          village.deliverResources(amount, resourceDef.effects);
        } else {
          village.addResources(amount);
        }
      }
    }
  }

  world.components.inventories.delete(villagerId);
}

function updateEntityPosition(world: World, entity: Entity, x: number, y: number): void {
  const position = world.components.positions.get(entity);
  if (position) {
    position.x = x;
    position.y = y;
  } else {
    world.components.positions.set(entity, { x, y });
  }
}

function militiaAiSystem(world: World): void {
  if (world.components.militia.size === 0) {
    return;
  }

  const attackDamage = Math.max(0, world.balance.militia.attackDamage);

  for (const [entity, militia] of world.components.militia.entries()) {
    const transform = world.components.transforms.get(entity);
    const state = world.components.militiaState.get(entity);
    if (!transform || !state) {
      continue;
    }

    state.moveCooldown = Math.max(0, state.moveCooldown - 1);
    state.attackCooldown = Math.max(0, state.attackCooldown - 1);
    if (state.pauseTimer > 0) {
      state.pauseTimer = Math.max(0, state.pauseTimer - 1);
    }

    const villageTransform = world.components.transforms.get(militia.villageId);
    const intruder = findMonsterOnVillageTile(world, militia.villageId);
    if (intruder) {
      state.behavior = { type: 'engage', targetId: intruder };
      state.pauseTimer = 0;
    } else if (state.behavior.type === 'engage') {
      const path = computeMilitiaReturnPath(world, transform, state, villageTransform);
      if (path.length === 0) {
        state.behavior = { type: 'patrol' };
        state.pauseTimer = state.pauseDuration;
      } else {
        state.behavior = { type: 'return', path };
      }
    }

    switch (state.behavior.type) {
      case 'patrol': {
        handleMilitiaPatrol(world, transform, state);
        break;
      }
      case 'engage': {
        handleMilitiaEngage(world, transform, state, attackDamage, villageTransform);
        break;
      }
      case 'return': {
        handleMilitiaReturn(world, transform, state);
        break;
      }
      default: {
        const exhaustive: never = state.behavior;
        throw new Error(`Unhandled militia behavior ${(exhaustive as { type: string }).type}`);
      }
    }
  }
}

function monsterAiSystem(world: World): void {
  if (world.components.monster.size === 0) {
    return;
  }

  const balance = world.balance;
  const occupied = new Set<number>();
  for (const [, transform] of world.components.transforms.entries()) {
    occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
  }

  const villagerTransforms = new Map<Entity, Transform>();
  for (const [entity] of world.components.villagers.entries()) {
    const transform = world.components.transforms.get(entity);
    if (transform) {
      villagerTransforms.set(entity, transform);
    }
  }

  const villageEdgeTargets = gatherVillageEdgeTargets(world);
  const corruptingTiles = new Set<number>();

  for (const [entity, monster] of world.components.monster.entries()) {
    const state = world.components.monsterState.get(entity);
    const transform = world.components.transforms.get(entity);
    if (!state || !transform) {
      continue;
    }

    const moveDelay = Math.max(
      1,
      Math.round(
        (balance.monsters.base.stepIntervalMs / 1000) *
          balance.ticksPerSecond /
          balance.monsters.kinds[monster.kind].speedMul,
      ),
    );
    const attackDelay = Math.max(
      1,
      Math.round((balance.monsters.base.attack.cooldownMs / 1000) * balance.ticksPerSecond),
    );

    state.moveCooldown = Math.max(0, state.moveCooldown - 1);
    state.attackCooldown = Math.max(0, state.attackCooldown - 1);
    state.scanCooldown = Math.max(0, state.scanCooldown - 1);

    if (!state.behavior) {
      state.behavior = createMonsterRoamState(world);
    }

    if (handleAttackState(world, entity, state, transform, attackDelay, occupied, villagerTransforms)) {
      state.moveCooldown = moveDelay;
      handleTownContact(world, transform.tileX, transform.tileY, corruptingTiles);
      continue;
    }

    if (state.scanCooldown === 0) {
      const radius = Math.max(3, Math.min(5, Math.floor(world.rng.range(3, 6))));
      const villagerTarget = findNearestVillagerWithinRadius(
        transform.tileX,
        transform.tileY,
        radius,
        villagerTransforms,
      );
      if (villagerTarget !== null) {
        state.behavior = { type: 'chaseVillager', targetId: villagerTarget };
      } else {
        state.behavior = createWanderTowardVillageState(
          world,
          transform.tileX,
          transform.tileY,
          villageEdgeTargets,
          occupied,
        );
      }
      state.scanCooldown = Math.max(1, Math.round(balance.ticksPerSecond * 0.5));
    }

    if (state.moveCooldown > 0) {
      handleTownContact(world, transform.tileX, transform.tileY, corruptingTiles);
      continue;
    }

    switch (state.behavior.type) {
      case 'roam': {
        const moved = performMonsterRoam(world, transform, occupied);
        const remaining = Math.max(0, state.behavior.remainingTicks - 1);
        if (!moved) {
          state.behavior = createWanderTowardVillageState(
            world,
            transform.tileX,
            transform.tileY,
            villageEdgeTargets,
            occupied,
          );
        } else if (remaining > 0) {
          state.behavior = { type: 'roam', remainingTicks: remaining };
        } else {
          state.behavior = createWanderTowardVillageState(
            world,
            transform.tileX,
            transform.tileY,
            villageEdgeTargets,
            occupied,
          );
        }
        state.moveCooldown = moveDelay;
        break;
      }
      case 'chaseVillager': {
        const villagerTransform = villagerTransforms.get(state.behavior.targetId);
        if (!villagerTransform) {
          state.behavior = createMonsterRoamState(world);
          state.scanCooldown = 0;
          state.moveCooldown = moveDelay;
          break;
        }
        const distance =
          Math.abs(villagerTransform.tileX - transform.tileX) +
          Math.abs(villagerTransform.tileY - transform.tileY);
        if (distance <= 1) {
          state.behavior = { type: 'attackVillager', targetId: state.behavior.targetId };
          handleAttackState(world, entity, state, transform, attackDelay, occupied, villagerTransforms);
          state.moveCooldown = moveDelay;
          break;
        }
        const path = findPathBfs(
          world.grid,
          { x: transform.tileX, y: transform.tileY },
          { x: villagerTransform.tileX, y: villagerTransform.tileY },
          (x, y) => canMonsterStep(world, occupied, x, y, transform.tileX, transform.tileY),
        );
        if (path.length <= 1) {
          state.behavior = createMonsterRoamState(world);
          state.scanCooldown = 0;
          state.moveCooldown = moveDelay;
          break;
        }
        const next = path[1];
        if (next.x === villagerTransform.tileX && next.y === villagerTransform.tileY) {
          state.behavior = { type: 'attackVillager', targetId: state.behavior.targetId };
          handleAttackState(world, entity, state, transform, attackDelay, occupied, villagerTransforms);
          state.moveCooldown = moveDelay;
          break;
        }
        moveMonster(world, transform, next, occupied);
        state.moveCooldown = moveDelay;
        break;
      }
      case 'wanderTowardVillage': {
        if (!state.behavior.target) {
          state.behavior = createMonsterRoamState(world);
          state.moveCooldown = moveDelay;
          break;
        }
        const path = findPathBfs(
          world.grid,
          { x: transform.tileX, y: transform.tileY },
          state.behavior.target,
          (x, y) => canMonsterStep(world, occupied, x, y, transform.tileX, transform.tileY),
        );
        if (path.length <= 1) {
          state.moveCooldown = moveDelay;
          break;
        }
        const next = path[1];
        moveMonster(world, transform, next, occupied);
        state.moveCooldown = moveDelay;
        break;
      }
      case 'attackVillager': {
        handleAttackState(world, entity, state, transform, attackDelay, occupied, villagerTransforms);
        state.moveCooldown = moveDelay;
        break;
      }
      default: {
        const exhaustive: never = state.behavior;
        throw new Error(`Unhandled monster behavior state ${(exhaustive as { type: string }).type}`);
      }
    }

    handleTownContact(world, transform.tileX, transform.tileY, corruptingTiles);
  }

  for (let i = 0; i < world.grid.tiles.length; i += 1) {
    const tile = world.grid.tiles[i];
    if (tile.type === 'town') {
      tile.corrupting = corruptingTiles.has(i);
    }
  }
}

function createMonsterRoamState(world: World): MonsterBehaviorState {
  const duration = Math.max(1, Math.round(world.rng.range(0.5, 1.5) * world.balance.ticksPerSecond));
  return { type: 'roam', remainingTicks: duration };
}

function performMonsterRoam(world: World, transform: Transform, occupied: Set<number>): boolean {
  const options = neighborTiles(world.grid, transform.tileX, transform.tileY).filter((pos) =>
    canMonsterStep(world, occupied, pos.x, pos.y, transform.tileX, transform.tileY),
  );
  if (options.length === 0) {
    return false;
  }
  const choice = options[Math.floor(world.rng.range(0, options.length))];
  moveMonster(world, transform, choice, occupied);
  return true;
}

function gatherVillageEdgeTargets(world: World): Array<{ position: TilePosition; townId: Entity }> {
  const targets: Array<{ position: TilePosition; townId: Entity }> = [];
  const seen = new Set<number>();
  for (const [entity] of world.components.town.entries()) {
    const transform = world.components.transforms.get(entity);
    if (!transform) {
      continue;
    }
    for (const neighbor of neighborTiles(world.grid, transform.tileX, transform.tileY)) {
      const idx = gridIndex(world.grid, neighbor.x, neighbor.y);
      if (seen.has(idx)) {
        continue;
      }
      seen.add(idx);
      targets.push({ position: neighbor, townId: entity });
    }
  }
  return targets;
}

function createWanderTowardVillageState(
  world: World,
  startX: number,
  startY: number,
  targets: Array<{ position: TilePosition; townId: Entity }>,
  occupied: Set<number>,
): MonsterBehaviorState {
  if (targets.length === 0) {
    return createMonsterRoamState(world);
  }
  let best: { target: TilePosition; length: number; townId: Entity } | null = null;
  for (const candidate of targets) {
    const path = findPathBfs(
      world.grid,
      { x: startX, y: startY },
      candidate.position,
      (x, y) => canMonsterStep(world, occupied, x, y, startX, startY),
    );
    if (path.length === 0) {
      continue;
    }
    if (!best || path.length < best.length) {
      best = { target: candidate.position, length: path.length, townId: candidate.townId };
    }
  }
  if (!best) {
    reportCheckFail('monsterPathTown', 'No path found to any town edge');
    return createMonsterRoamState(world);
  }
  reportCheckPass('monsterPathTown', `Targeting town ${best.townId}`);
  return { type: 'wanderTowardVillage', target: best.target };
}

function findNearestVillagerWithinRadius(
  fromX: number,
  fromY: number,
  radius: number,
  villagers: Map<Entity, Transform>,
): Entity | null {
  let bestId: Entity | null = null;
  let bestDist = radius + 1;
  for (const [entity, transform] of villagers.entries()) {
    const dist = Math.abs(transform.tileX - fromX) + Math.abs(transform.tileY - fromY);
    if (dist > radius) {
      continue;
    }
    if (dist < bestDist || (dist === bestDist && (bestId === null || entity < bestId))) {
      bestDist = dist;
      bestId = entity;
    }
  }
  return bestId;
}

function handleAttackState(
  world: World,
  monsterId: Entity,
  state: MonsterState,
  monsterTransform: Transform,
  attackDelay: number,
  occupied: Set<number>,
  villagerTransforms: Map<Entity, Transform>,
): boolean {
  if (state.behavior.type !== 'attackVillager') {
    return false;
  }
  if (state.attackCooldown > 0) {
    return true;
  }
  const killedPosition = killVillagerEntity(
    world,
    state.behavior.targetId,
    monsterId,
    occupied,
    villagerTransforms,
  );
  if (killedPosition) {
    moveMonster(world, monsterTransform, killedPosition, occupied);
  }
  state.attackCooldown = attackDelay;
  state.behavior = createMonsterRoamState(world);
  state.scanCooldown = 0;
  return true;
}

function killVillagerEntity(
  world: World,
  villagerId: Entity,
  killerId: Entity,
  occupied: Set<number>,
  villagerTransforms: Map<Entity, Transform>,
): TilePosition | null {
  const transform = world.components.transforms.get(villagerId);
  if (!transform) {
    villagerTransforms.delete(villagerId);
    return null;
  }
  const villageId = world.entityManager.getHomeVillage(villagerId);
  const tileIndex = gridIndex(world.grid, transform.tileX, transform.tileY);
  occupied.delete(tileIndex);
  villagerTransforms.delete(villagerId);
  emitGameEvent(world, GameEvent.VillagerKilled, {
    villagerId,
    villageId,
    killerId,
  });
  const position: TilePosition = { x: transform.tileX, y: transform.tileY };
  removeEntity(world, villagerId);
  return position;
}

function moveMonster(world: World, transform: Transform, next: TilePosition, occupied: Set<number>): void {
  const currentIdx = gridIndex(world.grid, transform.tileX, transform.tileY);
  occupied.delete(currentIdx);
  transform.tileX = next.x;
  transform.tileY = next.y;
  occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
}

function canMonsterStep(
  world: World,
  occupied: Set<number>,
  x: number,
  y: number,
  startX: number,
  startY: number,
): boolean {
  if (x < 0 || y < 0 || x >= world.grid.width || y >= world.grid.height) {
    return false;
  }
  const tile = getTile(world.grid, x, y);
  if (!tile) {
    return false;
  }
  if (x === startX && y === startY) {
    return true;
  }
  const idx = gridIndex(world.grid, x, y);
  return !occupied.has(idx);
}

function emitGameEvent<K extends GameEvent>(
  world: World,
  type: K,
  payload: GameEventPayloads[K],
): void {
  const message: GameEventMessage = { type, payload } as GameEventMessage;
  world.events.push(message);
}

function handleTownContact(world: World, tileX: number, tileY: number, corruptingTiles: Set<number>): void {
  let targetX = tileX;
  let targetY = tileY;
  let tile = getTile(world.grid, tileX, tileY);
  let townEntity = tile?.type === 'town' ? findTownAt(world, tileX, tileY) : undefined;

  if (!townEntity) {
    for (const neighbor of neighborTiles(world.grid, tileX, tileY)) {
      const neighborTile = getTile(world.grid, neighbor.x, neighbor.y);
      if (neighborTile?.type !== 'town') {
        continue;
      }
      const townAtNeighbor = findTownAt(world, neighbor.x, neighbor.y);
      if (townAtNeighbor) {
        targetX = neighbor.x;
        targetY = neighbor.y;
        tile = neighborTile;
        townEntity = townAtNeighbor;
        break;
      }
    }
  }

  if (!townEntity || !tile || tile.type !== 'town') {
    return;
  }

  const town = world.components.town.get(townEntity);
  if (!town) {
    return;
  }
  const balance = world.balance;
  corruptingTiles.add(gridIndex(world.grid, targetX, targetY));
  const damage = balance.monsters.base.attack.damage;
  if (damage <= 0) {
    reportCheckFail('monsterDamageTown', 'Monster attack damage is non-positive');
    return;
  }
  const previousIntegrity = town.integrity;
  town.integrity = Math.max(0, town.integrity - damage);
  if (town.integrity === 0 && previousIntegrity > 0) {
    reportCheckPass('monsterDamageTown', 'Town destroyed');
  } else if (town.integrity < previousIntegrity) {
    reportCheckPass('monsterDamageTown', `Integrity reduced to ${town.integrity}`);
  } else {
    reportCheckFail('monsterDamageTown', 'Monster attack failed to damage town');
  }
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
  const spawner = world.monsterSpawner;
  spawner.timer -= 1;

  if (spawner.timer <= 0) {
    const occupied = new Set<number>();
    for (const [, transform] of world.components.transforms.entries()) {
      occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
    }

    const villagerCount = world.components.villagers.size;
    const waveBase = 1 + Math.floor(world.time.tick / Math.max(1, world.balance.ticksPerSecond * 60));
    const populationPressure = Math.max(0, Math.floor(villagerCount / Math.max(1, Math.round(world.balance.villages.initial.capacity / 2))));
    const spawnCount = Math.max(1, waveBase + populationPressure);

    for (let i = 0; i < spawnCount; i += 1) {
      const spawnTile = findEdgeSpawnPosition(world, occupied);
      if (!spawnTile) {
        reportCheckFail('edgeSpawn', 'No edge spawn tile available');
        break;
      }
      const isEdge =
        spawnTile.x === 0 ||
        spawnTile.y === 0 ||
        spawnTile.x === world.grid.width - 1 ||
        spawnTile.y === world.grid.height - 1;
      if (!isEdge) {
        reportCheckFail('edgeSpawn', `Spawned at non-edge tile (${spawnTile.x}, ${spawnTile.y})`);
      } else {
        reportCheckPass('edgeSpawn', `Edge tile (${spawnTile.x}, ${spawnTile.y})`);
      }
      const kind = selectSpawnMonsterKind(world, spawner.wavesSpawned, villagerCount);
      spawnMonster(world, spawnTile.x, spawnTile.y, kind);
      occupied.add(gridIndex(world.grid, spawnTile.x, spawnTile.y));
    }

    spawner.wavesSpawned += 1;
    const difficulty = 1 + spawner.wavesSpawned / 3 + world.time.tick / Math.max(1, world.balance.ticksPerSecond * 90);
    const pressure = 1 + villagerCount / Math.max(1, world.balance.villages.initial.capacity);
    const intervalDivisor = Math.max(1, difficulty + pressure / 2);
    const rawInterval = Math.round(spawner.baseIntervalTicks / intervalDivisor);
    const safeInterval = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : spawner.minIntervalTicks;
    if (!Number.isFinite(rawInterval) || rawInterval <= 0) {
      reportCheckFail('endlessWaves', `Invalid spawn interval computed: ${rawInterval}`);
    } else {
      reportCheckPass('endlessWaves', `Next wave scheduled in ${safeInterval} ticks`);
    }
    spawner.timer = Math.max(spawner.minIntervalTicks, safeInterval);
  }

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

function findEdgeSpawnPosition(world: World, occupied: Set<number>): TilePosition | null {
  const candidates: TilePosition[] = [];
  const width = world.grid.width;
  const height = world.grid.height;
  for (let x = 0; x < width; x += 1) {
    candidates.push({ x, y: 0 });
    if (height > 1) {
      candidates.push({ x, y: height - 1 });
    }
  }
  for (let y = 1; y < height - 1; y += 1) {
    candidates.push({ x: 0, y });
    if (width > 1) {
      candidates.push({ x: width - 1, y });
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  shuffleInPlace(candidates, world.rng);
  for (const candidate of candidates) {
    if (canMonsterSpawnAt(world, candidate.x, candidate.y, occupied)) {
      return candidate;
    }
  }
  return null;
}

function canMonsterSpawnAt(world: World, x: number, y: number, occupied: Set<number>): boolean {
  const tile = getTile(world.grid, x, y);
  if (!tile || tile.type === 'town') {
    return false;
  }
  const idx = gridIndex(world.grid, x, y);
  return !occupied.has(idx);
}

function selectSpawnMonsterKind(world: World, waveCount: number, villagerCount: number): MonsterKind {
  if (villagerCount >= 12 && 'brute' in world.balance.monsters.kinds) {
    return 'brute';
  }
  if ((waveCount >= 4 || villagerCount >= 6) && 'wisp' in world.balance.monsters.kinds) {
    return 'wisp';
  }
  return 'imp';
}

function resourceSpawnerSystem(world: World): void {
  if (world.time.tick % 30 !== 0) {
    return;
  }

  const candidates = getResourcePlacementCandidates(world);
  if (candidates.length === 0) {
    return;
  }

  const tileIndex = Math.floor(world.rng.range(0, candidates.length));
  const candidate = candidates[tileIndex];
  const typeIndex = Math.floor(world.rng.range(0, RESOURCE_NODE_TYPES.length));
  const type = RESOURCE_NODE_TYPES[typeIndex];
  spawnResourceNode(world, candidate.x, candidate.y, type, 1);
}

function economySystem(world: World): void {
  // Currently economy updates occur on kill events.
  // Clamp values to non-negative to avoid numeric drift.
  world.economy.gold = Math.max(0, world.economy.gold);
  world.economy.shards = Math.max(0, world.economy.shards);
}

function finishRun(
  world: World,
  status: 'won' | 'lost',
  reason: string,
  completed: 'survival' | 'resource' | 'extinction',
): void {
  if (world.runState.status !== 'running') {
    return;
  }
  world.runState.status = status;
  world.runState.reason = reason;
  world.runState.completedCondition = completed;
  world.runState.finalTimeSeconds = world.time.seconds;
  world.runState.endTick = world.time.tick;
}

function winLossSystem(world: World): void {
  if (world.runState.status !== 'running') {
    return;
  }

  const villageEntry = world.components.villages.entries().next();
  const village = villageEntry.done ? null : villageEntry.value[1];
  if (village && world.runState.populationEverPositive && village.population <= 0) {
    finishRun(world, 'lost', 'All villagers were lost.', 'extinction');
    return;
  }

  const surviveGoalSeconds = Math.max(0, Math.round(world.balance.victory.surviveMinutes * 60));
  if (surviveGoalSeconds > 0 && world.time.seconds >= surviveGoalSeconds) {
    finishRun(world, 'won', 'You survived the required time.', 'survival');
    return;
  }

  const resourceGoal = Math.max(0, world.balance.victory.resourceGoal);
  if (resourceGoal > 0 && world.stats.resourcesGathered >= resourceGoal) {
    finishRun(world, 'won', 'You gathered enough resources.', 'resource');
  }
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

  snapshot.resources = [];
  for (const [entity, resource] of world.components.resource.entries()) {
    const transform = world.components.transforms.get(entity);
    if (!transform) {
      continue;
    }
    snapshot.resources.push({
      id: entity,
      tileX: transform.tileX,
      tileY: transform.tileY,
      type: resource.type,
      amount: resource.amount,
    });
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
      const villager = world.components.villagers.get(entity)!;
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'villager',
        panic: villager.panicActive,
      });
    } else if (world.components.militia.has(entity)) {
      const health = world.components.health.get(entity);
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
        spriteId: renderIso.spriteId,
        kind: 'militia',
        hp: health?.hp,
        hpMax: health?.max,
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
  let activeGatherers = 0;
  for (const [, intent] of world.components.taskIntents.entries()) {
    if (intent.type === 'gather' || intent.type === 'gathering' || intent.type === 'return') {
      activeGatherers += 1;
    }
  }
  let monstersChasingVillagers = 0;
  for (const [, monsterState] of world.components.monsterState.entries()) {
    const behavior = monsterState.behavior.type;
    if (behavior === 'chaseVillager' || behavior === 'attackVillager') {
      monstersChasingVillagers += 1;
    }
  }
  const surviveGoalSeconds = Math.max(0, Math.round(world.balance.victory.surviveMinutes * 60));
  const resourceGoal = Math.max(0, world.balance.victory.resourceGoal);
  const timeSurvived =
    world.runState.status === 'running' ? world.time.seconds : world.runState.finalTimeSeconds;
  const townsAlive = world.components.town.size;
  const nextWaveSeconds =
    Math.max(0, world.monsterSpawner.timer) / Math.max(1, world.balance.ticksPerSecond);
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
    townsAlive,
    nextWaveSeconds,
  };
  snapshot.run = {
    status: world.runState.status,
    timeSurvivedSeconds: timeSurvived,
    villagersBorn: world.stats.villagersBorn,
    resourcesGathered: world.stats.resourcesGathered,
    surviveGoalSeconds,
    resourceGoal,
    completedCondition: world.runState.completedCondition,
    reason: world.runState.reason,
  };
  snapshot.debug = {
    villagerCount,
    monsterCount: world.components.monster.size,
    activeGatherers,
    monstersChasingVillagers,
    resourceStockpile,
  };
}

function handleMilitiaPatrol(world: World, transform: Transform, state: MilitiaState): void {
  if (state.patrolRoute.length === 0) {
    return;
  }
  const target = state.patrolRoute[state.patrolIndex % state.patrolRoute.length];
  if (transform.tileX === target.x && transform.tileY === target.y) {
    state.patrolIndex = (state.patrolIndex + 1) % state.patrolRoute.length;
    state.pauseTimer = state.pauseDuration;
    return;
  }
  if (state.pauseTimer > 0 || state.moveCooldown > 0) {
    return;
  }
  const path = computePath(world, transform.tileX, transform.tileY, target.x, target.y);
  if (!path || path.length === 0) {
    state.patrolIndex = (state.patrolIndex + 1) % state.patrolRoute.length;
    state.pauseTimer = state.pauseDuration;
    return;
  }
  const next = path[0];
  if (next) {
    transform.tileX = next.x;
    transform.tileY = next.y;
    state.moveCooldown = state.moveInterval;
  }
}

function handleMilitiaEngage(
  world: World,
  transform: Transform,
  state: MilitiaState,
  attackDamage: number,
  villageTransform: Transform | undefined,
): void {
  if (state.behavior.type !== 'engage') {
    return;
  }
  const targetId = state.behavior.targetId;
  const targetTransform = world.components.transforms.get(targetId);
  if (!targetTransform || !world.components.monster.has(targetId)) {
    const path = computeMilitiaReturnPath(world, transform, state, villageTransform);
    if (path.length === 0) {
      state.behavior = { type: 'patrol' };
      state.pauseTimer = state.pauseDuration;
    } else {
      state.behavior = { type: 'return', path };
    }
    return;
  }

  const distance =
    Math.abs(targetTransform.tileX - transform.tileX) +
    Math.abs(targetTransform.tileY - transform.tileY);

  if (distance <= 1) {
    if (state.attackCooldown > 0) {
      return;
    }
    const health = world.components.health.get(targetId);
    if (health) {
      health.hp = Math.max(0, health.hp - attackDamage);
      if (health.hp <= 0) {
        onEntityDefeated(world, targetId);
        const path = computeMilitiaReturnPath(world, transform, state, villageTransform);
        if (path.length === 0) {
          state.behavior = { type: 'patrol' };
          state.pauseTimer = state.pauseDuration;
        } else {
          state.behavior = { type: 'return', path };
        }
      }
    }
    state.attackCooldown = state.attackInterval;
    return;
  }

  if (state.moveCooldown > 0) {
    return;
  }
  const path = computePath(world, transform.tileX, transform.tileY, targetTransform.tileX, targetTransform.tileY);
  if (!path || path.length === 0) {
    const returnPath = computeMilitiaReturnPath(world, transform, state, villageTransform);
    if (returnPath.length === 0) {
      state.behavior = { type: 'patrol' };
      state.pauseTimer = state.pauseDuration;
    } else {
      state.behavior = { type: 'return', path: returnPath };
    }
    return;
  }
  const next = path[0];
  if (next) {
    transform.tileX = next.x;
    transform.tileY = next.y;
    state.moveCooldown = state.moveInterval;
  }
}

function handleMilitiaReturn(world: World, transform: Transform, state: MilitiaState): void {
  if (state.behavior.type !== 'return') {
    return;
  }
  if (state.behavior.path.length === 0) {
    state.behavior = { type: 'patrol' };
    state.pauseTimer = state.pauseDuration;
    return;
  }
  if (state.moveCooldown > 0) {
    return;
  }
  const next = state.behavior.path.shift();
  if (!next) {
    state.behavior = { type: 'patrol' };
    state.pauseTimer = state.pauseDuration;
    return;
  }
  transform.tileX = next.x;
  transform.tileY = next.y;
  state.moveCooldown = state.moveInterval;
  if (state.behavior.path.length === 0) {
    state.behavior = { type: 'patrol' };
    state.pauseTimer = state.pauseDuration;
  }
}

function computeMilitiaReturnPath(
  world: World,
  transform: Transform,
  state: MilitiaState,
  villageTransform: Transform | undefined,
): TilePosition[] {
  if (state.patrolRoute.length > 0) {
    const target = state.patrolRoute[state.patrolIndex % state.patrolRoute.length];
    const path = computePath(world, transform.tileX, transform.tileY, target.x, target.y);
    if (path && path.length > 0) {
      return [...path];
    }
  }
  if (villageTransform) {
    const fallback = computePath(
      world,
      transform.tileX,
      transform.tileY,
      villageTransform.tileX,
      villageTransform.tileY,
    );
    if (fallback && fallback.length > 0) {
      return [...fallback];
    }
  }
  return [];
}

function findMonsterOnVillageTile(world: World, villageId: Entity): Entity | null {
  const villageTransform = world.components.transforms.get(villageId);
  if (!villageTransform) {
    return null;
  }
  for (const [monsterId] of world.components.monster.entries()) {
    const transform = world.components.transforms.get(monsterId);
    if (!transform) {
      continue;
    }
    const tile = getTile(world.grid, transform.tileX, transform.tileY);
    if (tile?.type !== 'town') {
      continue;
    }
    const townAtTile = findTownAt(world, transform.tileX, transform.tileY);
    if (townAtTile === villageId) {
      return monsterId;
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
    const isEdge =
      candidate.x === padding ||
      candidate.y === padding ||
      candidate.x === world.grid.width - padding - 1 ||
      candidate.y === world.grid.height - padding - 1;
    if (!isEdge) {
      reportCheckFail('edgeSpawn', `Dark wave spawn at non-edge tile (${candidate.x}, ${candidate.y})`);
    } else {
      reportCheckPass('edgeSpawn', `Edge tile (${candidate.x}, ${candidate.y})`);
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

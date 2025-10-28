import type { Entity } from '../ecs/components';
import { getTile, gridIndex, removeEntity, spawnMonster, type FloatingNumber, type World } from '../ecs/world';
import { consumeIntents, beginTick } from './intents';
import { findPath } from './pathfinding';

export type System = (world: World) => void;

export function createSystemPipeline(): System[] {
  return [
    timeSystem,
    inputIntentSystem,
    combatResolutionSystem,
    statusEffectSystem,
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
  const secondsPerTick = 1 / world.balance.ticksPerSecond;
  for (const doom of world.components.doomClock.values()) {
    doom.seconds = Math.max(0, doom.seconds - secondsPerTick);
  }

  for (let i = world.floatingNumbers.length - 1; i >= 0; i -= 1) {
    const fn = world.floatingNumbers[i];
    fn.lifeTicks -= 1;
    if (fn.lifeTicks <= 0) {
      world.floatingNumbers.splice(i, 1);
    }
  }
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
      continue;
    }
    const health = world.components.health.get(target);
    if (!health) {
      continue;
    }
    const { damage, crit } = computeClickDamage(world);
    health.hp = Math.max(0, health.hp - damage);
    if (balance.clickCombat.floatingNumbers) {
      pushFloatingNumber(world, click.tileX, click.tileY, damage, crit);
    }
    if (health.hp <= 0) {
      onEntityDefeated(world, target);
      for (const doom of world.components.doomClock.values()) {
        doom.seconds = Math.max(0, doom.seconds + balance.doomClock.onMonsterKillSeconds);
      }
      const dark = getDarkEnergy(world);
      if (dark) {
        dark.value += balance.darkEnergy.perMonsterKillGain;
      }
    }
  }
  // degrade ability cooldowns implicitly via status system
  for (const doom of world.components.doomClock.values()) {
    doom.seconds = Math.max(0, doom.seconds);
  }
  // reduce doom per action if configured
  if (balance.doomClock.drainPerActionSeconds > 0) {
    for (const _ of clicks) {
      for (const doom of world.components.doomClock.values()) {
        doom.seconds = Math.max(0, doom.seconds - balance.doomClock.drainPerActionSeconds);
      }
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
        tile.corruption = Math.max(
          0,
          tile.corruption - world.balance.town.cleanse.corruptionReductionPerTick,
        );
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
    const corrupt = getTile(world.grid, world.components.transforms.get(entity)?.tileX ?? 0, world.components.transforms.get(entity)?.tileY ?? 0);
    if (corrupt) {
      const increase = world.balance.town.corruptProgressPerTick;
      town.integrity = Math.max(0, town.integrity - increase);
    }
  }

  // dark energy base gain per tick handled in darkLordSystem
}

function monsterAiSystem(world: World): void {
  const balance = world.balance;
  const towns = Array.from(world.components.town.keys());
  if (towns.length === 0) {
    return;
  }
  const townEntity = towns[0];
  const townTransform = world.components.transforms.get(townEntity);
  if (!townTransform) {
    return;
  }

  const occupied = new Set<number>();
  for (const [entity, transform] of world.components.transforms.entries()) {
    occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
  }

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
    const path = findPath(
      world.grid,
      { x: transform.tileX, y: transform.tileY },
      { x: townTransform.tileX, y: townTransform.tileY },
      (x, y) => !occupied.has(gridIndex(world.grid, x, y)) || (x === townTransform.tileX && y === townTransform.tileY),
    );
    if (path.length >= 2) {
      const next = path[1];
      occupied.delete(gridIndex(world.grid, transform.tileX, transform.tileY));
      transform.tileX = next.x;
      transform.tileY = next.y;
      occupied.add(gridIndex(world.grid, transform.tileX, transform.tileY));
    } else if (path.length === 1) {
      // already at town tile -> damage town
      const town = world.components.town.get(townEntity);
      if (town) {
        town.integrity = Math.max(0, town.integrity - balance.monsters.base.attack.damage);
        if (town.integrity === 0) {
          world.components.town.delete(townEntity);
        }
      }
    }
    state.moveCooldown = Math.max(1, Math.round((balance.monsters.base.stepIntervalMs / 1000) * balance.ticksPerSecond / balance.monsters.kinds[monster.kind].speedMul));
    state.attackCooldown = Math.max(0, state.attackCooldown - 1);
  }
}

function darkLordSystem(world: World): void {
  const balance = world.balance;
  const dark = getDarkEnergy(world);
  if (!dark) {
    return;
  }
  const corruptedTiles = world.grid.tiles.filter((tile) => tile.corrupted).length;
  const gainPerTick =
    balance.darkEnergy.baseGainPerSecond / balance.ticksPerSecond +
    (corruptedTiles * balance.darkEnergy.perCorruptedTileGain) / balance.ticksPerSecond;
  dark.value += gainPerTick;

  dark.cadenceCounter += 1;
  if (dark.cadenceCounter >= dark.cadenceTicks) {
    dark.cadenceCounter = 0;
    executeDarkLordAction(world, dark.value);
  }
}

function corruptionSystem(world: World): void {
  const increase = world.balance.corruption.tileIncreasePerTick;
  const decrease = world.balance.corruption.tileDecreasePerTick;
  for (const tile of world.grid.tiles) {
    if (tile.corruption > 0) {
      tile.corruption = Math.min(world.balance.corruption.tileMax, tile.corruption + increase);
    } else {
      tile.corruption = Math.max(0, tile.corruption - decrease);
    }
    tile.corrupted = tile.corruption > 0.0001;
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
    if (world.components.hero.has(entity)) {
      const health = world.components.health.get(entity);
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
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
        kind: 'town',
        integrity: town.integrity,
      });
    } else if (world.components.loot.has(entity)) {
      snapshot.entities.push({
        id: entity,
        tileX: transform.tileX,
        tileY: transform.tileY,
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
  snapshot.hud = {
    doomClockSeconds: doom?.seconds ?? 0,
    darkEnergy: dark?.value ?? 0,
    gold: world.economy.gold,
    warn30: (doom?.seconds ?? 0) <= world.balance.ui.flashThresholds.t30,
    warn10: (doom?.seconds ?? 0) <= world.balance.ui.flashThresholds.t10,
  };
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

function executeDarkLordAction(world: World, availableEnergy: number): void {
  const balance = world.balance;
  const dark = getDarkEnergy(world);
  if (!dark) return;
  if (availableEnergy >= balance.darkEnergy.actions.corruptTile.cost) {
    if (tryCorruptTile(world)) {
      dark.value -= balance.darkEnergy.actions.corruptTile.cost;
      return;
    }
  }
  if (availableEnergy >= balance.darkEnergy.actions.spawnWave.cost) {
    if (trySpawnWave(world)) {
      dark.value -= balance.darkEnergy.actions.spawnWave.cost;
      return;
    }
  }
}

function tryCorruptTile(world: World): boolean {
  const tiles = world.grid.tiles;
  for (const tile of tiles) {
    if (tile.corruption < world.balance.corruption.tileMax) {
      tile.corruption = Math.min(
        world.balance.corruption.tileMax,
        tile.corruption + world.balance.corruption.tileIncreasePerTick * 5,
      );
      tile.corrupted = tile.corruption > 0.0001;
      return true;
    }
  }
  return false;
}

function trySpawnWave(world: World): boolean {
  const town = Array.from(world.components.town.keys())[0];
  if (!town) return false;
  const townTransform = world.components.transforms.get(town);
  if (!townTransform) return false;
  const balance = world.balance;
  const padding = balance.darkEnergy.actions.spawnWave.wave.spawnEdgePadding;
  const positions: Array<{ x: number; y: number }> = [];
  for (let x = padding; x < world.grid.width - padding; x += 1) {
    positions.push({ x, y: padding });
    positions.push({ x, y: world.grid.height - padding - 1 });
  }
  for (let y = padding + 1; y < world.grid.height - padding - 1; y += 1) {
    positions.push({ x: padding, y });
    positions.push({ x: world.grid.width - padding - 1, y });
  }
  if (positions.length === 0) {
    return false;
  }
  for (let i = 0; i < balance.darkEnergy.actions.spawnWave.wave.size; i += 1) {
    const pos = positions[(i + world.time.tick) % positions.length];
    spawnMonster(world, pos.x, pos.y, balance.darkEnergy.actions.spawnWave.wave.monsterKind);
  }
  return true;
}

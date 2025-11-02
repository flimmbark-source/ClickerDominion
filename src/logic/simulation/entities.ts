import type { ResourceProductionEffectConfig, ResourceType } from '../balance';

export type VillageMood = 'normal' | 'boosted' | 'starving';

export interface VillageParameters {
  readonly entityId: number;
  readonly capacity: number;
  readonly initialPopulation: number;
  readonly initialStockpile: number;
  readonly baseSpawnIntervalTicks: number;
  readonly spawnRateBoostMultiplier: number;
  readonly boostThreshold: number;
  readonly starvationThreshold: number;
  readonly consumptionPerVillagerPerTick: number;
  readonly spawnCost: number;
  readonly maxStockpile: number;
}

export interface VillageTickOptions {
  readonly spawnVillager: () => number | null;
}

export class Village {
  readonly entityId: number;
  readonly capacity: number;

  population: number;
  resourceStockpile: number;

  private readonly baseSpawnIntervalTicks: number;
  private readonly spawnRateBoostMultiplier: number;
  private readonly boostThreshold: number;
  private readonly starvationThreshold: number;
  private readonly consumptionPerVillagerPerTick: number;
  private readonly baseSpawnCost: number;
  private readonly maxStockpile: number;

  private spawnTimer: number;
  private mood: VillageMood = 'normal';
  private spawnIntervalBonus = 0;
  private spawnCostReduction = 0;

  constructor(params: VillageParameters) {
    this.entityId = params.entityId;
    this.capacity = params.capacity;
    this.population = params.initialPopulation;
    this.resourceStockpile = params.initialStockpile;
    this.baseSpawnIntervalTicks = Math.max(1, params.baseSpawnIntervalTicks);
    this.spawnRateBoostMultiplier = Math.max(1, params.spawnRateBoostMultiplier);
    this.boostThreshold = Math.max(0, params.boostThreshold);
    this.starvationThreshold = Math.max(0, params.starvationThreshold);
    this.consumptionPerVillagerPerTick = Math.max(0, params.consumptionPerVillagerPerTick);
    this.baseSpawnCost = Math.max(0, params.spawnCost);
    this.maxStockpile = Math.max(0, params.maxStockpile);
    this.spawnTimer = this.baseSpawnIntervalTicks;
    this.updateMood();
  }

  tick(options: VillageTickOptions): boolean {
    this.consumeResources();
    this.updateMood();

    const interval = this.currentSpawnInterval();
    if (this.spawnTimer > interval) {
      this.spawnTimer = interval;
    }

    if (this.population >= this.capacity) {
      this.spawnTimer = interval;
      return false;
    }

    if (this.isStarving()) {
      return false;
    }

    const spawnCost = this.currentSpawnCost();
    if (this.resourceStockpile < spawnCost) {
      return false;
    }

    this.spawnTimer -= 1;
    if (this.spawnTimer > 0) {
      return false;
    }

    if (options.spawnVillager() === null) {
      // Failed spawn attempt; retry later.
      this.spawnTimer = interval;
      return false;
    }

    this.resourceStockpile = Math.max(0, this.resourceStockpile - spawnCost);
    this.updateMood();
    this.spawnTimer = interval;
    return true;
  }

  addResources(amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.resourceStockpile = Math.min(this.maxStockpile, this.resourceStockpile + amount);
    this.updateMood();
  }

  deliverResources(amount: number, effects: ResourceProductionEffectConfig): void {
    if (amount <= 0) {
      return;
    }

    const stockpileGain = amount * Math.max(0, effects.stockpilePerUnit);
    if (stockpileGain > 0) {
      this.resourceStockpile = Math.min(this.maxStockpile, this.resourceStockpile + stockpileGain);
    }

    if (effects.spawnIntervalBonusPerUnit > 0) {
      const bonus = amount * effects.spawnIntervalBonusPerUnit;
      this.spawnIntervalBonus = Math.min(0.8, this.spawnIntervalBonus + bonus);
    }

    if (effects.spawnCostReductionPerUnit > 0) {
      const reduction = amount * effects.spawnCostReductionPerUnit;
      this.spawnCostReduction = Math.min(0.8, this.spawnCostReduction + reduction);
    }

    this.updateMood();
  }

  incrementPopulation(): void {
    this.population = Math.min(this.capacity, this.population + 1);
  }

  decrementPopulation(): void {
    this.population = Math.max(0, this.population - 1);
  }

  getMood(): VillageMood {
    return this.mood;
  }

  private consumeResources(): void {
    if (this.consumptionPerVillagerPerTick <= 0 || this.population <= 0) {
      return;
    }
    const totalConsumption = this.population * this.consumptionPerVillagerPerTick;
    this.resourceStockpile = Math.max(0, this.resourceStockpile - totalConsumption);
  }

  private updateMood(): void {
    if (this.resourceStockpile <= this.starvationThreshold) {
      this.mood = 'starving';
    } else if (this.resourceStockpile >= this.boostThreshold) {
      this.mood = 'boosted';
    } else {
      this.mood = 'normal';
    }
  }

  private currentSpawnInterval(): number {
    const moodInterval = this.baseIntervalForMood();
    const multiplier = Math.max(0.2, 1 - this.spawnIntervalBonus);
    const modified = Math.max(1, Math.round(moodInterval * multiplier));
    return modified;
  }

  private currentSpawnCost(): number {
    if (this.baseSpawnCost <= 0) {
      return 0;
    }
    const multiplier = Math.max(0.2, 1 - this.spawnCostReduction);
    return Math.max(1, Math.round(this.baseSpawnCost * multiplier));
  }

  private baseIntervalForMood(): number {
    if (this.mood === 'boosted' && this.spawnRateBoostMultiplier > 1) {
      const boosted = Math.max(1, Math.floor(this.baseSpawnIntervalTicks / this.spawnRateBoostMultiplier));
      return boosted;
    }
    return this.baseSpawnIntervalTicks;
  }

  private isStarving(): boolean {
    return this.mood === 'starving';
  }
}

export type VillagerBehaviorState =
  | { type: 'idle'; idleTicks: number }
  | {
      type: 'travelToResource';
      path: TilePosition[];
      resourceType: ResourceType;
      target: TilePosition;
      gatherTicks: number;
    }
  | {
      type: 'gathering';
      remainingTicks: number;
      target: TilePosition;
      resourceType: ResourceType;
      collected: number;
      gatherTicks: number;
    }
  | { type: 'returnHome'; path: TilePosition[] }
  | { type: 'depositing'; remainingTicks: number }
  | { type: 'fleeing'; path: TilePosition[] }
  | { type: 'resting'; remainingTicks: number };

export interface VillagerParameters {
  readonly entityId: number;
  readonly homeVillageId: number;
  readonly gatherTicks: number;
  readonly depositTicks: number;
  readonly carryCapacity: number;
  readonly idleTicksBetweenJobs: number;
  readonly panicStaminaTicks: number;
  readonly panicRestTicks: number;
  readonly panicSpeedMultiplier: number;
  readonly panicThreatEscalationCount: number;
}

export interface TilePosition {
  x: number;
  y: number;
}

export class Villager {
  readonly entityId: number;
  readonly homeVillageId: number;
  readonly gatherTicks: number;
  readonly depositTicks: number;
  readonly carryCapacity: number;
  readonly idleTicksBetweenJobs: number;
  readonly panicSpeedMultiplier: number;
  readonly panicThreatEscalationCount: number;
  readonly panicRestTicks: number;
  readonly maxPanicStamina: number;

  state: VillagerBehaviorState;
  carriedResource = 0;
  carriedResourceType: ResourceType | null = null;
  panicActive = false;
  panicStamina = 0;
  pendingRestTicks = 0;
  threatCloseCounter = 0;
  lastThreatDistance: number | null = null;
  fleeMoveBudget = 0;

  constructor(params: VillagerParameters) {
    this.entityId = params.entityId;
    this.homeVillageId = params.homeVillageId;
    this.gatherTicks = Math.max(1, params.gatherTicks);
    this.depositTicks = Math.max(1, params.depositTicks);
    this.carryCapacity = Math.max(1, params.carryCapacity);
    this.idleTicksBetweenJobs = Math.max(0, params.idleTicksBetweenJobs);
    this.panicSpeedMultiplier = Math.max(1, Math.floor(params.panicSpeedMultiplier));
    this.maxPanicStamina = Math.max(1, params.panicStaminaTicks);
    this.panicRestTicks = Math.max(1, params.panicRestTicks);
    this.panicThreatEscalationCount = Math.max(1, params.panicThreatEscalationCount);
    this.state = { type: 'idle', idleTicks: params.idleTicksBetweenJobs };
  }

  setIdle(delay: number = this.idleTicksBetweenJobs): void {
    this.stopPanic();
    this.resetThreatTracking();
    this.state = { type: 'idle', idleTicks: Math.max(0, delay) };
  }

  startTravelToResource(
    path: TilePosition[],
    resourceType: ResourceType,
    target: TilePosition,
    gatherTicks: number,
  ): void {
    this.state = {
      type: 'travelToResource',
      path: [...path],
      resourceType,
      target,
      gatherTicks: Math.max(1, gatherTicks),
    };
  }

  startGathering(target: TilePosition, resourceType: ResourceType, gatherTicks?: number): void {
    const duration = Math.max(1, gatherTicks ?? this.gatherTicks);
    this.state = {
      type: 'gathering',
      remainingTicks: duration,
      target,
      resourceType,
      collected: 0,
      gatherTicks: duration,
    };
  }

  startReturnHome(path: TilePosition[]): void {
    this.state = { type: 'returnHome', path: [...path] };
  }

  startDepositing(): void {
    this.state = { type: 'depositing', remainingTicks: this.depositTicks };
  }

  startFleeing(path: TilePosition[], maintainPanic = this.panicActive): void {
    if (!maintainPanic) {
      this.stopPanic();
    }
    this.resetThreatTracking();
    this.fleeMoveBudget = 0;
    this.state = { type: 'fleeing', path: [...path] };
  }

  startResting(ticks?: number): void {
    const fallback = this.pendingRestTicks > 0 ? this.pendingRestTicks : this.panicRestTicks;
    const duration = Math.max(1, ticks ?? fallback);
    this.stopPanic();
    this.resetThreatTracking();
    this.pendingRestTicks = Math.max(0, this.pendingRestTicks - duration);
    this.state = { type: 'resting', remainingTicks: duration };
  }

  enterPanic(): void {
    this.panicActive = true;
    this.panicStamina = this.maxPanicStamina;
    this.pendingRestTicks = Math.max(this.pendingRestTicks, this.panicRestTicks);
    this.resetThreatTracking();
  }

  consumePanicStamina(steps: number): void {
    if (!this.panicActive) {
      return;
    }
    this.panicStamina = Math.max(0, this.panicStamina - steps);
    if (this.panicStamina === 0) {
      this.panicActive = false;
    }
  }

  stopPanic(): void {
    this.panicActive = false;
    this.panicStamina = 0;
  }

  resetThreatTracking(): void {
    this.threatCloseCounter = 0;
    this.lastThreatDistance = null;
  }
}

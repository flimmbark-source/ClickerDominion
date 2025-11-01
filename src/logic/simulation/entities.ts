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
  private readonly spawnCost: number;
  private readonly maxStockpile: number;

  private spawnTimer: number;
  private mood: VillageMood = 'normal';

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
    this.spawnCost = Math.max(0, params.spawnCost);
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

    if (this.resourceStockpile < this.spawnCost) {
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

    this.resourceStockpile = Math.max(0, this.resourceStockpile - this.spawnCost);
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
  | { type: 'travelToResource'; path: TilePosition[]; resourceType: string; target: TilePosition }
  | { type: 'gathering'; remainingTicks: number; target: TilePosition; resourceType: string }
  | { type: 'returnHome'; path: TilePosition[] }
  | { type: 'depositing'; remainingTicks: number }
  | { type: 'fleeing'; path: TilePosition[] };

export interface VillagerParameters {
  readonly entityId: number;
  readonly homeVillageId: number;
  readonly gatherTicks: number;
  readonly depositTicks: number;
  readonly carryCapacity: number;
  readonly idleTicksBetweenJobs: number;
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

  state: VillagerBehaviorState;
  carriedResource = 0;
  carriedResourceType: string | null = null;

  constructor(params: VillagerParameters) {
    this.entityId = params.entityId;
    this.homeVillageId = params.homeVillageId;
    this.gatherTicks = Math.max(1, params.gatherTicks);
    this.depositTicks = Math.max(1, params.depositTicks);
    this.carryCapacity = Math.max(1, params.carryCapacity);
    this.idleTicksBetweenJobs = Math.max(0, params.idleTicksBetweenJobs);
    this.state = { type: 'idle', idleTicks: params.idleTicksBetweenJobs };
  }

  setIdle(delay: number = this.idleTicksBetweenJobs): void {
    this.state = { type: 'idle', idleTicks: Math.max(0, delay) };
  }

  startTravelToResource(path: TilePosition[], resourceType: string, target: TilePosition): void {
    this.state = {
      type: 'travelToResource',
      path: [...path],
      resourceType,
      target,
    };
  }

  startGathering(target: TilePosition, resourceType: string): void {
    this.state = {
      type: 'gathering',
      remainingTicks: this.gatherTicks,
      target,
      resourceType,
    };
  }

  startReturnHome(path: TilePosition[]): void {
    this.state = { type: 'returnHome', path: [...path] };
  }

  startDepositing(): void {
    this.state = { type: 'depositing', remainingTicks: this.depositTicks };
  }

  startFleeing(path: TilePosition[]): void {
    this.state = { type: 'fleeing', path: [...path] };
  }
}

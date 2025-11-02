export type ResourceType = 'wood' | 'food' | 'ore';

export interface ResourceProductionEffectConfig {
  stockpilePerUnit: number;
  spawnIntervalBonusPerUnit: number;
  spawnCostReductionPerUnit: number;
}

export interface ResourceTypeConfig {
  gatherSeconds: number;
  yieldPerGather: number;
  effects: ResourceProductionEffectConfig;
}

export interface BalanceConfig {
  ticksPerSecond: number;
  grid: {
    width: number;
    height: number;
  };
  initialSpawns: {
    town: { tileX: number; tileY: number };
    hero: { tileX: number; tileY: number };
    monsters: Array<{ tileX: number; tileY: number; kind: MonsterKind }>;
  };
  iso: {
    tileWidth: number;
    tileHeight: number;
  };
  rng: {
    seed: number;
  };
  doomClock: {
    startSeconds: number;
    warn30: boolean;
    warn10: boolean;
    baseDrainPerSecond: number;
    onMonsterKillSeconds: number;
    drainPerActionSeconds: number;
    penalties: {
      townDamageSeconds: number;
      corruptTileSeconds: number;
      spawnWaveSeconds: number;
    };
  };
  clickCombat: {
    baseDamage: number;
    critChance: number;
    critMultiplier: number;
    cleaveAdjacent: boolean;
    floatingNumbers: boolean;
  };
  hero: {
    hp: number;
    moveIntervalMs: number;
    autoTargetUnlocked: boolean;
  };
  town: {
    integrityMax: number;
    corruptProgressPerTick: number;
    rally: {
      radius: number;
      bonusMultiplier: number;
      durationSeconds: number;
      cooldownSeconds: number;
    };
    cleanse: {
      channelSeconds: number;
      cooldownSeconds: number;
      corruptionReductionPerTick: number;
    };
  };
  villages: {
    baseSpawnIntervalSeconds: number;
    spawnRateBoostMultiplier: number;
    stockpileBoostThreshold: number;
    starvationThreshold: number;
    consumptionPerVillagerPerTick: number;
    spawnCost: number;
    maxStockpile: number;
    initial: {
      capacity: number;
      population: number;
      stockpile: number;
    };
  };
  villagers: {
    gatherSeconds: number;
    depositSeconds: number;
    idleSecondsBetweenJobs: number;
    carryCapacity: number;
    fleeRadius: number;
    panicSpeedMultiplier: number;
    panicStaminaSeconds: number;
    panicRestSeconds: number;
    panicThreatEscalationCount: number;
  };
  militia: {
    hp: number;
    moveIntervalSeconds: number;
    attackDamage: number;
    attackCooldownSeconds: number;
    autoSpawnStockpileThreshold: number;
    patrolPauseSeconds: number;
  };
  resources: {
    types: Record<ResourceType, ResourceTypeConfig>;
    nodes: Array<{ tileX: number; tileY: number; type: ResourceType; amount: number }>;
  };
  corruption: {
    tileMax: number;
    tileIncreasePerTick: number;
    tileDecreasePerTick: number;
  };
  darkEnergy: {
    baseGainPerSecond: number;
    perCorruptedTileGain: number;
    perMonsterKillGain: number;
    aiCadenceSeconds: number;
    actions: {
      corruptTile: {
        cost: number;
        cooldownSeconds: number;
      };
      spawnWave: {
        cost: number;
        cooldownSeconds: number;
        wave: {
          size: number;
          monsterKind: MonsterKind;
          spawnEdgePadding: number;
        };
      };
      drainClock: {
        cost: number;
        cooldownSeconds: number;
        seconds: number;
      };
    };
  };
  monsters: {
    base: {
      stepIntervalMs: number;
      attack: {
        damage: number;
        cooldownMs: number;
      };
    };
    kinds: Record<MonsterKind, {
      hp: number;
      speedMul: number;
      damageMul: number;
    }>;
    spawn: {
      edgeRing: boolean;
      minDistanceFromTown: number;
    };
  };
  economy: {
    goldPerKill: number;
    timeShardPerKill: number;
    upgradeCosts: Record<string, number>;
  };
  ui: {
    flashThresholds: {
      t30: number;
      t10: number;
    };
    showGrid: boolean;
    showPathDebug: boolean;
  };
  victory: {
    surviveMinutes: number;
    resourceGoal: number;
  };
}

export type MonsterKind = 'imp' | 'brute' | 'wisp';

let cachedBalance: BalanceConfig | null = null;

export async function loadBalance(): Promise<BalanceConfig> {
  if (cachedBalance) {
    return cachedBalance;
  }
  const response = await fetch('/config/balance.json');
  if (!response.ok) {
    throw new Error(`Failed to load balance config: ${response.status}`);
  }
  const json = (await response.json()) as BalanceConfig;
  cachedBalance = json;
  return json;
}

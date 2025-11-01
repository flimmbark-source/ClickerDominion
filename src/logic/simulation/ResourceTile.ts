import type { ResourceProductionEffectConfig, ResourceType } from '../balance';

export type ResourceTileState = 'available' | 'depleted';

export interface ResourceTileParams {
  readonly type: ResourceType;
  readonly totalAmount: number;
  readonly gatherDurationTicks: number;
  readonly yieldPerGather: number;
  readonly effects: ResourceProductionEffectConfig;
}

export class ResourceTile {
  readonly type: ResourceType;
  readonly gatherDurationTicks: number;
  readonly yieldPerGather: number;
  readonly effects: ResourceProductionEffectConfig;

  private readonly tickYield: number;

  state: ResourceTileState = 'available';
  remainingResource: number;

  constructor(params: ResourceTileParams) {
    this.type = params.type;
    this.remainingResource = Math.max(0, params.totalAmount);
    this.gatherDurationTicks = Math.max(1, params.gatherDurationTicks);
    this.yieldPerGather = Math.max(0, params.yieldPerGather);
    this.effects = params.effects;
    this.tickYield = this.computeTickYield();

    if (this.remainingResource <= 0) {
      this.state = 'depleted';
    }
  }

  gatherTick(maxAmount: number): number {
    if (this.state === 'depleted' || maxAmount <= 0) {
      return 0;
    }
    const allowed = Math.max(0, maxAmount);
    const amount = Math.min(this.tickYield, allowed, this.remainingResource);
    this.remainingResource = Math.max(0, this.remainingResource - amount);
    if (this.remainingResource <= 0) {
      this.remainingResource = 0;
      this.state = 'depleted';
    }
    return amount;
  }

  isDepleted(): boolean {
    return this.state === 'depleted';
  }

  private computeTickYield(): number {
    if (this.yieldPerGather <= 0) {
      return 0;
    }
    const rawYield = this.yieldPerGather / this.gatherDurationTicks;
    return Math.max(0, rawYield);
  }
}

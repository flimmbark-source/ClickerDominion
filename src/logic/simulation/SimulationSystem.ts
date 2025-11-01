import type { World } from '../../ecs/world';
import { EventDispatcher } from '../events/EventDispatcher';
import { GameEvent, type GameEventPayloads } from '../events/GameEvents';

export interface SimulationTickContext {
  readonly world: World;
  readonly tick: number;
  readonly deltaMs: number;
  readonly dispatcher: EventDispatcher<GameEventPayloads>;
}

export type SimulationEvent = {
  [EventType in GameEvent]: {
    type: EventType;
    payload: GameEventPayloads[EventType];
  };
}[GameEvent];

export type SimulationUpdate = (context: SimulationTickContext) => void | SimulationEvent | SimulationEvent[];

export interface SimulationSystemConfig {
  readonly intervalMs?: number;
  readonly updateVillages?: SimulationUpdate;
  readonly updateVillagers?: SimulationUpdate;
  readonly updateMonsters?: SimulationUpdate;
  readonly updateWorldEffects?: SimulationUpdate;
}

export class SimulationSystem {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private readonly intervalMs: number;
  private readonly updateVillages: SimulationUpdate;
  private readonly updateVillagers: SimulationUpdate;
  private readonly updateMonsters: SimulationUpdate;
  private readonly updateWorldEffects: SimulationUpdate;

  constructor(
    private readonly world: World,
    private readonly dispatcher: EventDispatcher<GameEventPayloads>,
    config: SimulationSystemConfig,
  ) {
    this.intervalMs = config.intervalMs ?? 500;
    this.updateVillages = config.updateVillages ?? (() => undefined);
    this.updateVillagers = config.updateVillagers ?? (() => undefined);
    this.updateMonsters = config.updateMonsters ?? (() => undefined);
    this.updateWorldEffects = config.updateWorldEffects ?? (() => undefined);
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  manualTick(): void {
    this.tick();
  }

  private tick(): void {
    const context: SimulationTickContext = {
      world: this.world,
      tick: this.tickCount,
      deltaMs: this.intervalMs,
      dispatcher: this.dispatcher,
    };

    this.runUpdate(this.updateVillages, context);
    this.runUpdate(this.updateVillagers, context);
    this.runUpdate(this.updateMonsters, context);
    this.runUpdate(this.updateWorldEffects, context);

    this.tickCount += 1;
    this.dispatcher.dispatch(GameEvent.TickCompleted, {
      tick: this.tickCount,
      deltaMs: this.intervalMs,
    });
  }

  private runUpdate(update: SimulationUpdate, context: SimulationTickContext): void {
    const result = update(context);
    if (!result) {
      return;
    }

    const events = Array.isArray(result) ? result : [result];
    for (const event of events) {
      switch (event.type) {
        case GameEvent.VillagerKilled:
          this.dispatcher.dispatch(GameEvent.VillagerKilled, event.payload);
          break;
        case GameEvent.ResourceReturned:
          this.dispatcher.dispatch(GameEvent.ResourceReturned, event.payload);
          break;
        case GameEvent.MonsterKilled:
          this.dispatcher.dispatch(GameEvent.MonsterKilled, event.payload);
          break;
        case GameEvent.VillageDamaged:
          this.dispatcher.dispatch(GameEvent.VillageDamaged, event.payload);
          break;
        case GameEvent.TickCompleted:
          // Prevent recursive tick completion events from user systems.
          break;
        default: {
          const exhaustive: never = event;
          throw new Error(`Unhandled simulation event: ${String(exhaustive)}`);
        }
      }
    }
  }
}

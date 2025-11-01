export enum GameEvent {
  VillagerKilled = 'villagerKilled',
  ResourceReturned = 'resourceReturned',
  MonsterKilled = 'monsterKilled',
  VillageDamaged = 'villageDamaged',
  TickCompleted = 'tickCompleted',
}

export interface GameEventPayloads {
  [GameEvent.VillagerKilled]: {
    villagerId: number;
    villageId?: number;
    killerId?: number;
  };
  [GameEvent.ResourceReturned]: {
    villagerId: number;
    resourceNodeId: number;
    amount: number;
    resourceType: string;
  };
  [GameEvent.MonsterKilled]: {
    monsterId: number;
    sourceId?: number;
  };
  [GameEvent.VillageDamaged]: {
    villageId: number;
    amount: number;
    sourceId?: number;
  };
  [GameEvent.TickCompleted]: {
    tick: number;
    deltaMs: number;
  };
  [key: string]: unknown;
}

export type GameEventKey = keyof GameEventPayloads;

export type GameEventMessage = {
  [EventType in GameEvent]: {
    type: EventType;
    payload: GameEventPayloads[EventType];
  };
}[GameEvent];

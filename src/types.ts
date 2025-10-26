export type Resource =
  | "valor"
  | "arcana"
  | "gold"
  | "essence"
  | "evil"
  | "corruption";

export interface Balance {
  run: {
    baseIncomePerSec: Record<Resource, number>;
    victoryTrack: {
      townSaved: number;
      shrineChanneled: number;
      castleDown: number;
      townLost: number;
      shrineCorrupted: number;
      heroDown: number;
    };
    runLengthSeconds: number;
    aiDecisionPeriodSec: number;
  };
  costs: Record<
    string,
    { base: number; curve: "linear" | "exp" | "pow"; k?: number }
  >;
  caps: { echoes: number; auraRadius: number };
}

export interface TileDef {
  id: string;
  lane: number;
  kind: "town" | "shrine" | "castle" | "path";
  yield?: Partial<Record<Resource, number>>;
  modifiers?: string[];
  channel?: {
    durationSec: number;
    reward: Partial<Record<Resource, number>>;
  };
}

export interface SaveV1 {
  version: 1;
  meta: {
    heroNodes: string[];
    aiNodes: string[];
    stats: { runs: number; bestTrackLeft: number };
  };
  inventory: { relicFragments: number; soulShards: number };
}

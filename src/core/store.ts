import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Resource, TileDef, Balance } from "@/types";
import balancesJson from "@/content/balances.json";
import tilesJson from "@/content/tiles.json";
import { clamp01 } from "@/core/math";

const balances: Balance = balancesJson as any;

type Owner = "hero" | "darklord" | "neutral";

interface TileState extends TileDef {
  owner: Owner;
  channeling: boolean;
  channelProgress: number; // 0..1
}

interface RunState {
  timeLeft: number; // seconds
  track: number; // 0..1 (0=Hero win, 1=Dark-Lord win)
  resources: Record<Resource, number>;
  tiles: TileState[];
}

interface GameStore {
  run: RunState;
  startRun: () => void;
  tick: (dt: number) => void;
  beginChannel: (tileId: string) => void;
  endChannel: (tileId: string) => void;
  clickTile: (tileId: string) => void; // convenience
}

function startingRun(): RunState {
  return {
    timeLeft: balances.run.runLengthSeconds,
    track: 0.5,
    resources: {
      valor: 0,
      arcana: 0,
      gold: 0,
      essence: 0,
      evil: 0,
      corruption: 0
    },
    tiles: (tilesJson as TileDef[]).map((t) => ({
      ...t,
      owner: t.kind === "castle" ? "darklord" : "neutral",
      channeling: false,
      channelProgress: 0
    }))
  };
}

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    run: startingRun(),
    startRun: () => set(() => ({ run: startingRun() })),
    tick: (dt) =>
      set((s) => {
        const r = s.run;

        // base income
        (Object.keys(balances.run.baseIncomePerSec) as Resource[]).forEach(
          (res) => {
            r.resources[res] += balances.run.baseIncomePerSec[res] * dt;
          }
        );

        // tile yields
        for (const t of r.tiles) {
          if (t.yield && t.owner === "hero") {
            for (const [k, v] of Object.entries(t.yield)) {
              r.resources[k as Resource] += (v as number) * dt;
            }
          }
        }

        // channel progress
        for (const t of r.tiles) {
          if (t.kind === "shrine" && t.channeling && t.channel) {
            // simple: hero channels shrines; DL could contest later
            t.channelProgress += dt / t.channel.durationSec;
            if (t.channelProgress >= 1) {
              t.channeling = false;
              t.channelProgress = 0;
              t.owner = "hero";
              // reward
              for (const [k, v] of Object.entries(t.channel.reward)) {
                r.resources[k as Resource] += v as number;
              }
              // track shove
              r.track = clamp01(
                r.track - balances.run.victoryTrack.shrineChanneled
              );
            }
          }
        }

        // timer
        r.timeLeft -= dt;
        if (r.timeLeft <= 0) {
          r.timeLeft = 0;
          // soft result: closer side "wins" visually; no reset here (UI can)
        }
      }),
    beginChannel: (tileId) =>
      set((s) => {
        const t = s.run.tiles.find((x) => x.id === tileId);
        if (!t || t.kind !== "shrine" || !t.channel) return;
        t.channeling = true;
      }),
    endChannel: (tileId) =>
      set((s) => {
        const t = s.run.tiles.find((x) => x.id === tileId);
        if (!t) return;
        t.channeling = false;
      }),
    clickTile: (tileId) =>
      set((s) => {
        const t = s.run.tiles.find((x) => x.id === tileId);
        if (!t) return;
        if (t.kind === "town") {
          // simulate a quick "save" and shove track left
          t.owner = "hero";
          s.run.track = clamp01(s.run.track - balances.run.victoryTrack.townSaved);
        }
      })
  }))
);

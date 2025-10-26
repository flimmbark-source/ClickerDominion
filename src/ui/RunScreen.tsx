import { useEffect } from "react";
import { Stage } from "@/pixi/stage";
import { BoardView } from "@/pixi/boardView";
import { useTicker } from "@/core/scheduler";
import { useGameStore } from "@/core/store";

export function RunScreen({ onExit }: { onExit: () => void }) {
  const timeLeft = useGameStore((s) => s.run.timeLeft);
  const track = useGameStore((s) => s.run.track);
  const resources = useGameStore((s) => s.run.resources);
  const startRun = useGameStore((s) => s.startRun);
  const tick = useGameStore((s) => s.tick);

  useEffect(() => {
    startRun();
  }, [startRun]);

  useTicker(50, (dt) => tick(dt));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* HUD */}
      <div className="flex flex-col gap-3 border-b border-gray-800 bg-gray-900 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs sm:text-sm">
          <span className="font-medium">⏱ {timeLeft.toFixed(1)}s</span>
          <span>Track: {(100 * (1 - track)).toFixed(0)}% Hero</span>
          <span>Valor: {resources.valor.toFixed(1)}</span>
          <span>Arcana: {resources.arcana.toFixed(1)}</span>
          <span>Gold: {resources.gold.toFixed(1)}</span>
          <span>Essence: {resources.essence.toFixed(1)}</span>
        </div>
        <button
          className="w-full rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 sm:w-auto"
          onClick={onExit}
        >
          Exit
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 px-2 pb-2 pt-3 sm:px-4">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
          <Stage>
            <BoardView />
          </Stage>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-900 px-3 py-4 text-xs text-slate-300 sm:text-sm">
        Tap a <span className="text-green-400">TOWN</span> to capture it.
        Hold on a <span className="text-purple-400">SHRINE</span> to channel and
        earn rewards while pushing the track toward the hero.
      </div>
    </div>
  );
}

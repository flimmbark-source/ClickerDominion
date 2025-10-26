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
    <div className="flex flex-col h-full">
      {/* HUD */}
      <div className="flex items-center justify-between p-3 bg-gray-900">
        <div className="text-sm flex gap-4">
          <span>⏱ {timeLeft.toFixed(1)}s</span>
          <span>Track: {(100 * (1 - track)).toFixed(0)}% Hero</span>
          <span>Valor: {resources.valor.toFixed(1)}</span>
          <span>Arcana: {resources.arcana.toFixed(1)}</span>
          <span>Gold: {resources.gold.toFixed(1)}</span>
          <span>Essence: {resources.essence.toFixed(1)}</span>
        </div>
        <button
          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
          onClick={onExit}
        >
          Exit
        </button>
      </div>

      {/* Board */}
      <div className="flex-1">
        <Stage>
          <BoardView />
        </Stage>
      </div>

      {/* Instructions */}
      <div className="p-3 bg-gray-900 text-sm text-slate-300">
        Click a <span className="text-green-400">TOWN</span> to capture it.
        Hold mouse on a <span className="text-purple-400">SHRINE</span> to
        channel it and earn rewards + track push.
      </div>
    </div>
  );
}

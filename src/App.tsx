import { useState } from "react";
import { RunScreen } from "@/ui/RunScreen";
import { MetaScreen } from "@/ui/MetaScreen";

export default function App() {
  const [view, setView] = useState<"menu" | "run" | "meta">("menu");

  return (
    <div className="h-full w-full flex flex-col">
      {view === "menu" && (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4">
          <h1 className="text-3xl font-bold">Hero vs Dark-Lord Clicker</h1>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500"
              onClick={() => setView("run")}
            >
              Play
            </button>
            <button
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
              onClick={() => setView("meta")}
            >
              Meta
            </button>
          </div>
        </div>
      )}
      {view === "run" && <RunScreen onExit={() => setView("menu")} />}
      {view === "meta" && <MetaScreen onBack={() => setView("menu")} />}
    </div>
  );
}

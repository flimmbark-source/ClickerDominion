import { useState } from "react";
import { RunScreen } from "@/ui/RunScreen";
import { MetaScreen } from "@/ui/MetaScreen";

export default function App() {
  const [view, setView] = useState<"menu" | "run" | "meta">("menu");

  return (
    <div className="flex min-h-screen w-full flex-col bg-gray-950 text-gray-100">
      {view === "menu" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">
            Hero vs Dark-Lord Clicker
          </h1>
          <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <button
              className="rounded bg-indigo-600 px-4 py-2 text-lg font-semibold hover:bg-indigo-500"
              onClick={() => setView("run")}
            >
              Play
            </button>
            <button
              className="rounded bg-slate-700 px-4 py-2 text-lg font-semibold hover:bg-slate-600"
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

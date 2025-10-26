export function MetaScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full w-full flex flex-col p-6 bg-gray-950">
      <h2 className="text-2xl font-bold mb-2">Meta Progression</h2>
      <p className="text-slate-300 mb-4">
        Placeholder for Hero “Legend” and Dark-Lord “Eclipse” trees. Returning to
        the menu won’t reset your run data yet—this screen is a stub.
      </p>
      <button
        className="self-start px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}

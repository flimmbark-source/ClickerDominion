import { useEffect, useRef } from "react";

/** Calls `tick(deltaSeconds)` on a fixed timestep using rAF. */
export function useTicker(dtMs: number, tick: (deltaSeconds: number) => void) {
  const saved = useRef(tick);
  saved.current = tick;

  useEffect(() => {
    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      for (; last + dtMs <= now; last += dtMs) saved.current(dtMs / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dtMs]);
}

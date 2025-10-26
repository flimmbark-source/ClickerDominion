import { Stage as PixiStage } from "@pixi/react";
import type { ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

const BASE_STAGE_WIDTH = 800;
const BASE_STAGE_HEIGHT = 480;

export function Stage({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({
    width: BASE_STAGE_WIDTH,
    height: BASE_STAGE_HEIGHT,
  });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = (width: number) => {
      const safeWidth = width > 0 ? width : BASE_STAGE_WIDTH;
      const nextWidth = Math.min(safeWidth, BASE_STAGE_WIDTH);
      const nextHeight = Math.round(
        (nextWidth / BASE_STAGE_WIDTH) * BASE_STAGE_HEIGHT,
      );

      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize(element.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const stageOptions = useMemo(
    () => ({ background: "#111827", antialias: true as const }),
    [],
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      <PixiStage
        width={size.width}
        height={size.height}
        options={stageOptions}
        style={{ width: size.width, height: size.height }}
      >
        {children}
      </PixiStage>
    </div>
  );
}

export const STAGE_BASE_DIMENSIONS = {
  width: BASE_STAGE_WIDTH,
  height: BASE_STAGE_HEIGHT,
};

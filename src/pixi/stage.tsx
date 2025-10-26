import { Stage as PixiStage } from "@pixi/react";
import type { ReactNode } from "react";

export function Stage({ children }: { children: ReactNode }) {
  return (
    <PixiStage
      width={800}
      height={480}
      options={{ background: "#111827", antialias: true }}
    >
      {children}
    </PixiStage>
  );
}

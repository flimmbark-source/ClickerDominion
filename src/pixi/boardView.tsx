import { Container, Graphics, Text } from "@pixi/react";
import { useGameStore } from "@/core/store";

const TILE_W = 140;
const TILE_H = 70;
const LANE_GAP = 40;
const COL_GAP = 16;

function tileColor(owner: "hero" | "darklord" | "neutral"): number {
  switch (owner) {
    case "hero":
      return 0x2563eb; // blue-600
    case "darklord":
      return 0x7f1d1d; // red-900
    default:
      return 0x374151; // gray-700
  }
}

function kindColor(kind: string): number {
  switch (kind) {
    case "shrine":
      return 0x6d28d9; // purple-700
    case "town":
      return 0x22c55e; // green-500
    case "castle":
      return 0x991b1b; // red-800
    default:
      return 0x9ca3af; // gray-400
  }
}

export function BoardView() {
  const tiles = useGameStore((s) => s.run.tiles);
  const beginChannel = useGameStore((s) => s.beginChannel);
  const endChannel = useGameStore((s) => s.endChannel);
  const clickTile = useGameStore((s) => s.clickTile);

  // simple layout: 1 lane, 4 tiles horizontally; scale out later
  return (
    <Container x={40} y={40}>
      {tiles.map((t, i) => {
        const x = (TILE_W + COL_GAP) * i;
        const y = (TILE_H + LANE_GAP) * t.lane;

        return (
          <Container key={t.id} x={x} y={y}>
            {/* Border / Ownership */}
            <Graphics
              draw={(g) => {
                g.clear();
                g.lineStyle(4, tileColor(t.owner));
                g.beginFill(0x111827);
                g.drawRoundedRect(0, 0, TILE_W, TILE_H, 10);
                g.endFill();
              }}
              interactive
              pointerdown={() => {
                if (t.kind === "shrine") beginChannel(t.id);
                else clickTile(t.id);
              }}
              pointerup={() => {
                if (t.kind === "shrine") endChannel(t.id);
              }}
              pointerupoutside={() => {
                if (t.kind === "shrine") endChannel(t.id);
              }}
            />

            {/* Kind strip */}
            <Graphics
              y={-10}
              draw={(g) => {
                g.clear();
                g.beginFill(kindColor(t.kind));
                g.drawRoundedRect(10, 0, TILE_W - 20, 6, 3);
                g.endFill();
              }}
            />

            {/* Label */}
            <Text
              x={10}
              y={10}
              text={`${t.kind.toUpperCase()}`}
              style={{ fill: "white", fontSize: 12 }}
            />
            <Text
              x={10}
              y={28}
              text={`owner: ${t.owner}`}
              style={{ fill: "#cbd5e1", fontSize: 11 }}
            />

            {/* Channel progress bar */}
            {t.kind === "shrine" && t.channeling && (
              <Graphics
                y={TILE_H - 14}
                x={10}
                draw={(g) => {
                  g.clear();
                  g.beginFill(0x1f2937);
                  g.drawRoundedRect(0, 0, TILE_W - 20, 8, 4);
                  g.endFill();
                  g.beginFill(0x9333ea);
                  const w = (TILE_W - 20) * t.channelProgress;
                  g.drawRoundedRect(0, 0, w, 8, 4);
                  g.endFill();
                }}
              />
            )}
          </Container>
        );
      })}
    </Container>
  );
}

import type { SaveV1 } from "@/types";

const KEY = "hvdl-save";

export function loadSave(): SaveV1 | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaveV1) : null;
  } catch {
    return null;
  }
}
export function saveGame(s: SaveV1) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

# Clicker Hero vs. Dark Lord — Codex Build Context

> **Game Type:** Isometric incremental strategy (clicker + light RTS pressure)  
> **Engine Target:** Web (TypeScript + Vite). Any ECS is fine (home‑rolled or small lib).  
> **Core Rule:** *Isometric is a view, not logic.* Logic runs on a square grid; we only **render** iso.

---

## 0) Project Constraints Codex MUST Respect

- **Isometric projection only in the renderer.** All game math stays in grid space.  
- **Fixed‑step simulation.** e.g., 20 ticks per second. Rendering may interpolate; logic never uses delta‑time.  
- **Data‑driven balance.** All tunables live in `/config/balance.json` (this file). No magic numbers in code.  
- **Deterministic systems order** on each tick (see §3).  
- **Separation of concerns:** Input → Intents (data), Systems mutate state, Renderer reads state.  
- **No singletons with hidden state.** Prefer ECS systems with explicit inputs/outputs.  
- **Performance:** Avoid per‑frame allocations; reuse arrays; batch draw calls.

---

## 1) Camera, Grid, and Picking

- **Grid:** Square grid for logic (e.g., 40×40). Store tiles and entities by integer `tileX`, `tileY`.
- **Isometric projection (2:1 diamonds)** for view. Provide two pure functions:
  - `toScreen(tileX, tileY): { x, y }`
  - `toTile(screenX, screenY): { tileX, tileY }` (inverse picking).
- **Depth / draw order:** Sort by `tileY` then `tileX` (or use z‑index derived from tile).

**Suggested 2:1 projection math (example):**
```ts
// Treat each tile as width W, height H, where H = W / 2 for a 2:1 diamond.
function toScreen(tx: number, ty: number, W = 64, H = 32) {
  const x = (tx - ty) * (W / 2);
  const y = (tx + ty) * (H / 2);
  return { x, y };
}
function toTile(sx: number, sy: number, W = 64, H = 32) {
  const tx = Math.floor((sx / (W / 2) + sy / (H / 2)) / 2);
  const ty = Math.floor((sy / (H / 2) - sx / (W / 2)) / 2);
  return { tileX: tx, tileY: ty };
}
```

---

## 2) ECS: Components & Entities (initial set)

**Components (additive / minimal):**
- `Transform { tileX, tileY }`
- `RenderIso { spriteId }`
- `Health { hp, max }`
- `Clickable {}`  // enables click targeting
- `MonsterTag { kind }`  // "imp" | "brute" | ...
- `HeroTag {}`
- `Town { integrity, rallied?: boolean }`
- `Corruption { level }`
- `RallyAura { radius, bonus }`
- `CleanseChannel { tLeft }`
- `DoomClock { seconds }`
- `DarkEnergy { value }`
- `SpawnPoint { rate, timer }`
- `Loot { type, amount }`

**Entities:**
- **Hero**: `Transform, HeroTag, Health, Clickable, RenderIso`
- **Monster**: `Transform, MonsterTag, Health, Clickable, RenderIso`
- **Town**: `Transform, Town, RenderIso`
- **Tile** (optional as entity or map data): may hold `Corruption` state.
- **UI/HUD**: not entities; read‑only views bound to state.

---

## 3) Systems & Fixed Update Order (per tick)

1. **Time** (tick counters, cooldowns)  
2. **Input → Intent** (convert clicks/keys to intents)  
3. **CombatResolution** (apply click damage, crits, cleave)  
4. **Status/Effects** (auras, channels)  
5. **MonsterAI** (target selection, one‑step movement on grid)  
6. **DarkLordAI** (DE accrual, choose actions on cadence)  
7. **Corruption/Cleanse** (tile corruption increase/decrease)  
8. **Spawning/Loot** (waves, pick‑ups)  
9. **Economy/Meta** (gold, shards, upgrades bookkeeping)  
10. **RenderSync** (copy snapshot to view model; do NOT mutate sim state)

> **Note:** All numbers, rates, and thresholds come from `/config/balance.json`.

---

## 4) Pathfinding & Movement

- **A\*** on the grid (4‑way neighbors; optionally 8‑way later).  
- **Walkability map** derived from tiles + occupied entities (cheap bitset).  
- Monsters move **one tile per AI tick** (`balance.monsters.base.stepInterval`).

---

## 5) Clicker/Idle Loop & Pacing

- **Core loop:** Click monsters → earn gold/time shards → buy upgrades → unlock automation.  
- **Doom Clock:** Creates pressure. The Dark Lord can **drain** or **accelerate** the clock later.  
- **Soft caps:** Use diminishing returns and thresholds to avoid runaway inflation.  
- **Automation gates:** Unlock auto‑target, auto‑cleanse, etc., via upgrades/quests.

---

## 6) UI/HUD Requirements (MVP)

- Big **Doom Clock** HUD with warning states (<30s, <10s).  
- **Dark Energy** meter with threshold ticks for actions.  
- **Ability Hotbar:** Rally, Cleanse with visible cooldown spinners.  
- **Tile Signals:** Corrupted tiles have darker diamond; towns show rally ring; cleanse shows channel bar.  
- **Floating numbers** for clicks and crits.

---

## 7) Files & Folders

```
/src
  /ecs        // components, systems, world
  /logic      // pathfinding, intents, rules
  /render     // iso renderer, atlas, projections
  /ui         // HUD & panels (reads from state snapshot)
/assets       // sprites, atlases, fonts
/config
  balance.json
README_Codex.md
```

---

## 8) Dev & Test Hooks

- **Seeded RNG** for reproducible waves.  
- **Hotkeys (dev):**  
  - `F1` +1s time, `F2` +10s  
  - `F5` Spawn test wave  
  - `F9` Toggle slow‑mo (5× slower)  
- **Debug overlays:** grids, entity IDs, path lines (toggleable).

---

## 9) Minimal Feature Slices (stackable)

### Slice 1 — Skeleton
- Grid store, isometric renderer (diamonds), cursor→tile picking.
- Entities: Hero, Monster, Town, Tile (corruption flag).
- Systems: Time, CombatResolution, RenderSync.

### Slice 2 — Threat & Response
- MonsterAI (nearest town targeting), spawn ring.
- Rally (aura buff), Cleanse (channel + cooldown).
- Corruption tick + cleanse reversal.

### Slice 3 — Dark Lord & Economy
- DarkEnergy accrual (base + per corruption + kills).
- 10s cadence: prefers CorruptTile; else SpawnWave; (later) DrainClock.
- Rewards: gold/time shards; item hooks.

---

## 10) First 5 Prompts (paste to Codex in order)

**P1 — Init repo & skeleton loop**  
Create a TypeScript/Vite project with an ECS (simple home‑rolled is fine), fixed‑timestep simulation (20Hz) + `requestAnimationFrame` render. Implement a square grid model (40×40) and an isometric renderer that draws diamond tiles as quads. Add mouse→tile picking (inverse iso transform). No art; colored quads and debug text.

**P2 — Core entities + click combat**  
Add components/systems from §2. Spawn 1 Hero at (20,20) and 3 Monsters near a Town. Implement Clickable targeting: clicking a Monster applies clickDamage with crits and floating numbers. All tunables in `/config/balance.json`.

**P3 — Doom Clock + HUD**  
Add a DoomClock system (base 1s/s). Show a large HUD timer; flash when `<30s`. Time gain on monster kill (default 0) and penalties for events (default 0).

**P4 — Monster AI + Pathfinding**  
Implement A* over the grid. Monsters step one tile per AI tick toward the nearest Town. On entering a Town tile, reduce integrity and start a `corruptProgress`; when filled, mark the tile corrupted (darker diamond).

**P5 — Dark Lord DE + Actions**  
Add DarkEnergy accrual and a 10‑second cadence. Implement actions: `CorruptTile` (prefer towns not yet corrupted) and `SpawnWave` (N small enemies at edges). Show a DE meter with markers at thresholds. Add **Cleanse** (channel 3s) and **Rally** (30s aura) with cooldowns. Numbers from config.

---

## 11) Coding Guidelines

- Type **all** components and configs.  
- Keep each System pure; receive world, mutate state, return void.  
- No system reads the renderer; the renderer only consumes a snapshot (`RenderState`).  
- Use **config constants** only through a typed access layer (`getBalance()`), allowing live reload in dev.  
- Instruments/metrics: frame time, sim time, entity counts (dev overlay).

---

## 12) Acceptance for MVP

- Can start the game, see an isometric grid + hero + a few monsters and a town.
- Clicking damages monsters with visible numbers and crits.
- Doom Clock counts down; Dark Lord accrues DE and can corrupt or spawn.
- Rally & Cleanse work with visible cooldowns/effects.
- All numbers are tweakable from `/config/balance.json` without code changes.

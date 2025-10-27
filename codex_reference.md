# Clicker Hero vs. Dark Lord — Codex Reference (Single Source of Truth)

> **Use this file as the ONLY context you feed to Codex.**  
> It contains the core architecture, systems order, algorithms, balance tables, and a structured summary of the full Game Design Document (GDD).  
> Isometric is **view-only**; logic is on a square grid.

---

## 0) Build Targets & Constraints

- **Platform:** Web (TypeScript + Vite).  
- **Pattern:** ECS (Entities, Components, Systems) with **fixed-timestep** simulation (20 TPS).  
- **Isometric:** 2:1 diamond renderer; game logic strictly in grid space. Provide `toScreen(tx,ty)` / `toTile(sx,sy)`.
- **Data-driven:** All balance values are read from `/config/balance.json`. No magic numbers in code.
- **Deterministic Tick Order:** Time → Input/Intent → Combat → Effects → MonsterAI → DarkLordAI → Corruption/Cleanse → Spawning/Loot → Economy → RenderSync.
- **Performance:** Avoid per-frame allocations; reuse buffers; batched draw; seedable RNG.

```ts
// Suggested 2:1 projection math
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

## 1) Core Fantasy & Loop (from GDD)

- **Fantasy:** Race against a **Doom Clock** while a **Dark Lord** spreads **Corruption**, spawns **Monsters**, and pressures towns and villagers. Player is a **Hero** who clicks to deal damage, rallies towns, cleanses tiles, rescues villagers, and manages threats.
- **Core Loop:** Click to kill → respond on the grid → use Rally/Cleanse → stabilize towns → push back corruption → survive/escalate to finale.
- **Session:** Short runs (~5–15 min) with meta progression.

---

## 2) World & Topology

- **Grid:** Square (e.g., 40×40). Orthogonal adjacency (4-way; optionally 8 later).  
- **Tile Types:** Town, Wilderness, Resource, Corrupted, Notables (e.g., Dark Spire). Distance & routing matter.
- **Isometric Rendering:** View layer only—draw diamond tiles; depth-sort by (tileY, tileX).

---

## 3) ECS Components (initial)

`Transform{tileX,tileY}` • `RenderIso{spriteId}` • `Health{hp,max}` • `Clickable{}` • `MonsterTag{kind}` • `HeroTag{}` • `Town{integrity,rallied?}` • `Corruption{level}` • `RallyAura{radius,bonus}` • `CleanseChannel{tLeft}` • `DoomClock{seconds}` • `DarkEnergy{value}` • `SpawnPoint{rate,timer}` • `Loot{type,amount}`

**Entities:** Hero, Monster, Town, Tile (corruption flag), optional UI snapshot entity (`RenderState`).

---

## 4) Systems & Fixed Update Order (authoritative)

1. **Time** (cooldowns, channel timers, cadence counters)  
2. **Input → Intent** (mouse/touch into intents)  
3. **CombatResolution** (click damage, crit, cleave, floating numbers)  
4. **Status/Effects** (auras, channels, buffs)  
5. **MonsterAI** (targeting, one-step movement/path)  
6. **DarkLordAI** (DE accrual & action selection on cadence)  
7. **Corruption/Cleanse** (spread vs. reduction)  
8. **Spawning/Loot** (waves, drops)  
9. **Economy/Meta** (gold, shards)  
10. **RenderSync** (copy sim snapshot to view-only state)

---

## 5) Algorithms (implement exactly)

### 5.1 Click Combat
- Base damage per click; 10% crit → ×2 (tunable). Optional cleave to neighbors.  
- On kill: drop loot, update counters, possible time rewards.

### 5.2 Pathfinding
- A* on grid tiles; compute neighbors once; monsters step **one tile per AI tick**.

### 5.3 Doom Clock
- Base drain 1s/s. Immediate penalties (villager death, town corrupted). Periodic drain from **corrupted tiles**. Gains from rescues, cleansing, bosses. Hard cap at start time (unless design overrides).

### 5.4 Dark Lord (Dark Energy, 10s cadence)
Priority (tunable by state):  
1) **Summon Boss** if late and DE >= boss cost  
2) **CorruptTile** (prefer towns/resources; far from hero)  
3) **SpawnWave** (edges; scale with DE)  
4) **DrainClock** (−time)  
Announce actions to player (UI log/toasts).

---

## 6) Player Verbs & Abilities

- **Move** (for tile interactions), **Click Attack** (global targeting for MVP), **Rally** (temporary area buff &/or defenses), **Cleanse** (3s channel; revert a corrupted tile), **Rescue** (villagers → time/loot), optional **Items** / **Ultimate** later.

---

## 7) UI/HUD (MVP)

- Big **Doom Clock** with warning thresholds.  
- **Dark Energy bar** with threshold markers.  
- **Ability Hotbar:** Rally, Cleanse (cooldowns).  
- **Tile Signals:** corrupted visuals, rally ring, cleanse channel bar.  
- **Floating numbers**; edge spawn pings; event toasts.

---

## 8) Project Structure

```
/src
  /ecs        // components, systems, world
  /logic      // pathfinding, intents, rules
  /render     // iso renderer & projection
  /ui         // HUD & panels (reads snapshots)
/assets
/config
  balance.json
codex_reference.md
```

---

## 9) Balance Tables (initial defaults)

**Read at runtime from `/config/balance.json`.** Here is a baseline you can copy into that file:

```json
{
  "ticksPerSecond": 20,
  "grid": { "width": 40, "height": 40 },
  "iso": { "tileWidth": 64, "tileHeight": 32 },
  "rng": { "seed": 7 },
  "doomClock": {
    "startSeconds": 180,
    "warn30": true,
    "warn10": true,
    "onMonsterKillSeconds": 0,
    "drainPerActionSeconds": 0
  },
  "clickCombat": {
    "baseDamage": 3,
    "critChance": 0.1,
    "critMultiplier": 2.0,
    "cleaveAdjacent": false,
    "floatingNumbers": true
  },
  "hero": { "hp": 100, "moveIntervalMs": 250, "autoTargetUnlocked": false },
  "town": {
    "integrityMax": 100,
    "corruptProgressPerTick": 0.0,
    "rally": { "radius": 2, "bonusMultiplier": 1.25, "durationSeconds": 30, "cooldownSeconds": 45 },
    "cleanse": { "channelSeconds": 3, "cooldownSeconds": 20, "corruptionReductionPerTick": 0.05 }
  },
  "corruption": { "tileMax": 1.0, "tileIncreasePerTick": 0.02, "tileDecreasePerTick": 0.05 },
  "darkEnergy": {
    "baseGainPerSecond": 1.0,
    "perCorruptedTileGain": 0.25,
    "perMonsterKillGain": 0.0,
    "aiCadenceSeconds": 10,
    "actions": {
      "corruptTile": { "cost": 10, "cooldownSeconds": 0 },
      "spawnWave": { "cost": 12, "cooldownSeconds": 0, "wave": { "size": 5, "monsterKind": "imp", "spawnEdgePadding": 2 } },
      "drainClock": { "cost": 20, "cooldownSeconds": 20, "seconds": 5 }
    }
  },
  "monsters": {
    "base": { "stepIntervalMs": 500, "attack": { "damage": 2, "cooldownMs": 1000 } },
    "kinds": {
      "imp": { "hp": 8, "speedMul": 1.0, "damageMul": 1.0 },
      "brute": { "hp": 20, "speedMul": 0.8, "damageMul": 1.5 },
      "wisp": { "hp": 5, "speedMul": 1.3, "damageMul": 0.7 }
    },
    "spawn": { "edgeRing": true, "minDistanceFromTown": 6 }
  },
  "economy": {
    "goldPerKill": 1,
    "timeShardPerKill": 0,
    "upgradeCosts": { "clickDamage1": 10, "clickDamage2": 25, "autoTarget": 50, "cleanseBoost": 40 }
  },
  "ui": { "flashThresholds": { "t30": 30, "t10": 10 }, "showGrid": true, "showPathDebug": false }
}
```

> The GDD includes suggested higher values (e.g., 300s start, specific penalties/rewards). Use this file as the **schema**, and tune numbers in `balance.json` as you iterate.

---

## 10) Pseudocode (drop-in for Codex)

### 10.1 Game Loop (fixed-step)
```ts
accumulator += dt;
const step = 1 / ticksPerSecond;
while (accumulator >= step) {
  timeSystem();
  inputIntentSystem();
  combatSystem();
  effectsSystem();
  monsterAISystem();
  darkLordAISystem();
  corruptionCleanseSystem();
  spawnLootSystem();
  economySystem();
  renderSyncSystem();
  accumulator -= step;
}
renderFrame(); // reads snapshot only
```

### 10.2 Dark Lord cadence (10s)
```ts
if (darkLord.cadenceTimer <= 0) {
  accrueDE();
  if (lateGame() && can("boss")) do("boss");
  else if (can("corruptTile")) do("corruptTile");
  else if (can("spawnWave")) do("spawnWave");
  else if (can("drainClock")) do("drainClock");
  darkLord.cadenceTimer = balance.darkEnergy.aiCadenceSeconds;
}
```

### 10.3 A* Neighboring
```ts
// 4-way neighbors; cache for speed
neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
```

---

## 11) First 5 Codex Prompts (execute sequentially)

1) **Init skeleton:** TS + Vite, ECS, fixed-step sim, isometric renderer (diamonds), mouse→tile picking.  
2) **Core entities/combat:** Implement components; click-to-damage with crit; floating numbers; config-driven.  
3) **Doom Clock + HUD:** Countdown HUD; warn thresholds; penalties/gains wired to events.  
4) **Monster AI + A\*:** Stepwise movement to nearest town; town integrity & corruption progress.  
5) **Dark Lord + Abilities:** DE accrual; actions (corrupt, spawn, drain, later boss); Cleanse (3s), Rally (30s).

---

## 12) Acceptance (MVP)

- Isometric grid + hero/monsters/town visible.  
- Click combat works with crits; floating numbers.  
- Doom Clock + Dark Energy UI respond to events.  
- Rally & Cleanse functional with cooldowns/channels.  
- All numbers hot-tuned via `/config/balance.json` without code edits.

---

### Attribution
This specification is a structured synthesis of the **Clicker Hero vs. Dark Lord – Game Design Document (GDD)** provided by the user, aligned for implementation by Codex.

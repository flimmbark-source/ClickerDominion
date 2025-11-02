### Clicker Dominion: Game Design Blueprint

---

### 1. 🧠 Game Overview

**Title:** Clicker Dominion
**Genre:** Isometric Clicker / Auto Strategy / Roguelike
**Core Loop:** Player supports autonomous villagers by clicking and managing resources while defending against escalating threats from the Dark Lord AI. Doom Clock pressures the player with inevitable corruption, pushing them toward repeated meta-progression.

---

### 2. 🔧 Core Systems (Modules)

#### 📦 Tile System

* **Grid:** 10x10 (100 total tiles).
* **Tile States:** `empty`, `village`, `resource`, `corrupted`, `purified`
* **Tile Content:** Can hold entities (villagers, enemies, etc.)

#### 👨‍🌾 Villager AI

* **Spawn Point:** Villages.
* **Behavior:**

  * Seek nearest `resource` tile
  * Harvest for a set time
  * Return to originating village
  * Can be attacked and killed by enemies

#### 🧟 Monster AI (Dark Lord Minions)

* **Spawn Point:** Corrupted tiles or enemy spawn zones
* **Behavior:**

  * Target villagers and villages
  * Attack on contact
  * Kill to gain dark energy
  * Destroy villages to remove them from map

#### ⏱️ Doom Clock

* **Timer:** Ticks down once per second
* **Player Adds Time By:**

  * Killing enemies
  * Saving villagers
  * Purifying corrupted tiles
* **Dark Lord Removes Time By:**

  * Killing villagers
  * Destroying villages
  * Corrupting tiles

#### 💀 Dark Lord AI Director

* **Energy Source:** Dark deeds (kills, destruction, corruption)
* **Spends Energy On:**

  * Stronger enemies
  * More corruption
  * Faster Doom Clock decay

#### ⚔️ Combat

* **Player:** Click enemies to damage
* **Villagers:** Passive, may upgrade to self-defense
* **Enemies:** Attack villagers/villages

#### 🏅 Valor System

* **Earned From:** Heroic deeds (purification, protection, defense)
* **Used In:** Meta-layer to buy permanent upgrades

---

### 3. 🔢 Entity Definitions

**Villager**

```json
{
  "type": "villager",
  "health": 10,
  "speed": 1,
  "state": "idle" | "gathering" | "returning" | "dead"
}
```

**Enemy**

```json
{
  "type": "enemy",
  "health": 20,
  "speed": 0.5,
  "target": "village" | "villager"
}
```

**Tile**

```json
{
  "x": 0,
  "y": 0,
  "type": "empty" | "village" | "resource" | "corrupted",
  "entities": []
}
```

---

### 4. 🔁 Game Flow Summary

```
START
→ Generate board (10x10)
→ Place starting village
→ Doom Clock starts ticking
→ Villagers spawn and gather
→ Dark Lord starts corrupting tiles
→ Player defends, purifies, supports villagers
→ Clock reaches zero → board consumed
→ Meta Layer opens
→ Player spends Valor, chooses upgrades
→ Restart with new board and retained upgrades
→ Repeat
```

---

### 5. 🦮 Meta Layer (Permanent Upgrades)

**Types:**

#### Strategic Upgrades (Game-changing)

* Unlock Spells (e.g. fireball, heal, slow)
* Auto-purify tiles after enemy death
* Multi-resource carrying villagers
* Hero Units (strong, semi-autonomous)

#### Incremental Upgrades (Stat buffs)

* +10% Villager HP
* +1s for every heroic act
* +5% click damage
* -5% Enemy spawn rate

---

### Usage Instructions (For Codex)

* Reference modules by name (e.g., "implement Villager AI from Section 2")
* Pass relevant entity structure JSON for clarity
* Be explicit with logic goals: avoid vague instructions

---

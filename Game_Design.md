1. 🧠 Game Overview

Title: Clicker Dominion
Genre: Isometric Clicker / Auto Strategy / Roguelike
Loop: Player clicks and assists auto-villagers in gathering resources and defending villages, while a Doom Clock counts down. The Dark Lord AI corrupts tiles, spawns enemies, and tries to overwhelm the board.

2. 🔧 Core Systems (Modules Codex Can Build)
📦 Tile System

10x10 Grid (100 tiles).

Each tile can be:

Empty

Village

Resource Node

Corrupted

Purified

Tiles can hold entities (villagers, enemies, etc.)

👨‍🌾 Villager AI

Villagers spawn from villages.

Seek nearest resource node.

Harvest and return to village.

Can die from monsters.

🧟 Monster AI (Dark Lord Minions)

Spawn from corruption points.

Seek out villages or villagers.

Kill to gain dark energy.

Destroy villages to remove them from the map.

⏱️ Doom Clock

Ticks down every second.

Player can add time by:

Killing monsters.

Saving villagers.

Purifying tiles.

Dark Lord can remove time by:

Killing villagers.

Destroying villages.

Corrupting tiles.

💀 Dark Lord AI Director

Gains dark energy through "dark deeds."

Spends energy to:

Spawn tougher enemies.

Corrupt more tiles.

Shorten Doom Clock.

⚔️ Combat

Player can click enemies to damage them.

Villagers may eventually gain self-defense.

Enemies can attack villages/villagers.

🏅 Valor System

Player earns Valor from heroic deeds.

Stored and carried to meta-layer.

3. 🔢 Entity Definitions

Villager:

{
  "type": "villager",
  "health": 10,
  "speed": 1,
  "state": "idle" | "gathering" | "returning" | "dead"
}


Enemy:

{
  "type": "enemy",
  "health": 20,
  "speed": 0.5,
  "target": "village" | "villager"
}


Tile:

{
  "x": 0,
  "y": 0,
  "type": "empty" | "village" | "resource" | "corrupted",
  "entities": []
}

4. 🔁 Game Flow Summary
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

5. 🧬 Meta Layer (Upgrades)

Upgrades fall into 2 types:

1. Strategic (permanent + game-changing):

Unlock Spells (e.g. fireball, heal)

Auto-purify tiles after defeating monsters

Multi-resource villagers

Hero Villagers (stronger, fight-capable)

2. Incremental:

Villager HP +10%

+1 second for each heroic act

+5% click damage

Enemy spawn rate slightly reduced

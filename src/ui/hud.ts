import type { RenderSnapshot } from '../render/state';
import { reportCheckPass, reportCheckFail } from '../utils/checks';

const HUD_STYLE_ID = 'clicker-dominion-hud-style';

function ensureHudStyles(): void {
  if (document.getElementById(HUD_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = HUD_STYLE_ID;
  style.textContent = `
    .hud-doom-clock {
      font-size: 48px;
      font-weight: 700;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
      letter-spacing: 0.08em;
      color: #ffffff;
      transition: color 0.2s ease, text-shadow 0.2s ease;
    }
    .hud-doom-clock.hud-doom-clock--warn {
      color: #ffb347;
      animation: hud-doom-flash 1s steps(2, start) infinite;
    }
    .hud-doom-clock.hud-doom-clock--critical {
      color: #ff5c5c;
      animation: hud-doom-flash 0.5s steps(2, start) infinite;
      text-shadow: 0 0 12px rgba(255, 92, 92, 0.9);
    }
    .hud-dark-energy {
      margin-top: 12px;
    }
    .hud-dark-energy__label {
      font-size: 18px;
      font-weight: 600;
      text-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
    }
    .hud-de-meter {
      position: relative;
      margin: 6px auto 0;
      width: 280px;
      height: 16px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.2);
      overflow: hidden;
      box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.4);
    }
    .hud-de-fill {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      border-radius: 8px 0 0 8px;
      background: linear-gradient(90deg, rgba(124, 77, 255, 0.9), rgba(103, 58, 183, 0.9));
      transition: width 0.2s ease;
    }
    .hud-de-markers {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .hud-de-marker {
      position: absolute;
      top: 2px;
      bottom: 2px;
      width: 2px;
      transform: translateX(-1px);
      background: rgba(255, 255, 255, 0.7);
    }
    .hud-de-marker--ready {
      background: #aeea00;
      box-shadow: 0 0 8px rgba(174, 234, 0, 0.85);
    }
    .hud-de-marker-label {
      position: absolute;
      top: 100%;
      left: 0;
      transform: translate(-50%, 4px);
      white-space: nowrap;
      font-size: 11px;
      text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
    }
    .hud-debug-panel {
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 12px 16px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      font-family: sans-serif;
      font-size: 14px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: none;
      box-shadow: 0 0 12px rgba(0, 0, 0, 0.4);
      z-index: 2;
    }
    .hud-summary-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 24px 32px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #ffffff;
      font-family: sans-serif;
      text-align: center;
      min-width: 280px;
      max-width: 420px;
      display: none;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
      box-shadow: 0 0 24px rgba(0, 0, 0, 0.5);
      z-index: 3;
    }
    .hud-summary-overlay--visible {
      display: flex;
    }
    .hud-summary-title {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .hud-summary-reason {
      font-size: 16px;
      opacity: 0.9;
    }
    .hud-summary-stats {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 18px;
    }
    .hud-summary-goals {
      font-size: 14px;
      opacity: 0.8;
    }
    @keyframes hud-doom-flash {
      0% { opacity: 1; }
      50% { opacity: 0.25; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = Math.floor(clamped % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly doomClock: HTMLDivElement;
  private readonly darkEnergy: HTMLDivElement;
  private readonly darkEnergyLabel: HTMLDivElement;
  private readonly darkEnergyMeter: HTMLDivElement;
  private readonly darkEnergyFill: HTMLDivElement;
  private readonly darkEnergyMarkers: HTMLDivElement;
  private readonly gold: HTMLDivElement;
  private readonly stockpile: HTMLDivElement;
  private readonly villagers: HTMLDivElement;
  private readonly townsAlive: HTMLDivElement;
  private readonly nextWave: HTMLDivElement;
  private readonly debugPanel: HTMLDivElement;
  private readonly debugVillagers: HTMLDivElement;
  private readonly debugMonsters: HTMLDivElement;
  private readonly debugGatherers: HTMLDivElement;
  private readonly debugChasing: HTMLDivElement;
  private readonly debugStockpile: HTMLDivElement;
  private readonly summaryOverlay: HTMLDivElement;
  private readonly summaryTitle: HTMLDivElement;
  private readonly summaryReason: HTMLDivElement;
  private readonly summaryStats: HTMLDivElement;
  private readonly summaryTime: HTMLDivElement;
  private readonly summaryVillagers: HTMLDivElement;
  private readonly summaryResources: HTMLDivElement;
  private readonly summaryGoals: HTMLDivElement;

  constructor(container: HTMLElement) {
    ensureHudStyles();
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.top = '16px';
    this.root.style.left = '50%';
    this.root.style.transform = 'translateX(-50%)';
    this.root.style.color = '#fff';
    this.root.style.fontFamily = 'sans-serif';
    this.root.style.textAlign = 'center';
    this.root.style.pointerEvents = 'none';

    this.doomClock = document.createElement('div');
    this.doomClock.classList.add('hud-doom-clock');

    this.darkEnergy = document.createElement('div');
    this.darkEnergy.classList.add('hud-dark-energy');
    this.darkEnergyLabel = document.createElement('div');
    this.darkEnergyLabel.classList.add('hud-dark-energy__label');
    this.darkEnergyMeter = document.createElement('div');
    this.darkEnergyMeter.classList.add('hud-de-meter');
    this.darkEnergyFill = document.createElement('div');
    this.darkEnergyFill.classList.add('hud-de-fill');
    this.darkEnergyMarkers = document.createElement('div');
    this.darkEnergyMarkers.classList.add('hud-de-markers');
    this.darkEnergyMeter.append(this.darkEnergyFill, this.darkEnergyMarkers);
    this.darkEnergy.append(this.darkEnergyLabel, this.darkEnergyMeter);

    this.gold = document.createElement('div');
    this.gold.style.fontSize = '18px';

    this.stockpile = document.createElement('div');
    this.stockpile.style.fontSize = '18px';

    this.villagers = document.createElement('div');
    this.villagers.style.fontSize = '18px';

    this.townsAlive = document.createElement('div');
    this.townsAlive.style.fontSize = '18px';

    this.nextWave = document.createElement('div');
    this.nextWave.style.fontSize = '18px';

    this.root.append(
      this.doomClock,
      this.darkEnergy,
      this.gold,
      this.stockpile,
      this.villagers,
      this.townsAlive,
      this.nextWave,
    );
    container.appendChild(this.root);

    this.debugPanel = document.createElement('div');
    this.debugPanel.classList.add('hud-debug-panel');
    this.debugVillagers = document.createElement('div');
    this.debugMonsters = document.createElement('div');
    this.debugGatherers = document.createElement('div');
    this.debugChasing = document.createElement('div');
    this.debugStockpile = document.createElement('div');
    this.debugPanel.append(
      this.debugVillagers,
      this.debugMonsters,
      this.debugGatherers,
      this.debugChasing,
      this.debugStockpile,
    );
    container.appendChild(this.debugPanel);

    this.summaryOverlay = document.createElement('div');
    this.summaryOverlay.classList.add('hud-summary-overlay');
    this.summaryTitle = document.createElement('div');
    this.summaryTitle.classList.add('hud-summary-title');
    this.summaryReason = document.createElement('div');
    this.summaryReason.classList.add('hud-summary-reason');
    this.summaryStats = document.createElement('div');
    this.summaryStats.classList.add('hud-summary-stats');
    this.summaryTime = document.createElement('div');
    this.summaryVillagers = document.createElement('div');
    this.summaryResources = document.createElement('div');
    this.summaryStats.append(this.summaryTime, this.summaryVillagers, this.summaryResources);
    this.summaryGoals = document.createElement('div');
    this.summaryGoals.classList.add('hud-summary-goals');
    this.summaryOverlay.append(this.summaryTitle, this.summaryReason, this.summaryStats, this.summaryGoals);
    container.appendChild(this.summaryOverlay);
  }

  update(snapshot: RenderSnapshot): void {
    const warnClass = snapshot.hud.warn10
      ? 'hud-doom-clock--critical'
      : snapshot.hud.warn30
      ? 'hud-doom-clock--warn'
      : '';
    this.doomClock.classList.remove('hud-doom-clock--warn', 'hud-doom-clock--critical');
    if (warnClass) {
      this.doomClock.classList.add(warnClass);
    }
    this.doomClock.textContent = formatClock(snapshot.hud.doomClockSeconds);
    const meter = snapshot.hud.darkEnergy;
    const maxValue = Math.max(1, meter.max);
    const ratio = Math.max(0, Math.min(1, meter.value / maxValue));
    this.darkEnergyLabel.textContent = `Dark Energy ${meter.value.toFixed(1)} / ${meter.max.toFixed(0)}`;
    this.darkEnergyFill.style.width = `${ratio * 100}%`;
    this.darkEnergyMarkers.replaceChildren();
    for (const marker of meter.markers) {
      const markerWrapper = document.createElement('div');
      markerWrapper.classList.add('hud-de-marker');
      if (marker.ready) {
        markerWrapper.classList.add('hud-de-marker--ready');
      }
      const markerRatio = Math.max(0, Math.min(1, marker.value / maxValue));
      markerWrapper.style.left = `${markerRatio * 100}%`;
      const label = document.createElement('div');
      label.classList.add('hud-de-marker-label');
      const cdSeconds = Math.ceil(marker.cooldownSeconds);
      const cdText = marker.ready || cdSeconds <= 0 ? '' : ` (${cdSeconds}s)`;
      label.textContent = `${marker.label}${cdText}`;
      markerWrapper.appendChild(label);
      markerWrapper.title = marker.ready
        ? `${marker.label} ready`
        : `${marker.label}${cdSeconds > 0 ? ` available in ${cdSeconds}s` : ''}`;
      this.darkEnergyMarkers.appendChild(markerWrapper);
    }
    this.gold.textContent = `Gold: ${snapshot.hud.gold.toFixed(0)}`;
    this.stockpile.textContent = `Stockpile: ${snapshot.hud.resourceStockpile.toFixed(1)}`;
    this.villagers.textContent = `Villagers: ${snapshot.hud.villagerCount.toFixed(0)} / ${snapshot.hud.villagerCapacity.toFixed(0)} (${snapshot.hud.villageMood})`;
    const townsAliveValue = snapshot.hud.townsAlive;
    const nextWaveSeconds = Math.max(0, snapshot.hud.nextWaveSeconds);
    if (!Number.isFinite(townsAliveValue) || !Number.isFinite(nextWaveSeconds)) {
      reportCheckFail('hudDisplays', 'Invalid towns alive or next wave value');
    } else {
      this.townsAlive.textContent = `Towns Alive: ${Math.max(0, Math.floor(townsAliveValue))}`;
      this.nextWave.textContent = `Next Wave In: ${formatClock(nextWaveSeconds)}`;
      reportCheckPass('hudDisplays', `Towns ${Math.max(0, Math.floor(townsAliveValue))}, next wave ${formatClock(nextWaveSeconds)}`);
    }

    this.debugVillagers.textContent = `Villagers: ${snapshot.debug.villagerCount}`;
    this.debugMonsters.textContent = `Monsters: ${snapshot.debug.monsterCount}`;
    this.debugGatherers.textContent = `Active Gatherers: ${snapshot.debug.activeGatherers}`;
    this.debugChasing.textContent = `Monsters Chasing: ${snapshot.debug.monstersChasingVillagers}`;
    this.debugStockpile.textContent = `Stockpile: ${snapshot.debug.resourceStockpile.toFixed(1)}`;

    const run = snapshot.run;
    const goalParts: string[] = [];
    if (run.surviveGoalSeconds > 0) {
      goalParts.push(`Survive ${formatClock(Math.max(0, Math.round(run.surviveGoalSeconds)))}`);
    }
    if (run.resourceGoal > 0) {
      goalParts.push(`Gather ${run.resourceGoal.toFixed(0)} resources`);
    }
    this.summaryGoals.textContent = goalParts.length > 0 ? `Goals: ${goalParts.join(' or ')}` : '';

    if (run.status === 'running') {
      this.summaryOverlay.classList.remove('hud-summary-overlay--visible');
    } else {
      this.summaryOverlay.classList.add('hud-summary-overlay--visible');
      this.summaryTitle.textContent = run.status === 'won' ? 'Victory' : 'Defeat';
      this.summaryTitle.style.color = run.status === 'won' ? '#a5d6a7' : '#ef9a9a';
      const reasonText =
        run.reason ??
        (run.status === 'won' ? 'You survived the onslaught.' : 'The village has fallen.');
      this.summaryReason.textContent = reasonText;
      const survivedSeconds = Math.max(0, Math.round(run.timeSurvivedSeconds));
      this.summaryTime.textContent = `Time Survived: ${formatClock(survivedSeconds)}`;
      this.summaryVillagers.textContent = `Villagers Born: ${run.villagersBorn}`;
      const resourceGoalSuffix = run.resourceGoal > 0 ? ` / ${run.resourceGoal.toFixed(0)}` : '';
      this.summaryResources.textContent = `Resources Gathered: ${run.resourcesGathered.toFixed(0)}${resourceGoalSuffix}`;
    }
  }
}

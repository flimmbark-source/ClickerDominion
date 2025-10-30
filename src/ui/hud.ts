import type { RenderSnapshot } from '../render/state';

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

    this.root.append(this.doomClock, this.darkEnergy, this.gold);
    container.appendChild(this.root);
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
  }
}

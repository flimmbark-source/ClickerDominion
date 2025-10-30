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
    this.darkEnergy.style.marginTop = '12px';
    this.darkEnergy.style.fontSize = '18px';

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
    this.darkEnergy.textContent = `Dark Energy: ${snapshot.hud.darkEnergy.toFixed(1)}`;
    this.gold.textContent = `Gold: ${snapshot.hud.gold.toFixed(0)}`;
  }
}

import type { RenderSnapshot } from '../render/state';

export class Hud {
  private readonly root: HTMLElement;
  private readonly doomClock: HTMLDivElement;
  private readonly darkEnergy: HTMLDivElement;
  private readonly gold: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.top = '16px';
    this.root.style.right = '16px';
    this.root.style.color = '#fff';
    this.root.style.fontFamily = 'sans-serif';
    this.root.style.textAlign = 'right';
    this.root.style.pointerEvents = 'none';

    this.doomClock = document.createElement('div');
    this.darkEnergy = document.createElement('div');
    this.gold = document.createElement('div');

    this.root.append(this.doomClock, this.darkEnergy, this.gold);
    container.appendChild(this.root);
  }

  update(snapshot: RenderSnapshot): void {
    const doom = snapshot.hud.doomClockSeconds.toFixed(1);
    const warnClass = snapshot.hud.warn10 ? '⚠️' : snapshot.hud.warn30 ? '⚠' : '';
    this.doomClock.textContent = `${warnClass} Doom Clock: ${doom}s`;
    this.darkEnergy.textContent = `Dark Energy: ${snapshot.hud.darkEnergy.toFixed(1)}`;
    this.gold.textContent = `Gold: ${snapshot.hud.gold.toFixed(0)}`;
  }
}

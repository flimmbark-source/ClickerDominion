import type { BalanceConfig } from '../logic/balance';
import { toScreen, toTile } from './isometric';
import type { RenderSnapshot } from './state';

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement, balance: BalanceConfig) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context unavailable');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize(balance);
    window.addEventListener('resize', () => this.resize(balance));
  }

  render(snapshot: RenderSnapshot, balance: BalanceConfig): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);

    const sortedTiles = [...snapshot.tiles].sort((a, b) => (a.tileY - b.tileY) || (a.tileX - b.tileX));
    for (const tile of sortedTiles) {
      this.drawTile(tile.tileX, tile.tileY, tile.corruption, balance);
    }

    const sortedEntities = [...snapshot.entities].sort((a, b) => (a.tileY - b.tileY) || (a.tileX - b.tileX));
    for (const entity of sortedEntities) {
      this.drawEntity(entity.tileX, entity.tileY, entity.kind, balance);
    }

    for (const float of snapshot.floating) {
      const pos = toScreen(float.x, float.y, balance);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '16px sans-serif';
      ctx.fillText(`-${float.value}`, pos.x, pos.y - float.life * 0.5);
    }

    ctx.restore();

    this.drawHud(snapshot, balance);
  }

  private resize(balance: BalanceConfig): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.floor(window.innerWidth * dpr);
    this.height = Math.floor(window.innerHeight * dpr);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${Math.floor(this.width / dpr)}px`;
    this.canvas.style.height = `${Math.floor(this.height / dpr)}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.offsetX = this.width / 2;
    this.offsetY = balance.iso.tileHeight;
    void balance;
  }

  private drawTile(tileX: number, tileY: number, corruption: number, balance: BalanceConfig): void {
    const ctx = this.ctx;
    const pos = toScreen(tileX, tileY, balance);
    const { tileWidth, tileHeight } = balance.iso;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - tileHeight / 2);
    ctx.lineTo(pos.x + tileWidth / 2, pos.y);
    ctx.lineTo(pos.x, pos.y + tileHeight / 2);
    ctx.lineTo(pos.x - tileWidth / 2, pos.y);
    ctx.closePath();
    const base = 60 + Math.floor(corruption * 120);
    ctx.fillStyle = `rgb(${base}, ${Math.max(20, 200 - base)}, ${Math.max(40, 140 - base)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();
  }

  private drawEntity(tileX: number, tileY: number, kind: string, balance: BalanceConfig): void {
    const ctx = this.ctx;
    const pos = toScreen(tileX, tileY, balance);
    const sizeW = balance.iso.tileWidth / 2;
    const sizeH = balance.iso.tileHeight / 2;
    ctx.save();
    ctx.translate(pos.x, pos.y - sizeH / 2);
    ctx.beginPath();
    ctx.rect(-sizeW / 4, -sizeH, sizeW / 2, sizeH);
    if (kind === 'hero') {
      ctx.fillStyle = '#4caf50';
    } else if (kind === 'monster') {
      ctx.fillStyle = '#d84315';
    } else if (kind === 'town') {
      ctx.fillStyle = '#607d8b';
    } else {
      ctx.fillStyle = '#ffeb3b';
    }
    ctx.fill();
    ctx.restore();
  }

  private drawHud(snapshot: RenderSnapshot, balance: BalanceConfig): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Doom Clock: ${snapshot.hud.doomClockSeconds.toFixed(1)}s`, 20, 30);
    if (snapshot.hud.warn30) {
      ctx.fillStyle = snapshot.hud.warn10 ? '#ff1744' : '#ff9800';
      ctx.fillRect(18, 36, 200, 4);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Dark Energy: ${snapshot.hud.darkEnergy.toFixed(1)}`, 20, 60);
    ctx.fillText(`Gold: ${snapshot.hud.gold.toFixed(0)}`, 20, 90);
    ctx.restore();
    void balance;
  }

  screenToTile(screenX: number, screenY: number, balance: BalanceConfig): { tileX: number; tileY: number } {
    const isoX = screenX - this.offsetX;
    const isoY = screenY - this.offsetY;
    return toTile(isoX, isoY, balance);
  }
}

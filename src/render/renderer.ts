import type { BalanceConfig } from '../logic/balance';
import { toScreen, toTile } from './isometric';
import type { RenderEntity, RenderSnapshot, RenderTile } from './state';

function formatClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = Math.floor(clamped % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private offsetX = 0;
  private offsetY = 0;
  private hoverTile: { tileX: number; tileY: number } | null = null;

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
      this.drawTile(tile, balance);
    }

    if (this.hoverTile) {
      const highlight = sortedTiles.find(
        (tile) => tile.tileX === this.hoverTile?.tileX && tile.tileY === this.hoverTile?.tileY,
      );
      if (highlight) {
        this.drawTileHighlight(highlight, balance);
      }
    }

    const sortedEntities = [...snapshot.entities].sort((a, b) => (a.tileY - b.tileY) || (a.tileX - b.tileX));
    for (const entity of sortedEntities) {
      this.drawEntity(entity, balance);
    }

    for (const float of snapshot.floating) {
      const pos = toScreen(float.x, float.y, balance);
      ctx.fillStyle = float.crit ? 'rgba(255,215,0,0.95)' : 'rgba(255,255,255,0.9)';
      ctx.font = float.crit ? 'bold 18px sans-serif' : '16px sans-serif';
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
    const { tileWidth, tileHeight } = balance.iso;
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;
    const maxX = balance.grid.width > 0 ? balance.grid.width - 1 : 0;
    const maxY = balance.grid.height > 0 ? balance.grid.height - 1 : 0;
    const corners = [
      toScreen(0, 0, balance),
      toScreen(maxX, 0, balance),
      toScreen(0, maxY, balance),
      toScreen(maxX, maxY, balance),
    ];
    const minBoundX = Math.min(...corners.map((corner) => corner.x - halfW));
    const maxBoundX = Math.max(...corners.map((corner) => corner.x + halfW));
    const minBoundY = Math.min(...corners.map((corner) => corner.y - halfH));
    const maxBoundY = Math.max(...corners.map((corner) => corner.y + halfH));
    const centerX = (minBoundX + maxBoundX) / 2;
    const centerY = (minBoundY + maxBoundY) / 2;
    this.offsetX = this.width / 2 - centerX;
    this.offsetY = this.height / 2 - centerY;
  }

  setHoverTile(tile: { tileX: number; tileY: number } | null): void {
    if (!tile) {
      this.hoverTile = null;
      return;
    }
    this.hoverTile = { tileX: tile.tileX, tileY: tile.tileY };
  }

  private drawTile(tile: RenderTile, balance: BalanceConfig): void {
    const ctx = this.ctx;
    const pos = toScreen(tile.tileX, tile.tileY, balance);
    const { tileWidth, tileHeight } = balance.iso;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - tileHeight / 2);
    ctx.lineTo(pos.x + tileWidth / 2, pos.y);
    ctx.lineTo(pos.x, pos.y + tileHeight / 2);
    ctx.lineTo(pos.x - tileWidth / 2, pos.y);
    ctx.closePath();

    const fill = this.getTileFill(tile);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawTileHighlight(tile: RenderTile, balance: BalanceConfig): void {
    const ctx = this.ctx;
    const pos = toScreen(tile.tileX, tile.tileY, balance);
    const { tileWidth, tileHeight } = balance.iso;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - tileHeight / 2);
    ctx.lineTo(pos.x + tileWidth / 2, pos.y);
    ctx.lineTo(pos.x, pos.y + tileHeight / 2);
    ctx.lineTo(pos.x - tileWidth / 2, pos.y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawEntity(entity: RenderEntity, balance: BalanceConfig): void {
    const ctx = this.ctx;
    const pos = toScreen(entity.tileX, entity.tileY, balance);
    const sizeW = balance.iso.tileWidth / 2;
    const sizeH = balance.iso.tileHeight / 2;
    ctx.save();
    ctx.translate(pos.x, pos.y - sizeH / 2);
    ctx.beginPath();
    ctx.rect(-sizeW / 4, -sizeH, sizeW / 2, sizeH);
    ctx.fillStyle = this.getEntityFill(entity);
    ctx.fill();
    if (entity.hp !== undefined && entity.hpMax !== undefined) {
      this.drawHealthBar(entity.hp, entity.hpMax, sizeW, sizeH);
    }
    if (entity.kind === 'town' && entity.integrity !== undefined) {
      this.drawTownIntegrity(entity.integrity, balance.town.integrityMax, sizeW, sizeH);
    }
    ctx.restore();
  }

  private getTileFill(tile: RenderTile): string {
    const base = (() => {
      switch (tile.type) {
        case 'road':
          return '#8d6e63';
        case 'town':
          return '#607d8b';
        default:
          return '#4a7a46';
      }
    })();
    const corruptionLevel = Math.max(0, Math.min(1, tile.corruption));
    if (tile.corrupted) {
      return this.darkenColor(base, 0.45 + corruptionLevel * 0.4);
    }
    if (corruptionLevel > 0) {
      return this.darkenColor(base, corruptionLevel * 0.25);
    }
    return base;
  }

  private darkenColor(hex: string, intensity: number): string {
    if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) {
      return hex;
    }
    const normalized = Math.max(0, Math.min(1, intensity));
    const expand = (value: string) => (value.length === 1 ? value.repeat(2) : value);
    const r = parseInt(expand(hex.slice(1, hex.length === 4 ? 2 : 3)), 16);
    const g = parseInt(expand(hex.slice(hex.length === 4 ? 2 : 3, hex.length === 4 ? 3 : 5)), 16);
    const b = parseInt(expand(hex.slice(hex.length === 4 ? 3 : 5)), 16);
    const apply = (channel: number) => Math.round(channel * (1 - normalized));
    return `#${this.toHex(apply(r))}${this.toHex(apply(g))}${this.toHex(apply(b))}`;
  }

  private toHex(value: number): string {
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
  }

  private getEntityFill(entity: RenderEntity): string {
    if (entity.kind === 'hero') {
      return '#4caf50';
    }
    if (entity.kind === 'monster') {
      switch (entity.monsterKind) {
        case 'brute':
          return '#bf360c';
        case 'wisp':
          return '#8e24aa';
        default:
          return '#f4511e';
      }
    }
    if (entity.kind === 'town') {
      return '#546e7a';
    }
    return '#ffeb3b';
  }

  private drawHealthBar(hp: number, max: number, sizeW: number, sizeH: number): void {
    const ctx = this.ctx;
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, max)));
    const barWidth = sizeW / 2;
    ctx.save();
    ctx.translate(0, -sizeH - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barWidth / 2, 0, barWidth, 4);
    ctx.fillStyle = '#66bb6a';
    ctx.fillRect(-barWidth / 2 + 1, 1, (barWidth - 2) * ratio, 2);
    ctx.restore();
  }

  private drawTownIntegrity(integrity: number, maxIntegrity: number, sizeW: number, sizeH: number): void {
    const ctx = this.ctx;
    const ratio = Math.max(0, Math.min(1, integrity / Math.max(1, maxIntegrity)));
    const barWidth = sizeW / 1.5;
    ctx.save();
    ctx.translate(0, -sizeH - 10);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barWidth / 2, 0, barWidth, 4);
    ctx.fillStyle = '#29b6f6';
    ctx.fillRect(-barWidth / 2 + 1, 1, (barWidth - 2) * ratio, 2);
    ctx.restore();
  }

  private drawHud(snapshot: RenderSnapshot, balance: BalanceConfig): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const doomColor = snapshot.hud.warn10 ? '#ff1744' : snapshot.hud.warn30 ? '#ffb347' : '#ffffff';
    ctx.fillStyle = doomColor;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(`Doom ${formatClock(snapshot.hud.doomClockSeconds)}`, 20, 40);
    if (snapshot.hud.warn30) {
      ctx.fillStyle = snapshot.hud.warn10 ? 'rgba(255, 23, 68, 0.35)' : 'rgba(255, 179, 71, 0.35)';
      ctx.fillRect(20, 48, 220, 6);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Dark Energy: ${snapshot.hud.darkEnergy.toFixed(1)}`, 20, 80);
    ctx.fillText(`Gold: ${snapshot.hud.gold.toFixed(0)}`, 20, 108);
    ctx.restore();
    void balance;
  }

  screenToTile(screenX: number, screenY: number, balance: BalanceConfig): { tileX: number; tileY: number } {
    const isoX = screenX - this.offsetX;
    const isoY = screenY - this.offsetY;
    return toTile(isoX, isoY, balance);
  }
}

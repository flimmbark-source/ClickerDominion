import type { BalanceConfig } from '../logic/balance';
import { toScreen, toTile } from './isometric';
import type { RenderEntity, RenderSnapshot, RenderTile } from './state';

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
    this.offsetX = this.width / 2;
    this.offsetY = balance.iso.tileHeight;
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
    if (tile.corrupted) {
      const intensity = Math.min(1, tile.corruption);
      ctx.fillStyle = `rgba(140, 30, 160, ${0.2 + intensity * 0.4})`;
      ctx.fill();
    }
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
    switch (tile.type) {
      case 'road':
        return '#8d6e63';
      case 'town':
        return '#607d8b';
      default:
        return '#4a7a46';
    }
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

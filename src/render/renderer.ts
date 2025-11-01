import type { BalanceConfig } from '../logic/balance';
import { toScreen, toTile } from './isometric';
import type { RenderEntity, RenderSnapshot, RenderTile } from './state';
import type { SpriteAtlas } from './sprites';

function formatClock(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = Math.floor(clamped % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas: SpriteAtlas;
  private width = 0;
  private height = 0;
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;
  private dpr = 1;
  private hoverTile: { tileX: number; tileY: number } | null = null;

  constructor(canvas: HTMLCanvasElement, balance: BalanceConfig, atlas: SpriteAtlas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context unavailable');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.atlas = atlas;
    this.resize(balance);
    window.addEventListener('resize', () => this.resize(balance));
  }

  render(snapshot: RenderSnapshot, balance: BalanceConfig): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);

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
    this.dpr = window.devicePixelRatio || 1;
    this.width = Math.floor(window.innerWidth * this.dpr);
    this.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${Math.floor(this.width / this.dpr)}px`;
    this.canvas.style.height = `${Math.floor(this.height / this.dpr)}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    const mapWidth = Math.max(1, maxBoundX - minBoundX);
    const mapHeight = Math.max(1, maxBoundY - minBoundY);
    const scaleX = this.width / mapWidth;
    const scaleY = this.height / mapHeight;
    this.scale = Math.min(scaleX, scaleY) * 0.98;
    this.offsetX = this.width / 2 - centerX * this.scale;
    this.offsetY = this.height / 2 - centerY * this.scale;
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
    const frame = this.atlas[entity.spriteId];
    if (frame) {
      const destX = pos.x - frame.anchorX;
      const destY = pos.y + balance.iso.tileHeight / 2 - frame.anchorY;
      ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, destX, destY, frame.sw, frame.sh);
    } else {
      this.drawFallbackEntity(entity, pos.x, pos.y, sizeW, sizeH);
    }

    ctx.save();
    ctx.translate(pos.x, pos.y - sizeH / 2);
    if (entity.hp !== undefined && entity.hpMax !== undefined) {
      this.drawHealthBar(entity.hp, entity.hpMax, sizeW, sizeH);
    }
    if (entity.kind === 'town' && entity.integrity !== undefined) {
      this.drawTownIntegrity(entity.integrity, balance.town.integrityMax, sizeW, sizeH);
    }
    ctx.restore();
  }

  private drawFallbackEntity(
    entity: RenderEntity,
    centerX: number,
    centerY: number,
    sizeW: number,
    sizeH: number,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(centerX, centerY - sizeH / 2);
    ctx.beginPath();
    ctx.rect(-sizeW / 4, -sizeH, sizeW / 2, sizeH);
    ctx.fillStyle = this.getFallbackFill(entity);
    ctx.fill();
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

  private getFallbackFill(entity: RenderEntity): string {
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
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const doomColor = snapshot.hud.warn10 ? '#ff1744' : snapshot.hud.warn30 ? '#ffb347' : '#ffffff';
    ctx.fillStyle = doomColor;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(`Doom ${formatClock(snapshot.hud.doomClockSeconds)}`, 20, 40);
    if (snapshot.hud.warn30) {
      ctx.fillStyle = snapshot.hud.warn10 ? 'rgba(255, 23, 68, 0.35)' : 'rgba(255, 179, 71, 0.35)';
      ctx.fillRect(20, 48, 220, 6);
    }
    const meter = snapshot.hud.darkEnergy;
    const meterWidth = 260;
    const meterHeight = 12;
    const meterX = 20;
    const meterY = 86;
    const maxValue = Math.max(1, meter.max);
    const ratio = Math.max(0, Math.min(1, meter.value / maxValue));
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Dark Energy ${meter.value.toFixed(1)} / ${meter.max.toFixed(0)}`, meterX, meterY - 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(meterX, meterY, meterWidth, meterHeight);
    ctx.fillStyle = '#7c4dff';
    ctx.fillRect(meterX, meterY, meterWidth * ratio, meterHeight);
    for (const marker of meter.markers) {
      const markerRatio = Math.max(0, Math.min(1, marker.value / maxValue));
      const markerX = meterX + markerRatio * meterWidth;
      ctx.beginPath();
      ctx.moveTo(markerX, meterY - 4);
      ctx.lineTo(markerX, meterY + meterHeight + 4);
      ctx.strokeStyle = marker.ready ? '#aeea00' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = marker.ready ? 2 : 1;
      ctx.stroke();
      const cdSeconds = Math.ceil(marker.cooldownSeconds);
      const cdText = marker.ready || cdSeconds <= 0 ? '' : ` (${cdSeconds}s)`;
      ctx.fillStyle = marker.ready ? '#aeea00' : '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${marker.label}${cdText}`, markerX + 6, meterY + meterHeight + 18);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Gold: ${snapshot.hud.gold.toFixed(0)}`, 20, meterY + meterHeight + 48);
    ctx.restore();
    void balance;
  }

  screenToTile(screenX: number, screenY: number, balance: BalanceConfig): { tileX: number; tileY: number } {
    const isoX = (screenX - this.offsetX) / this.scale;
    const isoY = (screenY - this.offsetY) / this.scale;
    return toTile(isoX, isoY, balance);
  }
}

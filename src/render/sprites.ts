import type { MonsterKind } from '../logic/balance';

export interface SpriteFrame {
  image: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  anchorX: number;
  anchorY: number;
}

export type MonsterSpriteId = `monster-${MonsterKind}`;
export type SpriteId = 'hero' | 'town' | 'loot' | MonsterSpriteId;
export type SpriteAtlas = Record<SpriteId, SpriteFrame>;

let atlasPromise: Promise<SpriteAtlas> | null = null;

export function loadSpriteAtlas(): Promise<SpriteAtlas> {
  if (!atlasPromise) {
    atlasPromise = createAtlas();
  }
  return atlasPromise;
}

async function createAtlas(): Promise<SpriteAtlas> {
  const [characters, villages, effects] = await Promise.all([
    loadImage('/assets/entities/characters.png'),
    loadImage('/assets/entities/Villages_flora_fauna.png'),
    loadImage('/assets/entities/effects_items.png'),
  ]);

  return {
    hero: createFrame(characters, {
      sx: 0,
      sy: 832,
      sw: 124,
      sh: 64,
      anchorX: 59.21,
      anchorY: 64,
    }),
    'monster-imp': createFrame(characters, {
      sx: 0,
      sy: 64,
      sw: 128,
      sh: 64,
      anchorX: 47.33,
      anchorY: 64,
    }),
    'monster-brute': createFrame(characters, {
      sx: 0,
      sy: 320,
      sw: 128,
      sh: 64,
      anchorX: 59.51,
      anchorY: 64,
    }),
    'monster-wisp': createFrame(characters, {
      sx: 0,
      sy: 704,
      sw: 128,
      sh: 64,
      anchorX: 62.98,
      anchorY: 64,
    }),
    town: createFrame(villages, {
      sx: 256,
      sy: 384,
      sw: 128,
      sh: 128,
      anchorX: 56.75,
      anchorY: 128,
    }),
    loot: createFrame(effects, {
      sx: 256,
      sy: 40,
      sw: 128,
      sh: 88,
      anchorX: 38.53,
      anchorY: 88,
    }),
  };
}

interface FrameConfig {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  anchorX: number;
  anchorY: number;
}

function createFrame(image: HTMLImageElement, config: FrameConfig): SpriteFrame {
  return {
    image,
    sx: config.sx,
    sy: config.sy,
    sw: config.sw,
    sh: config.sh,
    anchorX: config.anchorX,
    anchorY: config.anchorY,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (event) => reject(event));
    image.src = src;
  });
}

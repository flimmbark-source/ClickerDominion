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
export type SpriteId = 'hero' | 'town' | 'loot' | 'villager' | MonsterSpriteId;
export type SpriteAtlas = Record<SpriteId, SpriteFrame>;

let atlasPromise: Promise<SpriteAtlas> | null = null;

export function loadSpriteAtlas(): Promise<SpriteAtlas> {
  if (!atlasPromise) {
    atlasPromise = createAtlas();
  }
  return atlasPromise;
}

interface SpriteSource {
  src: string;
  anchorXRatio: number;
  anchorYRatio: number;
}

const SPRITE_SOURCES: Record<SpriteId, SpriteSource> = {
  hero: {
    src: '/assets/entities/Villager.png',
    anchorXRatio: 0.4775,
    anchorYRatio: 1,
  },
  villager: {
    src: '/assets/entities/Villager.png',
    anchorXRatio: 0.4775,
    anchorYRatio: 1,
  },
  'monster-imp': {
    src: '/assets/entities/Monster.png',
    anchorXRatio: 0.369765625,
    anchorYRatio: 1,
  },
  'monster-brute': {
    src: '/assets/entities/Monster.png',
    anchorXRatio: 0.464921875,
    anchorYRatio: 1,
  },
  'monster-wisp': {
    src: '/assets/entities/Monster.png',
    anchorXRatio: 0.49203125,
    anchorYRatio: 1,
  },
  town: {
    src: '/assets/entities/Village.png',
    anchorXRatio: 0.443359375,
    anchorYRatio: 1,
  },
  loot: {
    src: '/assets/entities/Chest.png',
    anchorXRatio: 0.301015625,
    anchorYRatio: 1,
  },
};

const imagePromises = new Map<string, Promise<HTMLImageElement>>();

async function createAtlas(): Promise<SpriteAtlas> {
  const entries = await Promise.all(
    (Object.keys(SPRITE_SOURCES) as SpriteId[]).map(async (spriteId) => {
      const source = SPRITE_SOURCES[spriteId];
      const image = await loadSpriteImage(source.src);
      return [
        spriteId,
        createFrame(image, source.anchorXRatio, source.anchorYRatio),
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as SpriteAtlas;
}

function createFrame(
  image: HTMLImageElement,
  anchorXRatio: number,
  anchorYRatio: number,
): SpriteFrame {
  const sw = image.naturalWidth;
  const sh = image.naturalHeight;

  return {
    image,
    sx: 0,
    sy: 0,
    sw,
    sh,
    anchorX: sw * anchorXRatio,
    anchorY: sh * anchorYRatio,
  };
}

function loadSpriteImage(src: string): Promise<HTMLImageElement> {
  let promise = imagePromises.get(src);
  if (!promise) {
    promise = loadImage(src);
    imagePromises.set(src, promise);
  }
  return promise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (event) => reject(event));
    image.src = src;
  });
}

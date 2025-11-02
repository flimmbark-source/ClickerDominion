import { createWorld } from './ecs/world';
import { loadBalance } from './logic/balance';
import { createSystemPipeline } from './logic/systems';
import { queueClick, queueAbility } from './logic/intents';
import { Renderer } from './render/renderer';
import { loadSpriteAtlas } from './render/sprites';
import { Hud } from './ui/hud';

async function bootstrap() {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) {
    throw new Error('#app container missing');
  }

  const balance = await loadBalance();
  const world = createWorld(balance);
  const systems = createSystemPipeline();

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.cursor = 'crosshair';
  root.style.position = 'relative';
  root.appendChild(canvas);

  let atlas: Awaited<ReturnType<typeof loadSpriteAtlas>>;
  try {
    atlas = await loadSpriteAtlas();
  } catch (err) {
    console.error('Failed to load sprite atlas', err);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('Failed to load game art. Please refresh the page.');
    }
    return;
  }

  const renderer = new Renderer(canvas, balance, atlas);
  const hud = new Hud(root);

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const screenX = (event.clientX - rect.left) * dpr;
    const screenY = (event.clientY - rect.top) * dpr;
    const tile = renderer.screenToTile(screenX, screenY, balance);
    queueClick(world.intents, { tileX: tile.tileX, tileY: tile.tileY });
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const screenX = (event.clientX - rect.left) * dpr;
    const screenY = (event.clientY - rect.top) * dpr;
    const tile = renderer.screenToTile(screenX, screenY, balance);
    if (
      tile.tileX >= 0 &&
      tile.tileY >= 0 &&
      tile.tileX < world.grid.width &&
      tile.tileY < world.grid.height
    ) {
      renderer.setHoverTile(tile);
    } else {
      renderer.setHoverTile(null);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    renderer.setHoverTile(null);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'r') {
      const rect = canvas.getBoundingClientRect();
      const tile = renderer.screenToTile(rect.width / 2, rect.height / 2, balance);
      queueAbility(world.intents, { type: 'rally', tileX: tile.tileX, tileY: tile.tileY });
    } else if (event.key === 'c') {
      const rect = canvas.getBoundingClientRect();
      const tile = renderer.screenToTile(rect.width / 2, rect.height / 2, balance);
      queueAbility(world.intents, { type: 'cleanse', tileX: tile.tileX, tileY: tile.tileY });
    }
  });

  startLoop(world, systems, renderer, hud, balance);
}

function startLoop(
  world: ReturnType<typeof createWorld>,
  systems: ReturnType<typeof createSystemPipeline>,
  renderer: Renderer,
  hud: Hud,
  balance: Awaited<ReturnType<typeof loadBalance>>,
): void {
  const stepMs = 1000 / balance.ticksPerSecond;
  let accumulator = 0;
  let last = performance.now();

  function frame(now: number) {
    const delta = now - last;
    last = now;
    accumulator += delta;
    while (accumulator >= stepMs) {
      if (world.runState.status !== 'running') {
        accumulator = 0;
        break;
      }
      for (const system of systems) {
        system(world);
      }
      accumulator -= stepMs;
    }
    renderer.render(world.view, balance);
    hud.update(world.view);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

bootstrap().catch((err) => {
  console.error(err);
});

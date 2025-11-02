type CheckKey =
  | 'edgeSpawn'
  | 'monsterPathTown'
  | 'monsterDamageTown'
  | 'endlessWaves'
  | 'hudDisplays';

type CheckStatus = 'unknown' | 'pass' | 'fail';

const CHECK_LABELS: Record<CheckKey, string> = {
  edgeSpawn: 'Waves spawn only on edges',
  monsterPathTown: 'Monsters path to the nearest town',
  monsterDamageTown: 'Monsters damage and destroy towns',
  endlessWaves: 'Waves are endless',
  hudDisplays: 'HUD shows Towns Alive and Next Wave In',
};

const checkState: Record<CheckKey, CheckStatus> = {
  edgeSpawn: 'unknown',
  monsterPathTown: 'unknown',
  monsterDamageTown: 'unknown',
  endlessWaves: 'unknown',
  hudDisplays: 'unknown',
};

function log(status: 'PASS' | 'FAIL', message: string): void {
  const prefix = status === 'PASS' ? '[PASS]' : '[FAIL]';
  if (status === 'PASS') {
    console.log(`${prefix} ${message}`);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

export function reportCheckPass(key: CheckKey, detail?: string): void {
  if (checkState[key] === 'fail' || checkState[key] === 'pass') {
    return;
  }
  const label = CHECK_LABELS[key];
  const message = detail ? `${label} — ${detail}` : label;
  log('PASS', message);
  checkState[key] = 'pass';
}

export function reportCheckFail(key: CheckKey, detail?: string): void {
  if (checkState[key] === 'fail') {
    return;
  }
  const label = CHECK_LABELS[key];
  const message = detail ? `${label} — ${detail}` : label;
  log('FAIL', message);
  checkState[key] = 'fail';
}

export type { CheckKey };

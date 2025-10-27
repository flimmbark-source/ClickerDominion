export interface ClickIntent {
  tileX: number;
  tileY: number;
}

export interface AbilityIntent {
  type: 'rally' | 'cleanse';
  tileX: number;
  tileY: number;
}

export interface IntentState {
  clicks: ClickIntent[];
  abilities: AbilityIntent[];
  consumedThisTick: boolean;
}

export function createIntentState(): IntentState {
  return {
    clicks: [],
    abilities: [],
    consumedThisTick: false,
  };
}

export function queueClick(intentState: IntentState, intent: ClickIntent): void {
  intentState.clicks.push(intent);
}

export function queueAbility(intentState: IntentState, intent: AbilityIntent): void {
  intentState.abilities.push(intent);
}

export function beginTick(intentState: IntentState): void {
  intentState.consumedThisTick = false;
}

export function consumeIntents(intentState: IntentState): {
  clicks: ClickIntent[];
  abilities: AbilityIntent[];
} {
  intentState.consumedThisTick = true;
  const payload = {
    clicks: intentState.clicks.slice(),
    abilities: intentState.abilities.slice(),
  };
  intentState.clicks.length = 0;
  intentState.abilities.length = 0;
  return payload;
}

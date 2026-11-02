import {
  CUMULATIVE_EXP_DIVISOR,
  INITIAL_LEVEL,
  LEVEL_EXP_BASE,
  LEVEL_EXP_COEFFICIENT,
  LEVEL_GOLD_BONUS_PERCENT_PER_LEVEL,
  MAX_LEVEL,
} from './game-rules.constants';

export function expToNext(level: number): number {
  return LEVEL_EXP_BASE + LEVEL_EXP_COEFFICIENT * level * (level + 1);
}

export function cumulativeExp(level: number): number {
  const previousLevels = level - INITIAL_LEVEL;
  return (
    LEVEL_EXP_BASE * previousLevels +
    (LEVEL_EXP_COEFFICIENT * previousLevels * level * (level + 1)) /
      CUMULATIVE_EXP_DIVISOR
  );
}

export function levelFor(exp: number): number {
  let level: number = INITIAL_LEVEL;
  while (level < MAX_LEVEL && cumulativeExp(level + 1) <= exp) {
    level += 1;
  }
  return level;
}

export function expToNextLevel(exp: number): number {
  const level = levelFor(exp);
  return level === MAX_LEVEL ? 0 : cumulativeExp(level + 1) - exp;
}

export function levelGoldBonusPercent(level: number): number {
  return LEVEL_GOLD_BONUS_PERCENT_PER_LEVEL * (level - INITIAL_LEVEL);
}

import { randomInt } from 'node:crypto';
import type { Rng } from './compute-settlement';
import { BASE_PERCENT } from './game-rules.constants';

export const cryptoRng: Rng = () => randomInt(0, BASE_PERCENT);

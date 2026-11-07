import { randomInt } from 'node:crypto';
import type { Rng } from './compute-settlement';
import { DROP_RATE_DENOMINATOR } from './game-rules.constants';

export const cryptoRng: Rng = () => randomInt(0, DROP_RATE_DENOMINATOR);

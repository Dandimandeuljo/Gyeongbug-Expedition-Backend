import {
  BASE_PERCENT,
  IDLE_CAP_SECONDS,
  INITIAL_EQUIPMENT_STAGE,
  PIECE_MAX_JUDGMENTS_PER_SETTLEMENT,
  PIECE_PITY_FAILS,
  PIECE_SLOT_SECONDS,
  PIECE_SUCCESS_PERCENT,
  PIECES_PER_SUCCESS,
  REMAINDER_DIVISOR,
} from './game-rules.constants';
import { levelFor, levelGoldBonusPercent } from './level';

export interface SettlementInput {
  elapsedSeconds: number;
  level: number;
  exp: number;
  gold: number;
  goldRemainder: number;
  expRemainder: number;
  goldPerMinute: number;
  expPerMinute: number;
  equipmentStage: number;
  equipmentStatRatio: number;
  pieces: number;
  carrySeconds: number;
  consecutiveFails: number;
  requiredPieces: number;
}

export interface SettlementResult {
  elapsedSeconds: number;
  capped: boolean;
  goldGain: number;
  expGain: number;
  newGoldRemainder: number;
  newExpRemainder: number;
  judgments: number;
  piecesGain: number;
  newCarrySeconds: number;
  newConsecutiveFails: number;
  newGold: number;
  newExp: number;
  newLevel: number;
  previousLevel: number;
  leveledUp: boolean;
  newPieces: number;
  reachedRequired: boolean;
  rolls: boolean[];
}

/** 0 이상 100 미만의 정수를 반환한다. */
export type Rng = () => number;

/** 호출자가 검증한 정수 상태로 계산하며, 시각 조회나 상태 저장은 하지 않는다. */
export function computeSettlement(
  input: SettlementInput,
  rng: Rng,
): SettlementResult {
  const elapsedSeconds = Math.max(
    0,
    Math.min(input.elapsedSeconds, IDLE_CAP_SECONDS),
  );
  // 이번 구간에는 정산 시작 시점의 레벨과 장비 효율만 적용한다.
  const bonus =
    BASE_PERCENT +
    levelGoldBonusPercent(input.level) +
    input.equipmentStatRatio * (input.equipmentStage - INITIAL_EQUIPMENT_STAGE);
  const nGold =
    elapsedSeconds * input.goldPerMinute * bonus + input.goldRemainder;
  const nExp =
    elapsedSeconds * input.expPerMinute * BASE_PERCENT + input.expRemainder;
  const goldGain = Math.floor(nGold / REMAINDER_DIVISOR);
  const expGain = Math.floor(nExp / REMAINDER_DIVISOR);

  const totalSeconds = elapsedSeconds + input.carrySeconds;
  const judgments = Math.min(
    Math.floor(totalSeconds / PIECE_SLOT_SECONDS),
    PIECE_MAX_JUDGMENTS_PER_SETTLEMENT,
  );
  let piecesGain = 0;
  let newConsecutiveFails = input.consecutiveFails;
  const rolls: boolean[] = [];
  for (let judgment = 0; judgment < judgments; judgment += 1) {
    // 확정 성공에서는 RNG를 호출하지 않는다.
    const success =
      newConsecutiveFails >= PIECE_PITY_FAILS || rng() < PIECE_SUCCESS_PERCENT;
    rolls.push(success);
    if (success) {
      piecesGain += PIECES_PER_SUCCESS;
      newConsecutiveFails = 0;
    } else {
      newConsecutiveFails += 1;
    }
  }

  const newExp = input.exp + expGain;
  const newLevel = levelFor(newExp);
  const newPieces = input.pieces + piecesGain;
  return {
    elapsedSeconds,
    capped: input.elapsedSeconds > IDLE_CAP_SECONDS,
    goldGain,
    expGain,
    newGoldRemainder: nGold % REMAINDER_DIVISOR,
    newExpRemainder: nExp % REMAINDER_DIVISOR,
    judgments,
    piecesGain,
    newCarrySeconds: totalSeconds % PIECE_SLOT_SECONDS,
    newConsecutiveFails,
    newGold: input.gold + goldGain,
    newExp,
    newLevel,
    previousLevel: input.level,
    leveledUp: newLevel > input.level,
    newPieces,
    reachedRequired:
      input.pieces < input.requiredPieces && newPieces >= input.requiredPieces,
    rolls,
  };
}

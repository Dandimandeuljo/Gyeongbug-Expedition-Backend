import { computeSettlement, SettlementInput } from './compute-settlement';
import { expToNextLevel } from './level';

// GAME_RULES 4절 R01, 5절 시작 레벨·장비, v1.2 R01 드롭률, DATABASE 5-1절 초기 상태.
const baseInput: SettlementInput = {
  elapsedSeconds: 0,
  level: 1,
  exp: 0,
  gold: 0,
  goldRemainder: 0,
  expRemainder: 0,
  goldPerMinute: 5,
  expPerMinute: 1,
  equipmentStage: 1,
  equipmentStatRatio: 10,
  pieces: 0,
  carrySeconds: 0,
  consecutiveFails: 0,
  requiredPieces: 20,
  dropRateBp: 60,
};

const FAIL = 9999;
const HIT = 0;

function seq(values: number[]) {
  let index = 0;
  return jest.fn(() => {
    const value = values[index++];
    if (value === undefined) {
      throw new Error('고정 RNG 시퀀스를 초과해 호출했습니다.');
    }
    return value;
  });
}

/** 조각 결과를 보지 않는 테스트용. 항상 실패값을 돌려준다. */
const alwaysFail = () => FAIL;

describe('computeSettlement — GAME_RULES v1.2 검수 사례', () => {
  it('R01 4초, 추첨값 59 이면 몹 1마리를 처치하고 조각 1개를 얻는다', () => {
    const rng = seq([59]);
    const result = computeSettlement({ ...baseInput, elapsedSeconds: 4 }, rng);

    expect(result).toEqual({
      elapsedSeconds: 4,
      capped: false,
      goldGain: 0,
      expGain: 0,
      newGoldRemainder: 2000,
      newExpRemainder: 400,
      judgments: 1,
      piecesGain: 1,
      newCarrySeconds: 0,
      newConsecutiveFails: 0,
      newGold: 0,
      newExp: 0,
      newLevel: 1,
      previousLevel: 1,
      leveledUp: false,
      newPieces: 1,
      reachedRequired: false,
      rolls: [true],
    });
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('R01 4초, 추첨값 60 이면 조각 없이 연속 실패가 1이 된다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 4 },
      seq([60]),
    );

    expect(result).toMatchObject({
      judgments: 1,
      piecesGain: 0,
      newConsecutiveFails: 1,
      rolls: [false],
    });
  });

  it('연속 실패 300 에서는 추첨 없이 확정 드롭하고 실패 횟수를 0으로 되돌린다', () => {
    const rng = seq([]);
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 4, consecutiveFails: 300 },
      rng,
    );

    expect(result).toMatchObject({
      piecesGain: 1,
      newConsecutiveFails: 0,
      rolls: [true],
    });
    expect(rng).not.toHaveBeenCalled();
  });

  it('R01 1시간, 추첨이 모두 실패해도 몹 900마리에서 조각 2개를 보장한다', () => {
    const rng = seq(Array<number>(898).fill(FAIL));
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 3600 },
      rng,
    );

    expect(result).toMatchObject({
      goldGain: 300,
      expGain: 60,
      judgments: 900,
      piecesGain: 2,
      newConsecutiveFails: 298,
    });
    expect(result.rolls[300]).toBe(true);
    expect(result.rolls[601]).toBe(true);
    expect(rng).toHaveBeenCalledTimes(898);
  });

  it('10시간 중 8시간만 정산하고 몹은 최대 7,200마리이다', () => {
    const rng = seq(Array<number>(7200).fill(HIT));
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 36000 },
      rng,
    );

    expect(result).toMatchObject({
      elapsedSeconds: 28800,
      capped: true,
      goldGain: 2400,
      expGain: 480,
      judgments: 7200,
      piecesGain: 7200,
      newCarrySeconds: 0,
    });
    expect(rng).toHaveBeenCalledTimes(7200);
  });

  it('이월 3초에 1초를 더하면 몹 1마리를 처치하고 이월은 0이다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 1, carrySeconds: 3 },
      seq([FAIL]),
    );

    expect(result).toMatchObject({ judgments: 1, newCarrySeconds: 0 });
  });

  it('R08 드롭률 30 에서 추첨값 29 는 드롭, 30 은 실패이다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 8, dropRateBp: 30 },
      seq([29, 30]),
    );

    expect(result).toMatchObject({
      judgments: 2,
      piecesGain: 1,
      newConsecutiveFails: 1,
      rolls: [true, false],
    });
  });
});

describe('computeSettlement — GAME_RULES 9절 (골드·경험치·레벨)', () => {
  it('1행: 5분 탐험에서 25골드와 5XP를 지급하고 몹 75마리를 처치한다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 300 },
      alwaysFail,
    );

    expect(result).toMatchObject({
      goldGain: 25,
      expGain: 5,
      judgments: 75,
      newConsecutiveFails: 75,
    });
  });

  it('5행: 필요 조각을 처음 채운 경우에만 reachedRequired를 반환한다', () => {
    const first = computeSettlement(
      { ...baseInput, elapsedSeconds: 4, pieces: 19 },
      seq([HIT]),
    );
    const next = computeSettlement(
      { ...baseInput, elapsedSeconds: 4, pieces: first.newPieces },
      seq([HIT]),
    );

    expect(first).toMatchObject({ newPieces: 20, reachedRequired: true });
    expect(next).toMatchObject({ newPieces: 21, reachedRequired: false });
  });

  it('7행: 100XP에서 레벨 2가 되고 다음 레벨까지 200XP가 남는다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 6000 },
      alwaysFail,
    );

    expect(result).toMatchObject({
      expGain: 100,
      newExp: 100,
      previousLevel: 1,
      newLevel: 2,
      leveledUp: true,
      goldGain: 500,
    });
    expect(expToNextLevel(result.newExp)).toBe(200);
  });

  it('8행: 레벨 2의 5% 보너스를 골드에만 적용한다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 3600, level: 2, exp: 100 },
      alwaysFail,
    );

    expect(result).toMatchObject({ goldGain: 315, expGain: 60 });
  });
});

describe('computeSettlement 경계와 상태 보존', () => {
  it('음수 경과 초를 0으로 보정하고 기존 잔액과 이월을 보존한다', () => {
    const rng = seq([]);
    const result = computeSettlement(
      {
        ...baseInput,
        elapsedSeconds: -1,
        gold: 180,
        goldRemainder: 5999,
        expRemainder: 5999,
        pieces: 19,
        carrySeconds: 3,
        consecutiveFails: 300,
      },
      rng,
    );

    expect(result).toMatchObject({
      elapsedSeconds: 0,
      capped: false,
      goldGain: 0,
      expGain: 0,
      newGold: 180,
      newExp: 0,
      newGoldRemainder: 5999,
      newExpRemainder: 5999,
      judgments: 0,
      piecesGain: 0,
      newPieces: 19,
      newCarrySeconds: 3,
      newConsecutiveFails: 300,
      rolls: [],
    });
    expect(rng).not.toHaveBeenCalled();
  });

  it('나머지 5999에 R01의 1초 분자를 더하면 지급하고 나머지를 보존한다', () => {
    // 정수 초·정수 분당 수치로는 분자 +1을 만들 수 없다.
    // R01의 실제 1초 분자는 골드 +500, XP +100이다.
    const result = computeSettlement(
      {
        ...baseInput,
        elapsedSeconds: 1,
        goldRemainder: 5999,
        expRemainder: 5999,
      },
      seq([]),
    );

    expect(result).toMatchObject({
      goldGain: 1,
      expGain: 1,
      newGoldRemainder: 499,
      newExpRemainder: 99,
    });
  });

  it('분자가 정확히 6000이 되면 1을 지급하고 나머지는 0이다', () => {
    const result = computeSettlement(
      {
        ...baseInput,
        elapsedSeconds: 1,
        goldRemainder: 5500,
        expRemainder: 5900,
      },
      seq([]),
    );

    expect(result).toMatchObject({
      goldGain: 1,
      expGain: 1,
      newGoldRemainder: 0,
      newExpRemainder: 0,
    });
  });

  it.each([28800, 28803, 36001])(
    '%i초에 이월 3초가 있어도 최대 7,200마리만 처치한다',
    (elapsedSeconds) => {
      const rng = jest.fn(alwaysFail);
      const result = computeSettlement(
        { ...baseInput, elapsedSeconds, carrySeconds: 3 },
        rng,
      );

      expect(result).toMatchObject({
        elapsedSeconds: 28800,
        capped: elapsedSeconds > 28800,
        judgments: 7200,
        newCarrySeconds: 3,
      });
      expect(result.rolls).toHaveLength(7200);
      // 300번 실패마다 다음 1마리는 추첨 없이 확정이다.
      expect(rng).toHaveBeenCalledTimes(7200 - 23);
    },
  );

  it('레벨 20 이후에도 경험치는 쌓이며 레벨과 효과는 20에서 유지한다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 3600, level: 20, exp: 67450 },
      alwaysFail,
    );

    expect(result).toMatchObject({
      newExp: 67510,
      newLevel: 20,
      previousLevel: 20,
      leveledUp: false,
      goldGain: 585,
    });
  });

  it('한 번에 여러 레벨이 올라도 골드는 이전 레벨로 계산한다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 28800 },
      alwaysFail,
    );

    expect(result).toMatchObject({
      goldGain: 2400,
      newExp: 480,
      previousLevel: 1,
      newLevel: 3,
      leveledUp: true,
    });
  });

  it('레벨·장비 보너스는 합산하며 경험치와 드롭률에 적용하지 않는다', () => {
    const result = computeSettlement(
      {
        ...baseInput,
        elapsedSeconds: 8,
        level: 10,
        exp: 8700,
        equipmentStage: 5,
      },
      seq([59, 60]),
    );

    expect(result).toMatchObject({
      judgments: 2,
      piecesGain: 1,
      rolls: [true, false],
    });

    const hour = computeSettlement(
      {
        ...baseInput,
        elapsedSeconds: 3600,
        level: 10,
        exp: 8700,
        equipmentStage: 5,
      },
      alwaysFail,
    );
    expect(hour).toMatchObject({ goldGain: 555, expGain: 60 });
  });

  it('60초 최소 수령 규칙을 적용하지 않고 입력 객체를 변경하지 않는다', () => {
    const input = Object.freeze({ ...baseInput, elapsedSeconds: 59 });
    const result = computeSettlement(input, alwaysFail);

    expect(result).toMatchObject({
      goldGain: 4,
      expGain: 0,
      newGoldRemainder: 5500,
      newExpRemainder: 5900,
      judgments: 14,
      newCarrySeconds: 3,
    });
    expect(input).toEqual({ ...baseInput, elapsedSeconds: 59 });
  });
});

import { computeSettlement, SettlementInput } from './compute-settlement';
import { expToNextLevel } from './level';

// GAME_RULES 4절 R01, 5절 시작 레벨·장비, DATABASE 5-1절 초기 상태.
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
};

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

describe('computeSettlement — GAME_RULES 9절', () => {
  it('1행: 5분 탐험에서 25골드, 5XP와 조각 1개를 지급한다', () => {
    const rng = seq([0]);
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 300 },
      rng,
    );

    expect(result).toEqual({
      elapsedSeconds: 300,
      capped: false,
      goldGain: 25,
      expGain: 5,
      newGoldRemainder: 0,
      newExpRemainder: 0,
      judgments: 1,
      piecesGain: 1,
      newCarrySeconds: 0,
      newConsecutiveFails: 0,
      newGold: 25,
      newExp: 5,
      newLevel: 1,
      previousLevel: 1,
      leveledUp: false,
      newPieces: 1,
      reachedRequired: false,
      rolls: [true],
    });
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('2행: 3연속 실패 다음에는 RNG 호출 없이 성공한다', () => {
    const rng = seq([99, 99, 99]);
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 1200 },
      rng,
    );

    expect(result).toMatchObject({
      judgments: 4,
      piecesGain: 1,
      newConsecutiveFails: 0,
      rolls: [false, false, false, true],
    });
    expect(rng).toHaveBeenCalledTimes(3);
  });

  it('3행: 1시간의 RNG가 모두 실패해도 조각 3개를 보장한다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 3600 },
      seq(Array<number>(9).fill(99)),
    );

    expect(result).toMatchObject({
      goldGain: 300,
      expGain: 60,
      judgments: 12,
      piecesGain: 3,
    });
  });

  it('4행: 10시간 중 8시간만 정산하고 초과 시간은 버린다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 36000 },
      seq(Array<number>(96).fill(0)),
    );

    expect(result).toMatchObject({
      elapsedSeconds: 28800,
      capped: true,
      goldGain: 2400,
      expGain: 480,
      judgments: 96,
      newCarrySeconds: 0,
    });
  });

  it('5행: 필요 조각을 처음 채운 경우에만 reachedRequired를 반환한다', () => {
    const first = computeSettlement(
      { ...baseInput, elapsedSeconds: 300, pieces: 19 },
      seq([0]),
    );
    const next = computeSettlement(
      { ...baseInput, elapsedSeconds: 300, pieces: first.newPieces },
      seq([0]),
    );

    expect(first).toMatchObject({ newPieces: 20, reachedRequired: true });
    expect(next).toMatchObject({ newPieces: 21, reachedRequired: false });
  });

  it('7행: 100XP에서 레벨 2가 되고 다음 레벨까지 200XP가 남는다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 6000 },
      seq(Array<number>(20).fill(0)),
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
      seq(Array<number>(12).fill(0)),
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
        carrySeconds: 299,
        consecutiveFails: 3,
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
      newCarrySeconds: 299,
      newConsecutiveFails: 3,
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

  it('이월 299초에 1초를 더하면 한 번 판정하고 이월은 0이다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 1, carrySeconds: 299 },
      seq([0]),
    );

    expect(result).toMatchObject({ judgments: 1, newCarrySeconds: 0 });
  });

  it('연속 실패 3에서 시작하면 첫 판정이 확정 성공이다', () => {
    const rng = seq([]);
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 300, consecutiveFails: 3 },
      rng,
    );

    expect(result).toMatchObject({
      piecesGain: 1,
      newConsecutiveFails: 0,
      rolls: [true],
    });
    expect(rng).not.toHaveBeenCalled();
  });

  it.each([28800, 29099, 36001])(
    '%i초에 이월 299초가 있어도 최대 96회만 판정한다',
    (elapsedSeconds) => {
      const rng = seq(Array<number>(96).fill(0));
      const result = computeSettlement(
        { ...baseInput, elapsedSeconds, carrySeconds: 299 },
        rng,
      );

      expect(result).toMatchObject({
        elapsedSeconds: 28800,
        capped: elapsedSeconds > 28800,
        judgments: 96,
        newCarrySeconds: 299,
      });
      expect(result.rolls).toHaveLength(96);
      expect(rng).toHaveBeenCalledTimes(96);
    },
  );

  it('레벨 20 이후에도 경험치는 쌓이며 레벨과 효과는 20에서 유지한다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 3600, level: 20, exp: 67450 },
      seq(Array<number>(12).fill(0)),
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
      seq(Array<number>(96).fill(0)),
    );

    expect(result).toMatchObject({
      goldGain: 2400,
      newExp: 480,
      previousLevel: 1,
      newLevel: 3,
      leveledUp: true,
    });
  });

  it('레벨·장비 보너스는 합산하며 경험치와 조각에 적용하지 않는다', () => {
    const result = computeSettlement(
      {
        ...baseInput,
        elapsedSeconds: 3600,
        level: 10,
        exp: 8700,
        equipmentStage: 5,
      },
      seq(Array<number>(12).fill(0)),
    );

    expect(result).toMatchObject({
      goldGain: 555,
      expGain: 60,
      judgments: 12,
      piecesGain: 12,
    });
  });

  it('확률 경계 49는 성공이고 50은 실패이다', () => {
    const result = computeSettlement(
      { ...baseInput, elapsedSeconds: 600 },
      seq([49, 50]),
    );

    expect(result).toMatchObject({
      piecesGain: 1,
      newConsecutiveFails: 1,
      rolls: [true, false],
    });
  });

  it('60초 최소 수령 규칙을 적용하지 않고 입력 객체를 변경하지 않는다', () => {
    const input = Object.freeze({ ...baseInput, elapsedSeconds: 59 });
    const result = computeSettlement(input, seq([]));

    expect(result).toMatchObject({
      goldGain: 4,
      expGain: 0,
      newGoldRemainder: 5500,
      newExpRemainder: 5900,
      newCarrySeconds: 59,
    });
    expect(input).toEqual({ ...baseInput, elapsedSeconds: 59 });
  });
});

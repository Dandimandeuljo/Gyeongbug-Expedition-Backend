import {
  cumulativeExp,
  expToNext,
  expToNextLevel,
  levelExp,
  levelExpRequired,
  levelFor,
  levelGoldBonusPercent,
} from './level';

describe('레벨 공식 — GAME_RULES 5절 표', () => {
  it.each([
    [1, 100, 0],
    [2, 200, 100],
    [3, 350, 300],
    [4, 550, 650],
    [5, 800, 1200],
    [6, 1100, 2000],
    [7, 1450, 3100],
    [8, 1850, 4550],
    [9, 2300, 6400],
    [10, 2800, 8700],
    [19, 9550, 57900],
  ])('레벨 %i의 다음 필요 XP=%i, 시작 누적 XP=%i', (level, next, total) => {
    expect(expToNext(level)).toBe(next);
    expect(cumulativeExp(level)).toBe(total);
    expect(levelFor(total)).toBe(level);
    expect(expToNextLevel(total)).toBe(next);
    if (level > 1) {
      expect(levelFor(total - 1)).toBe(level - 1);
      expect(expToNextLevel(total - 1)).toBe(1);
    }
  });

  it('레벨 20은 누적 67450XP에서 시작하고 더 이상 요구 XP가 없다', () => {
    expect(cumulativeExp(20)).toBe(67450);
    expect(levelFor(67449)).toBe(19);
    expect(expToNextLevel(67449)).toBe(1);
    expect(levelFor(67450)).toBe(20);
    expect(expToNextLevel(67450)).toBe(0);
    expect(levelFor(100000)).toBe(20);
    expect(expToNextLevel(100000)).toBe(0);
  });

  it.each([
    [0, 0, 100],
    [99, 99, 100],
    [100, 0, 200],
    [300, 0, 350],
    [520, 220, 350],
    [649, 349, 350],
    [650, 0, 550],
    [67449, 9549, 9550],
  ])('누적 %iXP의 레벨 진행값은 %i/%i이다', (exp, current, required) => {
    expect(levelExp(exp)).toBe(current);
    expect(levelExpRequired(exp)).toBe(required);
    expect(required - current).toBe(expToNextLevel(exp));
  });

  it.each([67450, 100000])(
    '레벨 20은 누적 %iXP여도 진행값이 0/0이다',
    (exp) => {
      expect(levelExp(exp)).toBe(0);
      expect(levelExpRequired(exp)).toBe(0);
    },
  );

  it.each([
    [1, 0],
    [2, 5],
    [10, 45],
    [20, 95],
  ])('레벨 %i의 골드 보너스는 %i%%이다', (level, bonus) => {
    expect(levelGoldBonusPercent(level)).toBe(bonus);
  });
});

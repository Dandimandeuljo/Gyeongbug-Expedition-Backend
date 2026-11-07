// GAME_RULES 4·5절과 v1.2 지역별 드롭률(dropBp, 만분율), DATABASE 7-2·7-3절의 값입니다. 수치를 바꾸려면 GAME_RULES 개정이 먼저입니다.
export const REGION_SEED = [
  {
    id: 1,
    name: '청송',
    sortOrder: 1,
    gold: 5,
    exp: 1,
    dropBp: 60,
    active: true,
    specialty: '사과',
  },
  {
    id: 2,
    name: '안동',
    sortOrder: 2,
    gold: 8,
    exp: 2,
    dropBp: 55,
    active: true,
    specialty: '간고등어',
  },
  {
    id: 3,
    name: '영주',
    sortOrder: 3,
    gold: 12,
    exp: 3,
    dropBp: 50,
    active: false,
    specialty: '풍기인삼',
  },
  {
    id: 4,
    name: '문경',
    sortOrder: 4,
    gold: 17,
    exp: 4,
    dropBp: 45,
    active: false,
    specialty: '오미자',
  },
  {
    id: 5,
    name: '상주',
    sortOrder: 5,
    gold: 23,
    exp: 5,
    dropBp: 40,
    active: false,
    specialty: '곶감',
  },
  {
    id: 6,
    name: '성주',
    sortOrder: 6,
    gold: 30,
    exp: 6,
    dropBp: 36,
    active: false,
    specialty: '참외',
  },
  {
    id: 7,
    name: '의성',
    sortOrder: 7,
    gold: 38,
    exp: 8,
    dropBp: 33,
    active: false,
    specialty: '마늘',
  },
  {
    id: 8,
    name: '포항',
    sortOrder: 8,
    gold: 48,
    exp: 10,
    dropBp: 30,
    active: false,
    specialty: '과메기',
  },
] as const;

export const REQUIRED_PIECES = 20;

export const EQUIPMENT_UPGRADE_SEED = [
  { upgrade: 2, cost: 100, requiredLevel: 1 },
  { upgrade: 3, cost: 250, requiredLevel: 3 },
  { upgrade: 4, cost: 500, requiredLevel: 6 },
  { upgrade: 5, cost: 900, requiredLevel: 10 },
] as const;

export const GOLD_BONUS_STAT = {
  id: 1,
  stat: 'GOLD_BONUS',
  ratio: 10,
} as const;

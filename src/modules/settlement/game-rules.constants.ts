export const CONFIG_VERSION = 'v1.2'; // GAME_RULES 7절, v1.2 개정
export const IDLE_CAP_SECONDS = 28800; // GAME_RULES 2절
export const CLAIM_MIN_SECONDS = 60; // GAME_RULES 2절
export const MOB_INTERVAL_SECONDS = 4; // GAME_RULES v1.2 몹 처치 규칙
export const DROP_RATE_DENOMINATOR = 10000; // GAME_RULES v1.2 드롭 추첨 (만분율)
export const PIECE_PITY_FAILS = 300; // GAME_RULES v1.2 실패 보정
export const PIECE_MAX_JUDGMENTS_PER_SETTLEMENT =
  IDLE_CAP_SECONDS / MOB_INTERVAL_SECONDS; // GAME_RULES v1.2 상한 (7,200마리)
export const LEVEL_GOLD_BONUS_PERCENT_PER_LEVEL = 5; // GAME_RULES 5절
export const MAX_LEVEL = 20; // GAME_RULES 2·5절
export const QUIZ_REWARD_GOLD = 100; // GAME_RULES 6절
export const QUIZ_REWARD_EXP = 20; // GAME_RULES 6절
export const QUIZ_QUESTIONS_PER_SET = 3; // GAME_RULES 7절, API 0-0절
export const IDEMPOTENCY_TTL_HOURS = 24; // API 0-0절, DATABASE 7-1절
export const NAME_MIN_LENGTH = 2; // API 0-0절, DATABASE 7-1절
export const NAME_MAX_LENGTH = 10; // API 0-0절, DATABASE 7-1절
// 부분 일치로 검사하며 소문자로 적습니다. 운영 사칭과 대표적인 욕설을 막는 초기 목록입니다 (API 0-0).
export const BANNED_WORDS: readonly string[] = [
  '관리자',
  '운영자',
  '운영진',
  '개발자',
  'admin',
  'operator',
  '시발',
  '씨발',
  '병신',
  '지랄',
  '개새끼',
  '좆',
  'fuck',
  'shit',
];
export const REMAINDER_DIVISOR = 6000; // GAME_RULES 2·6절

// 공식에 포함된 계수도 같은 파일에서 관리한다.
export const BASE_PERCENT = 100; // GAME_RULES 5·6절
export const INITIAL_LEVEL = 1; // GAME_RULES 5절
export const INITIAL_EQUIPMENT_STAGE = 1; // GAME_RULES 5절
export const LEVEL_EXP_BASE = 50; // GAME_RULES 5절
export const LEVEL_EXP_COEFFICIENT = 25; // GAME_RULES 5절
export const CUMULATIVE_EXP_DIVISOR = 3; // DATABASE 7-1절 (GAME_RULES 5절 공식의 합)
export const PIECES_PER_SUCCESS = 1; // GAME_RULES 3절, v1.2 드롭 추첨

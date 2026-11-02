export const CONFIG_VERSION = 'v1.1'; // GAME_RULES 7절
export const IDLE_CAP_SECONDS = 28800; // GAME_RULES 2절
export const CLAIM_MIN_SECONDS = 60; // GAME_RULES 2절
export const PIECE_SLOT_SECONDS = 300; // GAME_RULES 2절
export const PIECE_SUCCESS_PERCENT = 50; // GAME_RULES 3절
export const PIECE_PITY_FAILS = 3; // GAME_RULES 3절
export const PIECE_MAX_JUDGMENTS_PER_SETTLEMENT = 96; // GAME_RULES 3절
export const LEVEL_GOLD_BONUS_PERCENT_PER_LEVEL = 5; // GAME_RULES 5절
export const MAX_LEVEL = 20; // GAME_RULES 2·5절
export const QUIZ_REWARD_GOLD = 100; // GAME_RULES 6절
export const QUIZ_REWARD_EXP = 20; // GAME_RULES 6절
export const QUIZ_QUESTIONS_PER_SET = 3; // GAME_RULES 7절, API 0-0절
export const IDEMPOTENCY_TTL_HOURS = 24; // API 0-0절, DATABASE 7-1절
export const NAME_MIN_LENGTH = 2; // API 0-0절, DATABASE 7-1절
export const NAME_MAX_LENGTH = 10; // API 0-0절, DATABASE 7-1절
// 기획이 목록을 주기 전까지 비어 있습니다 (API 0-0, TBD).
export const BANNED_WORDS: readonly string[] = [];
export const REMAINDER_DIVISOR = 6000; // GAME_RULES 2·6절

// 공식에 포함된 계수도 같은 파일에서 관리한다.
export const BASE_PERCENT = 100; // GAME_RULES 5·6절
export const INITIAL_LEVEL = 1; // GAME_RULES 5절
export const INITIAL_EQUIPMENT_STAGE = 1; // GAME_RULES 5절
export const LEVEL_EXP_BASE = 50; // GAME_RULES 5절
export const LEVEL_EXP_COEFFICIENT = 25; // GAME_RULES 5절
export const CUMULATIVE_EXP_DIVISOR = 3; // DATABASE 7-1절 (GAME_RULES 5절 공식의 합)
export const PIECES_PER_SUCCESS = 1; // GAME_RULES 3절

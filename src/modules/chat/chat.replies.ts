import {
  EQUIPMENT_UPGRADE_SEED,
  GOLD_BONUS_STAT,
  REGION_SEED,
  REQUIRED_PIECES,
} from '../../database/seeds/seed-data';
import {
  CLAIM_MIN_SECONDS,
  IDLE_CAP_SECONDS,
  LEVEL_GOLD_BONUS_PERCENT_PER_LEVEL,
  MAX_LEVEL,
  MOB_INTERVAL_SECONDS,
  PIECE_PITY_FAILS,
  QUIZ_QUESTIONS_PER_SET,
  QUIZ_REWARD_EXP,
  QUIZ_REWARD_GOLD,
} from '../settlement/game-rules.constants';

export type FixedTopic =
  | 'QUIZ_ANSWER'
  | 'QUIZ'
  | 'EQUIPMENT'
  | 'UNLOCK'
  | 'PIECES'
  | 'LEVEL'
  | 'MOB'
  | 'IDLE'
  | 'GOLD'
  | 'REGIONS'
  | 'NICKNAME'
  | 'SHOP'
  | 'START'
  | 'COMPLAINT'
  | 'THANKS'
  | 'GREETING'
  | 'FAREWELL'
  | 'CAPABILITY'
  | 'NEED_NAME';

const IDLE_CAP_HOURS = IDLE_CAP_SECONDS / 3600;
const ACTIVE_REGIONS = REGION_SEED.filter((region) => region.active).map(
  (region) => region.name,
);
const ALL_REGIONS = REGION_SEED.map((region) => region.name);
const UPGRADE_COSTS = EQUIPMENT_UPGRADE_SEED.map(
  (row) => `${row.upgrade}단계 ${row.cost}골드(레벨 ${row.requiredLevel})`,
).join(', ');

/** 게임 안내의 수치는 게임 규칙 상수에서 읽어 규칙과 어긋나지 않게 합니다. */
const REPLIES: Readonly<Record<FixedTopic, string>> = {
  QUIZ_ANSWER:
    '퀴즈 정답은 미리 알려 드릴 수 없어요.\n제출하고 나면 정답과 해설을 확인할 수 있어요.',
  QUIZ: `퀴즈는 하루에 한 번 참여할 수 있고 ${QUIZ_QUESTIONS_PER_SET}문제가 나와요.\n참여하면 맞힌 개수와 상관없이 ${QUIZ_REWARD_GOLD}골드와 경험치 ${QUIZ_REWARD_EXP}을 받아요.`,
  EQUIPMENT: `장비 강화는 항상 성공하고, 한 단계마다 골드 보너스가 ${GOLD_BONUS_STAT.ratio}%p씩 올라가요.\n비용은 ${UPGRADE_COSTS}예요.`,
  UNLOCK: `지금 지역의 특산물 조각을 ${REQUIRED_PIECES}개 모으면 다음 지역이 열려요.\n조각은 해금해도 줄어들지 않고, 지역 지도에서 직접 이동할 수 있어요.`,
  PIECES: `탐험 중에 몬스터를 잡을 때마다 지역별 확률로 특산물 조각이 나와요.\n${PIECE_PITY_FAILS}번 연속으로 나오지 않으면 다음 몬스터에서는 반드시 나와요. 레벨이나 장비는 확률에 영향을 주지 않아요.`,
  LEVEL: `탐험과 퀴즈로 경험치를 모으면 레벨이 올라가요.\n레벨 1에서 ${MAX_LEVEL}까지 오를 수 있고, 레벨이 하나 오를 때마다 골드 보너스가 ${LEVEL_GOLD_BONUS_PERCENT_PER_LEVEL}%p씩 늘어요.`,
  MOB: `몬스터는 탐험 중에 ${MOB_INTERVAL_SECONDS}초마다 한 마리씩 자동으로 잡아요.\n따로 조작하지 않아도 골드, 경험치, 특산물 조각이 쌓여요.`,
  IDLE: `게임을 꺼 두어도 탐험 보상은 최대 ${IDLE_CAP_HOURS}시간까지 쌓여요.\n마지막으로 보상을 받은 뒤 ${CLAIM_MIN_SECONDS}초가 지나면 탐험 화면에서 다시 받을 수 있어요.`,
  GOLD: `골드는 탐험하는 동안 자동으로 쌓이고, 퀴즈에 참여해도 ${QUIZ_REWARD_GOLD}골드를 받아요.\n높은 지역으로 이동하거나 장비를 강화하면 더 빨리 모을 수 있어요.`,
  REGIONS: `경북 원정대의 지역은 ${ALL_REGIONS.join(', ')}까지 ${ALL_REGIONS.length}곳이에요.\n지금은 ${ACTIVE_REGIONS.join(', ')}을 탐험할 수 있어요.`,
  NICKNAME:
    '지금은 캐릭터 이름을 바꾸는 기능이 없어요.\n처음 만들 때 정한 이름을 계속 사용해요.',
  SHOP: '상점 탭에서 과수원과 옵션을 고르는 화면을 볼 수 있어요.\n지금은 시연용 화면이라 실제 결제와 배송은 진행되지 않아요.',
  START: `탐험 지도에서 지역을 고르고 탐험에 들어가면 캐릭터가 자동으로 몬스터를 잡아요.\n쌓인 보상을 받고, 장비를 강화하고, 특산물 조각 ${REQUIRED_PIECES}개를 모아 다음 지역을 열어 보세요!`,
  COMPLAINT:
    '제대로 답하지 못해 죄송해요.\n"곶감 맛은 어때?", "사과 얼마야?", "강화 비용 알려 줘"처럼 궁금한 내용을 함께 적어 주시면 다시 찾아볼게요.',
  THANKS:
    '도움이 되었다니 다행이에요!\n또 궁금한 특산물이나 게임 방법이 있으면 물어봐 주세요.',
  GREETING:
    '안녕하세요! 경북 원정대 탐험 도우미예요.\n특산물 추천, 맛과 소개, 시세, 게임 방법을 물어봐 주세요.',
  FAREWELL: '즐거운 탐험 되세요!\n궁금한 게 생기면 또 찾아 주세요.',
  CAPABILITY:
    '경북 특산물을 취향과 예산에 맞춰 추천하고, 맛과 소개, 시세를 알려 드려요.\n강화, 해금, 퀴즈 같은 게임 방법도 물어봐 주세요.',
  NEED_NAME:
    '어떤 특산물이 궁금하세요?\n"곶감 얼마야?"처럼 특산물 이름을 함께 적어 주세요.',
};

const includesAny = (text: string, words: readonly string[]) =>
  words.some((word) => text.includes(word));

// 위에서부터 먼저 맞는 주제를 씁니다. "퀴즈 보상"은 퀴즈, "조각 몇 개 모아야 해금돼"는 해금입니다.
const GAME_TOPICS: ReadonlyArray<readonly [FixedTopic, readonly string[]]> = [
  ['QUIZ', ['퀴즈', '문제풀']],
  ['EQUIPMENT', ['강화', '장비', '업글', '업그레이드', '무기']],
  [
    'UNLOCK',
    [
      '해금',
      '잠겨',
      '잠긴',
      '다음지역',
      '열려면',
      '여는법',
      '언제열',
      '어떻게가',
      '가려면',
      '가는법',
      '넘어가',
      '못가',
    ],
  ],
  ['PIECES', ['조각', '드롭', '확률']],
  ['LEVEL', ['레벨', '경험치', '렙업']],
  ['MOB', ['몬스터', '몹', '전투']],
  [
    'IDLE',
    [
      '방치',
      '수령',
      '보상',
      '자리비',
      '꺼놓',
      '꺼두',
      '꺼도',
      '오프라인',
      '자는동안',
      '모인거',
      '쌓인',
      '쌓여',
    ],
  ],
  ['GOLD', ['골드', '돈벌', '재화', '돈부족', '돈이부족', '돈없', '돈모으']],
  [
    'REGIONS',
    [
      '지역이몇',
      '몇개지역',
      '몇곳',
      '무슨지역',
      '어떤지역',
      '어디어디',
      '지역종류',
      '지역목록',
      '지역뭐',
      '어디나와',
    ],
  ],
  ['NICKNAME', ['닉네임', '이름바꾸', '이름변경']],
  [
    'START',
    [
      '게임방법',
      '어떻게하는',
      '하는법',
      '뭐부터',
      '처음인데',
      '초보',
      '튜토리얼',
      '어떻게시작',
    ],
  ],
];

const SHOP_WORDS = ['상점', '결제', '배송', '주문', '환불', '구매'];
const COMPLAINT_WORDS = [
  '같은말',
  '똑같은',
  '못알아',
  '이해못',
  '이상해',
  '멍청',
  '바보',
  '답답',
  '짜증',
  '말귀',
  '뭔소리',
  '무슨소리',
  '틀렸',
  '이상하',
  '이상한',
  '다시해',
  '엉뚱',
  '아니잖',
];
const THANKS_WORDS = ['고마워', '고맙', '감사', '땡큐', 'ㄱㅅ'];
const GREETING_WORDS = [
  '안녕',
  '하이',
  '반가워',
  '헬로',
  '처음뵙',
  'ㅎㅇ',
  '안뇽',
];
const FAREWELL_WORDS = [
  '잘가',
  '잘있어',
  '다음에봐',
  '바이바이',
  '수고',
  '또봐',
  '담에',
  'ㅂㅂ',
  'ㅂㅇ',
];
const CAPABILITY_WORDS = [
  '뭐할수있',
  '뭘할수있',
  '무엇을할수',
  '도움말',
  '넌누구',
  '너누구',
  '누구야',
  '뭐하는',
  '도와줄수',
  '뭘도와',
  '뭐도와',
  '무슨기능',
  '뭐해줄',
];
const POINTING_WORDS = ['그거', '그건', '이거', '이건', '저거', '저건'];
const NAMELESS_QUESTION_WORDS = [
  '얼마',
  '시세',
  '가격',
  '맛있어',
  '맛은',
  '맛이',
];

interface ReplyContext {
  /** 특산물을 가리킨 질문입니다. */
  hasItem: boolean;
  /** 취향이나 예산을 말한 추천 요청입니다. */
  hasPreference: boolean;
}

/** 자료 조회나 AI 없이 정해진 문장으로 답할 주제를 고릅니다. */
export function fixedTopic(
  message: string,
  context: ReplyContext,
): FixedTopic | null {
  const compact = message.replace(/\s+/g, '');
  if (
    includesAny(compact, ['퀴즈', '문제']) &&
    includesAny(compact, ['정답', '답알려', '답뭐', '답이', '답좀', '답머'])
  ) {
    return 'QUIZ_ANSWER';
  }
  for (const [topic, words] of GAME_TOPICS) {
    if (includesAny(compact, words)) {
      return topic;
    }
  }
  if (context.hasItem) {
    return null;
  }
  if (includesAny(compact, SHOP_WORDS)) {
    return 'SHOP';
  }
  if (context.hasPreference) {
    return null;
  }
  if (includesAny(compact, COMPLAINT_WORDS)) {
    return 'COMPLAINT';
  }
  if (includesAny(compact, THANKS_WORDS)) {
    return 'THANKS';
  }
  if (includesAny(compact, CAPABILITY_WORDS)) {
    return 'CAPABILITY';
  }
  if (includesAny(compact, GREETING_WORDS)) {
    return 'GREETING';
  }
  if (includesAny(compact, FAREWELL_WORDS)) {
    return 'FAREWELL';
  }
  if (
    includesAny(compact, POINTING_WORDS) ||
    includesAny(compact, NAMELESS_QUESTION_WORDS)
  ) {
    return 'NEED_NAME';
  }
  return null;
}

const GAME_KNOWLEDGE_TOPICS: FixedTopic[] = [
  'START',
  'MOB',
  'IDLE',
  'GOLD',
  'PIECES',
  'UNLOCK',
  'REGIONS',
  'EQUIPMENT',
  'LEVEL',
  'QUIZ',
  'NICKNAME',
  'SHOP',
];

/** AI 에게 줄 게임 안내입니다. 정해진 답변과 같은 문장을 써서 내용이 어긋나지 않게 합니다. */
export function gameKnowledge(): string {
  return GAME_KNOWLEDGE_TOPICS.map((topic) =>
    REPLIES[topic].replace(/\n/g, ' '),
  ).join('\n');
}

export function fixedReply(topic: FixedTopic): string {
  return REPLIES[topic];
}

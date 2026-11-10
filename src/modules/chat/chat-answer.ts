import {
  CATALOG,
  CatalogItem,
  Taste,
  TASTE_ADJECTIVE,
  TASTE_WORDS,
} from './chat.catalog';

export interface ChatIntent {
  tastes: Taste[];
  budget: number | null;
  named: CatalogItem[];
  asksPrice: boolean;
  asksTaste: boolean;
  asksInfo: boolean;
  asksBuy: boolean;
  asksPlace: boolean;
  asksRecommend: boolean;
}

export interface PriceFact {
  regionProductId: number;
  kind: string;
  area: string;
  label: string;
  unit: string;
  price: number;
  yearAgoPrice: number | null;
  surveyDate: string;
}

/** DB 에 등록된 소개문입니다. 출처를 확인한 문장만 있으며 없으면 null 입니다. */
export interface ContentFact {
  id: number;
  description: string | null;
  regionDescription: string | null;
}

export interface ChatFacts {
  intent: ChatIntent;
  item: CatalogItem | null;
  /** 질문에 함께 나온 다른 특산물까지 포함합니다. */
  items: CatalogItem[];
  content: ContentFact | null;
  prices: PriceFact[];
  /** 예산 조건 때문에 추천을 고르지 못했습니다. */
  overBudget: boolean;
  /** 답할 수 있는 시세가 없습니다. */
  noPrice: boolean;
}

const PRICE_WORDS = ['얼마', '시세', '가격', '단가', '값', '비싸', '싸'];
// '어떻게'는 방법을 묻는 말이라 맛 질문으로 보지 않습니다.
const TASTE_ASK_WORDS = ['어때', '어떤가', '어떨', '어떠', '어떻나', '어떻습'];
const TASTE_QUALITY_WORDS = [
  '매워',
  '매운',
  '맵',
  '비린',
  '달아',
  '달콤',
  '달달',
  '쌉',
  '짠',
  '짜요',
  '짜나',
  '쫄깃',
  '쫀득',
  '아삭',
  '새콤',
  '시어',
  '셔요',
  '떫',
];
const RECOMMEND_WORDS = [
  '추천',
  '골라',
  '뭐먹',
  '뭐가맛',
  '뭐살',
  '뭐가좋',
  '가성비',
  '특산품',
  '특산물',
  '먹을만',
  '맛있는거',
  '맛난거',
  '할만한거',
];
const OFF_TOPIC_WORDS = ['노래', '영화', '드라마', '웹툰', '날씨', '코딩'];
const INFO_WORDS = [
  '설명',
  '소개',
  '특징',
  '뭐야',
  '뭐예요',
  '뭔가요',
  '무엇',
  '유래',
  '역사',
  '궁금',
  '만들',
  '먹는법',
  '어떻게먹',
  '원산지',
  '유명',
];
const BUY_WORDS = [
  '구매',
  '주문',
  '살수',
  '사고싶',
  '사려면',
  '살래',
  '어디서사',
  '배송',
  '판매',
  '상품',
  '택배',
  '시킬',
  '시켜',
  '장바구니',
  '살게',
  '살려고',
  '살까',
  '구입',
  '사먹',
  '팔아',
  '파는',
  '파나',
];
const PLACE_WORDS = [
  '어떤곳',
  '어디',
  '동네',
  '여행',
  '관광',
  '지역이야',
  '곳이야',
];

// 특산물·맛·가격 단어처럼 보이지만 뜻이 다른 표현을 먼저 지웁니다.
const LOOKALIKE_PATTERNS = [
  /사과(?=하|할|해|합|드리|드릴)/g,
  /안동안/g,
  /풍기(?=는|다|고|며|면|지)/g,
  /상주(?=하|인구|직원|근무)/g,
  /영주권/g,
  /의성어/g,
  /싸우|싸움|싸워/g,
  /간단/g,
  /얼마나(?=\s*(?:맛|달|좋|많|오래|걸))/g,
  /(?:사과|곶감|참외|마늘|오미자|과메기|인삼|고등어)\s*같(?=은|이|다|아)/g,
  /마늘\s*까는\s*소리/g,
];
const FORBIDDEN_WORDS = [
  '보장',
  '무조건',
  '최저가',
  '확실히',
  '저렴',
  '훨씬',
  '비싸',
  '더 싸',
  '싸니',
  '싸요',
  '보통',
  '건강에',
  '효능',
  '제철',
];

/** 메시지에서 예산을 원 단위로 읽습니다. 예: 2만 원, 1만5천원, 20,000원 */
export function parseBudget(message: string): number | null {
  const man = /(\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?/.exec(message);
  if (man) {
    return Math.round(
      Number(man[1]) * 10000 + (man[2] ? Number(man[2]) * 1000 : 0),
    );
  }
  const cheon = /(\d+)\s*천\s*원/.exec(message);
  if (cheon) {
    return Number(cheon[1]) * 1000;
  }
  const won = /(\d[\d,]*)\s*원/.exec(message);
  return won ? Number(won[1].replace(/,/g, '')) : null;
}

/** 특산물 이름을 먼저 보고, 없을 때만 지역 이름으로 찾습니다. '안동 사과'는 사과입니다. */
function namedItems(message: string): CatalogItem[] {
  const byProduct = CATALOG.filter((item) => message.includes(item.aliases[0]));
  return byProduct.length
    ? byProduct
    : CATALOG.filter((item) =>
        item.aliases.some((alias) => message.includes(alias)),
      );
}

export function parseChatMessage(original: string): ChatIntent {
  const message = LOOKALIKE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, ' '),
    original,
  );
  const compact = message.replace(/\s+/g, '');
  const has = (words: string[]) => words.some((word) => compact.includes(word));
  const asksPrice = PRICE_WORDS.some((word) => message.includes(word));
  const asksBuy = has(BUY_WORDS);
  const offTopic = has(OFF_TOPIC_WORDS);
  const padded = `${message} `;
  const tastes = (Object.keys(TASTE_WORDS) as Taste[]).filter((taste) =>
    TASTE_WORDS[taste].some((word) => padded.includes(word)),
  );
  return {
    tastes,
    budget: parseBudget(message),
    named: offTopic ? [] : namedItems(message),
    asksPrice,
    asksTaste:
      has(['맛']) ||
      has(TASTE_QUALITY_WORDS) ||
      (has(TASTE_ASK_WORDS) && !asksPrice && !asksBuy),
    asksInfo:
      has(INFO_WORDS) ||
      (compact.includes('알려') && !asksPrice && !asksBuy && !has(['맛'])),
    asksBuy,
    asksPlace: has(PLACE_WORDS) && !asksBuy,
    asksRecommend: has(RECOMMEND_WORDS) && !offTopic,
  };
}

/** 정해진 답변을 고를 때 쓰는 질문의 성격입니다. */
export function replyContext(intent: ChatIntent) {
  return {
    hasItem: intent.named.length > 0,
    hasPreference:
      intent.tastes.length > 0 ||
      intent.budget !== null ||
      intent.asksRecommend,
  };
}

/** 예산과 비교할 수 있는 금액입니다. 도매 경매가는 소비자 가격이 아니므로 쓰지 않습니다. */
export function knownPrice(
  item: CatalogItem,
  prices: PriceFact[],
): number | null {
  const candidates = prices
    .filter((p) => p.regionProductId === item.id && p.kind === 'RETAIL')
    .map((p) => p.price);
  if (item.shop) {
    candidates.push(item.shop.fromPrice);
  }
  return candidates.length ? Math.min(...candidates) : null;
}

export function chooseItem(
  intent: ChatIntent,
  prices: PriceFact[],
): { item: CatalogItem | null; overBudget: boolean } {
  if (intent.named.length) {
    return { item: intent.named[0], overBudget: false };
  }
  if (!intent.tastes.length && intent.budget === null) {
    return { item: null, overBudget: false };
  }
  const scored = CATALOG.map((item) => ({
    item,
    score: intent.tastes.filter((taste) => item.tastes.includes(taste)).length,
    price: knownPrice(item, prices),
  })).filter((row) => intent.tastes.length === 0 || row.score > 0);
  const fits = scored.filter(
    (row) =>
      intent.budget === null ||
      (row.price !== null && row.price <= intent.budget),
  );
  fits.sort((a, b) => b.score - a.score || a.item.id - b.item.id);
  return { item: fits[0]?.item ?? null, overBudget: fits.length === 0 };
}

const KIND_ORDER: Record<string, number> = {
  RETAIL: 0,
  AUCTION: 1,
  NATIONAL: 2,
};

/** 답변에 넣을 시세를 종류별로 하나씩 고릅니다. 안동·청송처럼 게임 지역과 같은 값을 먼저 씁니다. */
export function selectPrices(
  item: CatalogItem,
  prices: PriceFact[],
): PriceFact[] {
  const own = prices.filter((p) => p.regionProductId === item.id);
  const picked = new Map<string, PriceFact>();
  for (const price of own) {
    const current = picked.get(price.kind);
    if (
      !current ||
      (price.area.includes(item.region) && !current.area.includes(item.region))
    ) {
      picked.set(price.kind, price);
    }
  }
  return [...picked.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

export function buildFacts(
  intent: ChatIntent,
  prices: PriceFact[],
  contents: ContentFact[] = [],
): ChatFacts {
  const { item, overBudget } = chooseItem(intent, prices);
  const shown = item && intent.asksPrice ? selectPrices(item, prices) : [];
  return {
    intent,
    item,
    items: intent.named.length ? intent.named : item ? [item] : [],
    content: contents.find((row) => row.id === item?.id) ?? null,
    prices: shown,
    overBudget,
    noPrice: Boolean(item && intent.asksPrice && shown.length === 0),
  };
}

function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code % 28 !== 0;
}

const object = (word: string) =>
  `${word}${hasFinalConsonant(word) ? '을' : '를'}`;
const topic = (word: string) =>
  `${word}${hasFinalConsonant(word) ? '은' : '는'}`;
const won = (price: number) => `${price.toLocaleString('ko-KR')}원`;

function dateLabel(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일`;
}

export function priceSentence(price: PriceFact): string {
  const when = dateLabel(price.surveyDate);
  if (price.kind === 'RETAIL') {
    return `${when} ${price.area} 소매가 기준으로 ${price.label} ${topic(price.unit)} ${won(price.price)}이에요.`;
  }
  if (price.kind === 'AUCTION') {
    return `${when} ${price.area} 산지 도매 경매가는 kg당 약 ${won(price.price)}이에요.`;
  }
  return price.yearAgoPrice
    ? `전국 소매 평균 ${price.label} ${topic(price.unit)} ${when} 기준 ${won(price.price)}이고, 1년 전에는 ${won(price.yearAgoPrice)}이었어요.`
    : `전국 소매 평균 ${price.label} ${topic(price.unit)} ${when} 기준 ${won(price.price)}이에요.`;
}

function openingSentence(intent: ChatIntent): string {
  const adjectives = intent.tastes
    .map((taste) => TASTE_ADJECTIVE[taste])
    .filter(Boolean);
  if (!adjectives.length) {
    if (intent.tastes.includes('seafood')) {
      return '해산물을 찾으시는군요!';
    }
    if (intent.tastes.includes('fruit')) {
      return '과일을 찾으시는군요!';
    }
    return '찾으시는 특산물을 골라 봤어요.';
  }
  const noun = intent.tastes.includes('fruit')
    ? '과일을'
    : intent.tastes.includes('seafood')
      ? '해산물을'
      : '맛을';
  return `${adjectives.join(', ')} ${noun} 좋아하시는군요!`;
}

const TASTE_STEMS: Partial<Record<Taste, string>> = {
  sweet: '달콤',
  crisp: '아삭',
  sour: '새콤',
  salty: '짭짤',
  savory: '고소',
  spicy: '알싸',
  chewy: '쫀득',
};

function tasteSentence(item: CatalogItem): string | null {
  const stems = item.tastes.flatMap((taste) => TASTE_STEMS[taste] ?? []);
  return stems.length
    ? `${item.region} ${topic(item.name)} ${stems.join('하고 ')}한 맛으로 소개하고 있어요.`
    : null;
}

function noTasteSentence(item: CatalogItem): string {
  return `${item.name}의 맛 설명은 아직 준비 중이에요.`;
}

function infoLines(item: CatalogItem, description: string | null): string[] {
  if (description) {
    return [description];
  }
  return [
    tasteSentence(item) ?? `${item.region}의 특산물이에요.`,
    `${item.name}의 자세한 소개는 아직 준비 중이에요.`,
  ];
}

function buyLine(item: CatalogItem): string {
  return item.shop
    ? `상점 탭의 ${item.shop.title} 상품에서 옵션을 볼 수 있어요. 지금은 시연용 화면이라 실제 결제와 배송은 진행되지 않아요.`
    : `${item.name} 상품은 아직 상점에 등록되지 않았어요.`;
}

function placeLine(item: CatalogItem, description: string | null): string {
  return (
    description ??
    `${topic(item.name)} ${item.region}의 특산물이에요. 지역 소개는 아직 준비 중이에요.`
  );
}

/** 특산물 이름이 나온 질문에 물어본 내용만 답합니다. */
function namedLines(facts: ChatFacts, item: CatalogItem): string[] {
  const { intent, content } = facts;
  if (intent.named.length > 1 && !intent.asksPrice && !intent.asksBuy) {
    return intent.named.map(
      (named) => tasteSentence(named) ?? noTasteSentence(named),
    );
  }
  const lines: string[] = [];
  if (intent.asksPlace) {
    lines.push(placeLine(item, content?.regionDescription ?? null));
  }
  if (intent.asksTaste) {
    lines.push(tasteSentence(item) ?? noTasteSentence(item));
  }
  if (intent.asksInfo) {
    const info = infoLines(item, content?.description ?? null);
    lines.push(...info.filter((line) => !lines.includes(line)));
  }
  if (intent.asksBuy) {
    lines.push(buyLine(item));
  }
  if (!lines.length && !intent.asksPrice) {
    lines.push(tasteSentence(item) ?? `${item.region}의 특산물이에요.`);
    lines.push('맛, 소개, 시세 중에서 궁금한 내용을 물어봐 주세요.');
  }
  return lines;
}

export function renderTemplate(facts: ChatFacts): string {
  const { item, intent } = facts;
  if (facts.overBudget) {
    return '말씀하신 조건과 예산에 맞는 특산물은 찾지 못했어요.\n예산을 조금 늘리거나 다른 맛을 알려 주시겠어요?';
  }
  if (!item) {
    return '어떤 맛을 좋아하시나요?\n달콤한 과일, 짭짤한 해산물처럼 취향이나 예산을 알려 주시면 경북 특산물을 추천해 드릴게요!';
  }
  const lines: string[] = [];
  if (intent.named.length) {
    lines.push(...namedLines(facts, item));
  } else {
    lines.push(openingSentence(intent));
    lines.push(`${item.region} ${object(item.name)} 추천해 드릴게요.`);
  }
  for (const price of facts.prices) {
    lines.push(priceSentence(price));
  }
  if (facts.noPrice) {
    lines.push(`${item.name}의 시세 자료는 아직 없어요.`);
  }
  return lines.join('\n');
}

/** 소개문과 맛 안내는 검수한 문장 그대로 답합니다. AI 는 추천과 시세 문장만 다듬습니다. */
export function canRewrite(facts: ChatFacts): boolean {
  const { intent } = facts;
  if (!facts.item) {
    return false;
  }
  return (
    !intent.named.length ||
    (intent.asksPrice &&
      !intent.asksInfo &&
      !intent.asksPlace &&
      !intent.asksTaste)
  );
}

/** 답변에 나와도 되는 숫자입니다. 사실 카드에 없는 숫자는 AI 답변에서 거절합니다. */
export function allowedNumbers(
  facts: ChatFacts,
  template: string,
): Set<string> {
  const allowed = new Set<string>(['1']);
  for (const match of template.matchAll(/\d[\d,]*/g)) {
    allowed.add(match[0].replace(/,/g, ''));
  }
  return allowed;
}

/** AI 답변을 그대로 내보내도 되는지 검사합니다. 실패하면 정형 답변을 씁니다. */
export function isAcceptableReply(
  reply: string,
  facts: ChatFacts,
  template: string,
): boolean {
  const text = reply.trim();
  // 초안보다 크게 길어진 답변은 자료에 없는 설명을 덧붙였을 가능성이 높습니다.
  const maxLength = Math.min(300, Math.round(template.length * 1.5) + 20);
  if (!text || text.length > maxLength) {
    return false;
  }
  if (FORBIDDEN_WORDS.some((word) => text.includes(word))) {
    return false;
  }
  if (!facts.prices.length && /가격|예산/.test(text)) {
    return false;
  }
  const sentences = text
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.replace(/[~\s]+$/, ''))
    .filter(Boolean);
  if (!sentences.every((sentence) => /(요|니다|죠)$/.test(sentence))) {
    return false;
  }
  const allowed = allowedNumbers(facts, template);
  for (const match of text.matchAll(/\d[\d,]*/g)) {
    if (!allowed.has(match[0].replace(/,/g, ''))) {
      return false;
    }
  }
  if (!facts.item) {
    return !CATALOG.some((item) => text.includes(item.name));
  }
  if (!text.includes(facts.item.name.replace('간', ''))) {
    return false;
  }
  return !CATALOG.some(
    (item) => item.id !== facts.item?.id && text.includes(item.name),
  );
}

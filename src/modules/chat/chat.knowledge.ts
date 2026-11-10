import { REGION_SEED } from '../../database/seeds/seed-data';
import {
  ContentFact,
  knownPrice,
  PriceFact,
  priceSentence,
  selectPrices,
} from './chat-answer';
import { CATALOG, CatalogItem, Taste } from './chat.catalog';
import { gameKnowledge } from './chat.replies';

export interface AiAnswer {
  reply: string;
  /** 추천하거나 상품을 안내한 특산물 이름입니다. 없으면 null 입니다. */
  specialty: string | null;
}

const MAX_REPLY_LENGTH = 400;
const FLAVOR_LABELS: Partial<Record<Taste, string>> = {
  sweet: '달콤',
  crisp: '아삭',
  sour: '새콤',
  salty: '짭짤',
  savory: '고소',
  spicy: '알싸',
  chewy: '쫀득',
};
const KIND_LABELS: Partial<Record<Taste, string>> = {
  fruit: '과일',
  seafood: '해산물',
  healthy: '건강을 챙길 때 찾는 식품',
  gift: '선물용',
  snack: '술안주',
};
const NOT_READY = '아직 준비 중';
const FORBIDDEN_PHRASES = [
  '최저가',
  '무조건',
  '보장',
  '확실히',
  '효능',
  '시스템 프롬프트',
  '**',
  '```',
];

function itemLine(
  item: CatalogItem,
  prices: PriceFact[],
  contents: ContentFact[],
): string {
  const content = contents.find((row) => row.id === item.id);
  const active = REGION_SEED.some(
    (region) => region.name === item.region && region.active,
  );
  const lines = [
    `- ${item.region} ${item.name} (${active ? '탐험 가능' : '아직 탐험 불가'})`,
    `  맛: ${item.tastes.flatMap((taste) => FLAVOR_LABELS[taste] ?? []).join(', ') || NOT_READY}`,
    `  종류: ${item.tastes.flatMap((taste) => KIND_LABELS[taste] ?? []).join(', ') || NOT_READY}`,
    `  소개: ${content?.description ?? NOT_READY}`,
    `  지역 소개: ${content?.regionDescription ?? NOT_READY}`,
    `  상점 상품: ${item.shop ? `${item.shop.title}, ${item.shop.fromPrice}원부터` : '없음'}`,
  ];
  const sentences = selectPrices(item, prices).map(priceSentence);
  lines.push(`  시세: ${sentences.length ? sentences.join(' ') : NOT_READY}`);
  return lines.join('\n');
}

/** AI 가 답변 근거로 쓸 수 있는 자료 전체입니다. 이 밖의 사실은 쓰지 못하게 합니다. */
export function buildKnowledge(
  prices: PriceFact[],
  contents: ContentFact[],
): string {
  return [
    '[게임 안내]',
    gameKnowledge(),
    '',
    '[특산물]',
    ...CATALOG.map((item) => itemLine(item, prices, contents)),
  ].join('\n');
}

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*/g)].map((match) =>
    match[0].replace(/,/g, ''),
  );
}

/** AI 답변을 내보내도 되는지 검사합니다. 실패하면 정해진 답변을 씁니다. */
export function isGroundedAnswer(
  answer: AiAnswer,
  context: {
    knowledge: string;
    message: string;
    budget: number | null;
    prices: PriceFact[];
  },
): boolean {
  const text = answer.reply.trim();
  if (!text || text.length > MAX_REPLY_LENGTH) {
    return false;
  }
  if (FORBIDDEN_PHRASES.some((phrase) => text.includes(phrase))) {
    return false;
  }
  const allowed = new Set([
    ...numbersIn(context.knowledge),
    ...numbersIn(context.message),
  ]);
  if (numbersIn(text).some((number) => !allowed.has(number))) {
    return false;
  }
  const ending = text.replace(/[\s.!?~…]+$/, '');
  if (!/(요|니다|죠|까)$/.test(ending)) {
    return false;
  }
  if (answer.specialty === null) {
    return true;
  }
  const item = CATALOG.find((row) => row.name === answer.specialty);
  if (!item) {
    return false;
  }
  if (context.budget === null) {
    return true;
  }
  const price = knownPrice(item, context.prices);
  return price !== null && price <= context.budget;
}

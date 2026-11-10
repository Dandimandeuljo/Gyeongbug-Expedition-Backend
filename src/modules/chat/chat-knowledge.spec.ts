import { ContentFact, PriceFact } from './chat-answer';
import { AiAnswer, buildKnowledge, isGroundedAnswer } from './chat.knowledge';

const PRICES: PriceFact[] = [
  {
    regionProductId: 2,
    kind: 'RETAIL',
    area: '안동',
    label: '국산(염장)',
    unit: '1손',
    price: 7180,
    yearAgoPrice: null,
    surveyDate: '2026-11-06',
  },
];
const CONTENTS: ContentFact[] = [
  { id: 2, description: '간고등어 소개문입니다.', regionDescription: null },
];
const knowledge = buildKnowledge(PRICES, CONTENTS);

const check = (
  reply: string,
  specialty: string | null = null,
  extra: { message?: string; budget?: number | null } = {},
) => {
  const answer: AiAnswer = { reply, specialty };
  return isGroundedAnswer(answer, {
    knowledge,
    message: extra.message ?? '안녕',
    budget: extra.budget ?? null,
    prices: PRICES,
  });
};

describe('챗봇 AI 자료', () => {
  it('게임 규칙, 특산물, 소개문, 시세를 담는다', () => {
    expect(knowledge).toContain('최대 8시간');
    expect(knowledge).toContain('안동 간고등어 (탐험 가능)');
    expect(knowledge).toContain('상주 곶감 (아직 탐험 불가)');
    expect(knowledge).toContain('간고등어 소개문입니다.');
    expect(knowledge).toContain('7,180원');
    expect(knowledge).toContain('햇살 과수원 사과');
  });

  it('소개와 시세가 없으면 없다고 적는다', () => {
    const line = knowledge.split('\n- ').find((row) => row.startsWith('상주'));
    expect(line).toContain('소개: 아직 준비 중');
    expect(line).toContain('맛: 달콤, 쫀득');
    expect(line).toContain('시세: 아직 준비 중');
  });
});

describe('챗봇 AI 답변 검사', () => {
  it('자료에 있는 숫자로 쓴 존댓말을 통과시킨다', () => {
    expect(check('안동 간고등어 1손은 7,180원이에요.')).toBe(true);
    expect(check('대구는 아직 탐험 지역이 아니에요!')).toBe(true);
  });

  it('질문에 나온 숫자는 그대로 말할 수 있다', () => {
    expect(
      check('12345명은 자료에 없어요.', null, { message: '12345명?' }),
    ).toBe(true);
  });

  it.each([
    ['자료에 없는 숫자', '간고등어 1손은 9,999원이에요.'],
    ['반말', '간고등어는 맛있어'],
    ['단정 표현', '사과는 무조건 사세요.'],
    ['효능', '인삼은 효능이 있어요.'],
    ['마크다운', '**사과**를 추천해요.'],
    ['빈 답변', '   '],
    ['지나치게 긴 답변', `${'가'.repeat(401)}요.`],
  ])('%s 은 거절한다', (_name, reply) => {
    expect(check(reply)).toBe(false);
  });

  it('목록에 없는 특산물을 고르면 거절한다', () => {
    expect(check('한우를 추천해요.', '한우')).toBe(false);
  });

  it('예산을 넘거나 가격을 모르는 추천은 거절한다', () => {
    expect(check('간고등어를 추천해요.', '간고등어', { budget: 5000 })).toBe(
      false,
    );
    expect(check('곶감을 추천해요.', '곶감', { budget: 50000 })).toBe(false);
    expect(check('간고등어를 추천해요.', '간고등어', { budget: 10000 })).toBe(
      true,
    );
  });
});

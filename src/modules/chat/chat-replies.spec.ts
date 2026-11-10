import {
  buildFacts,
  canRewrite,
  ContentFact,
  parseChatMessage,
  renderTemplate,
  replyContext,
} from './chat-answer';
import { FixedTopic, fixedReply, fixedTopic } from './chat.replies';

const CONTENTS: ContentFact[] = [
  {
    id: 1,
    description: '사과 소개문입니다.',
    regionDescription: '청송 소개문입니다.',
  },
  { id: 2, description: '간고등어 소개문입니다.', regionDescription: null },
  { id: 5, description: null, regionDescription: null },
];

function answer(message: string): string {
  const intent = parseChatMessage(message);
  const topic = fixedTopic(message, replyContext(intent));
  return topic
    ? fixedReply(topic)
    : renderTemplate(buildFacts(intent, [], CONTENTS));
}

const topicOf = (message: string) => {
  return fixedTopic(message, replyContext(parseChatMessage(message)));
};

describe('챗봇 답변 세트', () => {
  it('화면에서 반복되던 곶감 대화에 물어본 내용으로 답한다', () => {
    const taste = answer('음 그러면 곶감이 먹고싶은데 곶감 맛은 어때?');
    const info = answer('곶감에 대해서 설명해주라니까');
    expect(taste).toBe('상주 곶감은 달콤하고 쫀득한 맛으로 소개하고 있어요.');
    expect(info).toContain('자세한 소개는 아직 준비 중이에요');
    expect(taste).not.toContain('이야기네요');
    expect(info).not.toContain('이야기네요');
  });

  it('등록된 소개문이 있으면 그대로 사용한다', () => {
    expect(answer('사과 설명해줘')).toBe('사과 소개문입니다.');
    expect(answer('청송은 어떤 곳이야?')).toContain('청송 소개문입니다.');
  });

  it('맛 자료가 없는 특산물은 지어내지 않는다', () => {
    expect(answer('풍기인삼 맛은 어때?')).toBe(
      '풍기인삼의 맛 설명은 아직 준비 중이에요.',
    );
  });

  it('이름만 말하면 맛과 물어볼 수 있는 내용을 안내한다', () => {
    const reply = answer('과메기');
    expect(reply).toContain('고소하고 쫀득한 맛');
    expect(reply).toContain('궁금한 내용을 물어봐 주세요');
  });

  it('여러 특산물을 함께 물으면 각각 답한다', () => {
    const reply = answer('사과랑 곶감 중에 뭐가 맛있어?');
    expect(reply).toContain('청송 사과는');
    expect(reply).toContain('상주 곶감은');
  });

  it('구매 질문은 상점 등록 여부로 답한다', () => {
    expect(answer('사과 주문하고 싶어')).toContain('햇살 과수원 사과');
    expect(answer('사과 주문하고 싶어')).toContain('실제 결제와 배송은');
    expect(answer('곶감 살수있어?')).toContain('아직 상점에 등록되지');
  });

  it('지역과 특산물이 함께 나오면 특산물로 본다', () => {
    expect(answer('안동 사과 맛 어때')).toContain('청송 사과는');
  });

  it.each<[string, FixedTopic]>([
    ['강화 비용 얼마야', 'EQUIPMENT'],
    ['장비 어떻게 올려?', 'EQUIPMENT'],
    ['퀴즈 보상 뭐야', 'QUIZ'],
    ['오늘 퀴즈 정답 알려줘', 'QUIZ_ANSWER'],
    ['사과 조각 몇 개 모아야 해금돼?', 'UNLOCK'],
    ['조각 잘 안 나와', 'PIECES'],
    ['레벨 어떻게 올려', 'LEVEL'],
    ['몹은 내가 잡아야 해?', 'MOB'],
    ['게임 꺼놔도 보상 쌓여?', 'IDLE'],
    ['골드 어떻게 벌어', 'GOLD'],
    ['닉네임 바꿀 수 있어?', 'NICKNAME'],
    ['배송은 언제 와?', 'SHOP'],
    ['이 게임 어떻게 시작해? 처음인데', 'START'],
    ['왜 자꾸 같은 말만 해', 'COMPLAINT'],
    ['고마워!', 'THANKS'],
    ['안녕', 'GREETING'],
    ['넌 뭐 할 수 있어?', 'CAPABILITY'],
    ['그건 얼마야?', 'NEED_NAME'],
    ['무기 업글 어케함', 'EQUIPMENT'],
    ['안동 어떻게 가요', 'UNLOCK'],
    ['자는 동안 모인 거 어떻게 받아요', 'IDLE'],
    ['돈이 부족한데 어쩌죠', 'GOLD'],
    ['어디어디 나오는지 알려줘', 'REGIONS'],
    ['오늘 문제 답이 머임? 알려주세요', 'QUIZ_ANSWER'],
    ['ㅎㅇ', 'GREETING'],
    ['ㄱㅅㄱㅅ', 'THANKS'],
    ['담에 또 봐~', 'FAREWELL'],
    ['무엇을 도와줄 수 있나요', 'CAPABILITY'],
    ['답이 이상한데요 다시 해봐', 'COMPLAINT'],
  ])('%s 는 %s 주제로 답한다', (message, topic) => {
    expect(topicOf(message)).toBe(topic);
  });

  it.each([
    ['친구한테 사과하고 싶어'],
    ['냄새를 풍기는 음식'],
    ['그동안 안동안 뭐 했어'],
    ['친구랑 싸우지 마'],
  ])('%s 는 특산물이나 가격으로 오해하지 않는다', (message) => {
    const intent = parseChatMessage(message);
    expect(intent.named).toEqual([]);
    expect(intent.asksPrice).toBe(false);
  });

  it.each([
    ['간고등어 소개해줘', false],
    ['곶감 맛은 어때?', false],
    ['청송은 어떤 곳이야?', false],
    ['안녕하세요', false],
    ['간고등어 얼마야?', true],
    ['달콤한 과일 추천해 줘', true],
  ])('%s 의 AI 문장 다듬기 사용은 %s 이다', (message, expected) => {
    const facts = buildFacts(parseChatMessage(message), [], CONTENTS);
    expect(canRewrite(facts)).toBe(expected);
  });

  it('방법과 품질을 묻는 말도 물어본 내용으로 답한다', () => {
    expect(answer('곶감은 어떻게 만들어요')).toContain('준비 중이에요');
    expect(answer('의성마늘 먹으면 많이 매워요')).toContain('알싸');
    expect(answer('마늘 택배로 시킬래')).toContain('아직 상점에');
  });

  it('막연한 추천과 안주 요청을 추천으로 받는다', () => {
    expect(answer('가성비 좋은 특산품 골라줘')).toContain('어떤 맛을');
    expect(answer('술안주 할만한거 있나요')).toContain('포항 과메기를');
  });

  it.each([
    ['마늘 까는 소리 같은 노래 추천'],
    ['참외 같은 얼굴이라고 놀림받음'],
  ])('%s 는 특산물 질문으로 보지 않는다', (message) => {
    expect(parseChatMessage(message).named).toEqual([]);
  });

  it('게임 안내 문장은 게임 규칙 수치를 쓴다', () => {
    expect(fixedReply('IDLE')).toContain('최대 8시간');
    expect(fixedReply('UNLOCK')).toContain('20개');
    expect(fixedReply('QUIZ')).toContain('100골드');
    expect(fixedReply('EQUIPMENT')).toContain('5단계 900골드(레벨 10)');
    expect(fixedReply('PIECES')).toContain('300번');
  });
});

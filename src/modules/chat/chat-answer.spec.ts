import {
  buildFacts,
  isAcceptableReply,
  parseBudget,
  parseChatMessage,
  PriceFact,
  renderTemplate,
} from './chat-answer';
import {
  aggregateAuction,
  aggregateRetail,
  gyeongbukCounty,
  pickNational,
} from './price-aggregate';

const retail = (id: number, price: number, area = '안동'): PriceFact => ({
  regionProductId: id,
  kind: 'RETAIL',
  area,
  label: '후지',
  unit: '10개',
  price,
  yearAgoPrice: null,
  surveyDate: '2026-11-06',
});

const facts = (message: string, prices: PriceFact[] = []) =>
  buildFacts(parseChatMessage(message), prices);

describe('챗봇 질문 해석', () => {
  it.each([
    ['2만 원 이하로 추천해 줘', 20000],
    ['1만5천원까지', 15000],
    ['5천원', 5000],
    ['20,000원 안쪽', 20000],
    ['달콤한 과일', null],
  ])('%s 의 예산은 %s 이다', (message, budget) => {
    expect(parseBudget(message)).toBe(budget);
  });

  it('디자인 예시 질문에 청송 사과와 상점 상품을 고른다', () => {
    const result = facts('달콤한 과일을 좋아해! 2만 원 이하로 추천해 줘.');
    expect(result.item?.name).toBe('사과');
    const reply = renderTemplate(result);
    expect(reply).toContain('달콤한 과일을 좋아하시는군요!');
    expect(reply).toContain('청송 사과를 추천해 드릴게요.');
  });

  it('예산을 넘으면 추천하지 않는다', () => {
    const result = facts('달콤한 과일 천원 이하', [retail(6, 90000)]);
    expect(result.intent.budget).toBeNull();
    const over = facts('달콤한 과일 5천원', [retail(6, 90000)]);
    expect(over.item).toBeNull();
    expect(over.overBudget).toBe(true);
  });

  it('시세가 없는 특산물은 없다고 답한다', () => {
    const result = facts('과메기 시세 얼마야?');
    expect(result.noPrice).toBe(true);
    expect(renderTemplate(result)).toContain('시세 자료는 아직 없어요');
  });

  it('시세는 게임 지역과 같은 값을 먼저 고른다', () => {
    const result = facts('사과 얼마야', [
      { ...retail(1, 15900, '포항') },
      { ...retail(1, 13900, '안동') },
      {
        ...retail(1, 2752, '청송군'),
        kind: 'AUCTION',
        label: '도매 경매',
        unit: 'kg',
      },
    ]);
    expect(result.prices.map((p) => p.kind)).toEqual(['RETAIL', 'AUCTION']);
    expect(result.prices[1].area).toBe('청송군');
    expect(renderTemplate(result)).toContain(
      '11월 6일 청송군 산지 도매 경매가는 kg당 약 2,752원이에요.',
    );
  });

  it('맛 표현 없이 분류만 말해도 자연스럽게 답한다', () => {
    expect(renderTemplate(facts('해산물이 먹고싶어'))).toBe(
      '해산물을 찾으시는군요!\n안동 간고등어를 추천해 드릴게요.',
    );
  });

  it('알 수 없는 말에는 추천 없이 안내한다', () => {
    const result = facts('안녕하세요');
    expect(result.item).toBeNull();
    expect(renderTemplate(result)).toContain('어떤 맛을 좋아하시나요?');
  });
});

describe('AI 답변 검사', () => {
  const sample = facts('사과 얼마야', [retail(1, 13900)]);
  const template = renderTemplate(sample);

  it('초안의 숫자만 쓴 답변을 통과시킨다', () => {
    expect(
      isAcceptableReply(
        '안동에서는 11월 6일에 사과 후지 10개가 13,900원이었어요.',
        sample,
        template,
      ),
    ).toBe(true);
  });

  it('자료에 없는 설명을 덧붙여 길어진 답변은 거절한다', () => {
    const noPrice = facts('해산물이 먹고싶어');
    expect(
      isAcceptableReply(
        '해산물을 드시고 싶군요. 안동 간고등어를 드셔보시면 좋을 것 같아요. 안동 간고등어는 소금에 절여진 고등어를 짚불에 구워 먹는 전통 음식이에요. 맛있게 드세요.',
        noPrice,
        renderTemplate(noPrice),
      ),
    ).toBe(false);
  });

  it('시세가 없는 답변에서 가격을 언급하면 거절한다', () => {
    const noPrice = facts('달콤한 과일 추천해 줘');
    expect(
      isAcceptableReply(
        '청송 사과는 가격은 모르지만 추천해요.',
        noPrice,
        renderTemplate(noPrice),
      ),
    ).toBe(false);
    expect(
      isAcceptableReply(
        '달콤한 과일을 찾으시는군요. 청송 사과를 추천해 드릴게요.',
        noPrice,
        renderTemplate(noPrice),
      ),
    ).toBe(true);
  });

  it.each([
    ['없는 숫자', '사과 후지 10개가 12,000원이에요.'],
    ['다른 특산물', '사과보다 참외를 추천해요. 13,900원이에요.'],
    ['단정 표현', '사과는 무조건 사세요.'],
    ['추천 누락', '13,900원이에요.'],
    ['반말', '사과 후지 10개는 13,900원이야.'],
    ['지어낸 효능', '사과는 건강에 좋아요.'],
    ['가격 평가', '사과 후지 10개는 13,900원으로 훨씬 좋아요.'],
    ['빈 답변', '   '],
  ])('%s 는 거절한다', (_name, reply) => {
    expect(isAcceptableReply(reply, sample, template)).toBe(false);
  });
});

describe('시세 집계', () => {
  it('경북 주소 표기를 시·군으로 맞춘다', () => {
    expect(gyeongbukCounty('경상북도 청송군')).toBe('청송군');
    expect(gyeongbukCounty('경북 청송군 청송읍 금곡1리')).toBe('청송군');
    expect(gyeongbukCounty('경북 안동시 안동우체국사서함')).toBe('안동시');
    expect(gyeongbukCounty('충청남도 논산시')).toBeNull();
    expect(gyeongbukCounty(undefined)).toBeNull();
  });

  it('최신 조사일의 상품 등급을 시장 평균으로 만든다', () => {
    const row = {
      se_nm: '소매',
      sgg_nm: '안동',
      vrty_nm: '후지',
      unit: '개',
      unit_sz: '10',
    };
    const result = aggregateRetail(
      [
        { ...row, exmn_ymd: '20261105', grd_nm: '상품', exmn_dd_prc: '10000' },
        { ...row, exmn_ymd: '20261106', grd_nm: '상품', exmn_dd_prc: '13000' },
        { ...row, exmn_ymd: '20261106', grd_nm: '상품', exmn_dd_prc: '15000' },
        { ...row, exmn_ymd: '20261106', grd_nm: '중품', exmn_dd_prc: '9000' },
        {
          ...row,
          sgg_nm: '서울',
          exmn_ymd: '20261106',
          grd_nm: '상품',
          exmn_dd_prc: '1',
        },
        {
          ...row,
          vrty_nm: '홍로',
          exmn_ymd: '20261106',
          grd_nm: '상품',
          exmn_dd_prc: '1',
        },
      ],
      '후지',
    );
    expect(result).toEqual([
      {
        kind: 'RETAIL',
        area: '안동',
        label: '후지',
        unit: '10개',
        price: 14000,
        yearAgoPrice: null,
        surveyDate: '2026-11-06',
      },
    ]);
  });

  it('전국 평균에 1년 전 값을 담고 0 은 비운다', () => {
    const row = {
      se_nm: '소매',
      vrty_nm: '후지',
      grd_nm: '상품',
      unit: '개',
      unit_sz: '10',
      exmn_ymd: '20261106',
      exmn_dd_prc: '20000',
    };
    expect(
      pickNational([{ ...row, yy1_bfr_prc: '18000' }], '후지'),
    ).toMatchObject({
      price: 20000,
      yearAgoPrice: 18000,
      surveyDate: '2026-11-06',
    });
    expect(
      pickNational([{ ...row, yy1_bfr_prc: '0' }], '후지')?.yearAgoPrice,
    ).toBeNull();
    expect(pickNational([], null)).toBeNull();
  });

  it('경매가는 극단값과 표본이 적은 시·군을 뺀다', () => {
    const deal = (origin: string, price: string, size = '10') => ({
      plor_nm: origin,
      qty: '1',
      unit_qty: size,
      unit_nm: 'kg',
      scsbd_prc: price,
    });
    const result = aggregateAuction(
      [
        deal('경상북도 청송군', '30000'),
        deal('경북 청송군 청송읍', '30000'),
        deal('경상북도 청송군', '30000'),
        deal('경상북도 청송군', '30000'),
        deal('경상북도 청송군', '30000'),
        deal('경상북도 청송군', '900000'),
        deal('경상북도 의성군', '20000'),
        deal('충청남도 논산시', '30000'),
      ],
      '2026-11-09',
    );
    expect(result).toEqual([
      {
        kind: 'AUCTION',
        area: '청송군',
        label: '도매 경매',
        unit: 'kg',
        price: 3000,
        yearAgoPrice: null,
        surveyDate: '2026-11-09',
      },
    ]);
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';
const INTEGER_REASON = '정수만 입력할 수 있습니다.';
const REQUIRED_REASON = '필수 입력값입니다.';

describe('QA 입력 검증 안내', () => {
  let t: TestApp;
  let jwt: string;

  const http = () => request(t.app.getHttpServer());
  const get = (path: string) =>
    http().get(`${API}${path}`).set('Authorization', `Bearer ${jwt}`);
  const post = (path: string, key = randomUUID()) =>
    http()
      .post(`${API}${path}`)
      .set('Authorization', `Bearer ${jwt}`)
      .set('Idempotency-Key', key);
  const validAnswers = () =>
    [1, 2, 3].map((order_no) => ({ order_no, selected_index: 0 }));
  const expectValidation = (body: unknown, field: string, reason: string) =>
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { field, reason },
    });

  beforeAll(async () => {
    t = await startApp();
    const res = await http()
      .post(`${API}/user`)
      .send({ name: '검증유저' })
      .expect(201);
    jwt = res.body.jwt as string;
  });

  afterAll(async () => {
    await stopApp(t);
  });

  it.each<[unknown, string]>([
    ['문자', INTEGER_REASON],
    ['2', INTEGER_REASON],
    [0.5, INTEGER_REASON],
    [true, INTEGER_REASON],
    [null, REQUIRED_REASON],
    [undefined, REQUIRED_REASON],
    [0, 'target_region_id must not be less than 1'],
    [2147483648, 'target_region_id must not be greater than 2147483647'],
  ])('지역 이동 입력 %p의 원인을 정확히 반환한다', async (value, reason) => {
    const res = await post('/regions/move')
      .send({ target_region_id: value })
      .expect(400);
    expectValidation(res.body, 'target_region_id', reason);
  });

  it.each([
    ['/products', 'region_id'],
    ['/products', 'specialty_id'],
    ['/codex', 'region_id'],
  ])('%s의 %s에서 타입과 범위를 구분한다', async (path, field) => {
    for (const value of ['abc', '1.5']) {
      const invalid = await get(`${path}?${field}=${value}`).expect(400);
      expectValidation(invalid.body, field, INTEGER_REASON);
    }
    for (const [value, reason] of [
      ['0', `${field} must not be less than 1`],
      ['2147483648', `${field} must not be greater than 2147483647`],
    ]) {
      const invalid = await get(`${path}?${field}=${value}`).expect(400);
      expectValidation(invalid.body, field, reason);
    }
    await get(`${path}?${field}=1`).expect(200);
    await get(path).expect(200);
  });

  it.each(['set_id', 'order_no', 'selected_index'])(
    '퀴즈 %s의 타입·필수 입력 오류를 반환한다',
    async (field) => {
      const cases: [unknown, string][] = [
        ['abc', INTEGER_REASON],
        ['1', INTEGER_REASON],
        [0.5, INTEGER_REASON],
        [null, REQUIRED_REASON],
        [undefined, REQUIRED_REASON],
      ];
      for (const [value, reason] of cases) {
        const answers: Record<string, unknown>[] = validAnswers();
        const body: Record<string, unknown> = { set_id: 20261103, answers };
        if (field === 'set_id') {
          body.set_id = value;
        } else {
          answers[0][field] = value;
        }
        const res = await post('/quiz/submit').send(body).expect(400);
        expectValidation(
          res.body,
          field === 'set_id' ? field : `answers.0.${field}`,
          reason,
        );
      }
    },
  );

  it.each<[string, number, string]>([
    ['order_no', 0, 'order_no must not be less than 1'],
    ['order_no', 4, 'order_no must not be greater than 3'],
    ['selected_index', -1, 'selected_index must not be less than 0'],
    ['selected_index', 4, 'selected_index must not be greater than 3'],
  ])('퀴즈 %s=%p는 정수 범위 오류이다', async (field, value, reason) => {
    const answers: Record<string, unknown>[] = validAnswers();
    answers[1][field] = value;
    const res = await post('/quiz/submit')
      .send({ set_id: 20261103, answers })
      .expect(400);
    expectValidation(res.body, `answers.1.${field}`, reason);
  });

  it.each<[unknown, string]>([
    ['abc', '배열만 입력할 수 있습니다.'],
    [{}, '배열만 입력할 수 있습니다.'],
    [1, '배열만 입력할 수 있습니다.'],
    [null, REQUIRED_REASON],
    [undefined, REQUIRED_REASON],
  ])('답안 배열 %p의 구조를 먼저 안내한다', async (answers, reason) => {
    const res = await post('/quiz/submit')
      .send({ set_id: 20261103, answers })
      .expect(400);
    expectValidation(res.body, 'answers', reason);
  });

  it.each([
    { label: '빈 배열', value: [] },
    { label: '중첩 답안 배열', value: [{ order_no: 1, selected_index: 0 }] },
  ])('답안 원소 $label이 중복 검사를 우회하지 못한다', async ({ value }) => {
    const answers = validAnswers();
    const res = await post('/quiz/submit')
      .send({ set_id: 20261103, answers: [value, answers[1], answers[2]] })
      .expect(400);
    expectValidation(res.body, 'answers', '각 답안은 객체여야 합니다.');
  });

  it.each<[unknown, string]>([
    [[], 'answers must contain at least 3 elements'],
    [[{ order_no: 'abc' }], 'answers must contain at least 3 elements'],
    [
      Array.from({ length: 4 }, () => ({})),
      'answers must contain no more than 3 elements',
    ],
  ])(
    '답안 개수 오류가 자식 필드 오류에 가려지지 않는다: %p',
    async (answers, reason) => {
      const res = await post('/quiz/submit')
        .send({ set_id: 20261103, answers })
        .expect(400);
      expectValidation(res.body, 'answers', reason);
    },
  );

  it.each<[unknown, string]>([
    [123, 'LENGTH'],
    [null, 'LENGTH'],
    [undefined, 'LENGTH'],
    ['a', 'LENGTH'],
    ['admin123456!', 'LENGTH'],
    ['admin!', 'CHARSET'],
    ['admin', 'BANNED_WORD'],
  ])('닉네임 %p는 %s로 안내한다', async (name, reason) => {
    const res = await http().post(`${API}/user`).send({ name }).expect(400);
    expectValidation(res.body, 'name', reason);
  });

  it('검증 400도 같은 요청 키로 재생한다', async () => {
    const key = randomUUID();
    const body = { target_region_id: 'abc' };
    const first = await post('/regions/move', key).send(body).expect(400);
    const replay = await post('/regions/move', key).send(body).expect(400);
    expectValidation(replay.body, 'target_region_id', INTEGER_REASON);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });
});

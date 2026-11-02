/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { REGION_CONTENT } from '../../src/database/seeds/content-data';
import { runContentSeeds } from '../../src/database/seeds/run-content-seeds';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';

describe('콘텐츠', () => {
  let t: TestApp;
  let serial = 0;

  const http = () => request(t.app.getHttpServer());
  const newUser = async () => {
    serial += 1;
    const res = await http()
      .post(`${API}/user`)
      .send({ name: `콘텐츠${serial}` })
      .expect(201);
    return { jwt: res.body.jwt as string, id: res.body.user.id as number };
  };
  const get = (path: string, jwt: string) =>
    http().get(`${API}${path}`).set('Authorization', `Bearer ${jwt}`);

  beforeAll(async () => {
    t = await startApp();
    await runContentSeeds(t.ds);
  });

  afterAll(async () => {
    await stopApp(t);
  });

  it('활성 지역마다 정답이 범위 안에 있는 3문항이 있다', () => {
    expect(REGION_CONTENT.map((region) => region.regionId)).toEqual([1, 2]);
    for (const region of REGION_CONTENT) {
      expect(region.quizzes).toHaveLength(3);
      for (const quiz of region.quizzes) {
        expect(quiz.choices).toHaveLength(4);
        expect(new Set(quiz.choices).size).toBe(4);
        expect(quiz.answerIndex).toBeLessThan(4);
      }
    }
  });

  it('다시 실행해도 행이 늘지 않고 새 행의 자동 증가 값이 겹치지 않는다', async () => {
    await runContentSeeds(t.ds);
    const [counts] = await t.ds.query(
      `SELECT (SELECT count(*)::int FROM region_quiz) AS quiz, (SELECT count(*)::int FROM shop_product) AS product`,
    );
    expect(counts).toEqual({ quiz: 6, product: 2 });
    await t.ds.transaction(async (manager) => {
      const rows = await manager.query(
        `INSERT INTO shop_product (region_id, name) VALUES (1, '새 상품') RETURNING id`,
      );
      expect(rows[0].id).toBeGreaterThan(2);
      await manager.query(`DELETE FROM shop_product WHERE id = $1`, [
        rows[0].id,
      ]);
    });
  });

  it('지역 소개와 발견 후 도감 설명을 돌려준다', async () => {
    const { jwt, id } = await newUser();
    const regions = await get('/regions', jwt).expect(200);
    expect(regions.body.regions[0].description).toContain('주왕산');
    const hidden = await get('/codex/1', jwt).expect(200);
    expect(hidden.body.description).toBeNull();
    await t.ds.query(`UPDATE logbook SET cur_collect = 1 WHERE user_id = $1`, [
      id,
    ]);
    const shown = await get('/codex/1', jwt).expect(200);
    expect(shown.body.description).toContain('청송');
    expect(shown.body.source).toBe('언론 보도 종합');
    expect(shown.body.products[0]).toMatchObject({
      name: '청송 사과',
      status: 'PREPARING',
    });
  });

  it('상품은 판매처 링크 없이 준비 중으로 보인다', async () => {
    const { jwt } = await newUser();
    const list = await get('/products', jwt).expect(200);
    expect(list.body.items.map((item: { name: string }) => item.name)).toEqual([
      '청송 사과',
      '안동 간고등어',
    ]);
    const detail = await get(`/products/${list.body.items[0].id}`, jwt);
    expect(detail.body).toMatchObject({
      status: 'PREPARING',
      external_url: null,
      link_available: false,
    });
  });

  it('실제 문항으로 퀴즈를 끝까지 진행한다', async () => {
    const { jwt } = await newUser();
    const issued = await http()
      .post(`${API}/quiz/today`)
      .set('Authorization', `Bearer ${jwt}`)
      .expect(200);
    const { set } = issued.body;
    expect(set.region.code).toBe('R01');
    const bank = new Map<number, number>(
      REGION_CONTENT[0].quizzes.map((quiz) => [quiz.id, quiz.answerIndex]),
    );
    const submitted = await http()
      .post(`${API}/quiz/submit`)
      .set('Authorization', `Bearer ${jwt}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        set_id: set.set_id,
        answers: set.questions.map((question: any) => ({
          order_no: question.order_no,
          selected_index: bank.get(question.question_id),
        })),
      })
      .expect(200);
    expect(submitted.body.set.result.correct_count).toBe(3);
  });

  it('실루엣 파일을 서빙한다', async () => {
    const res = await http().get('/static/silhouette.png').expect(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('금칙어가 들어간 이름을 거절한다', async () => {
    for (const name of ['관리자1', 'ADMIN', '운영자님']) {
      const res = await http().post(`${API}/user`).send({ name }).expect(400);
      expect(res.body.details.reason).toBe('BANNED_WORD');
    }
  });
});

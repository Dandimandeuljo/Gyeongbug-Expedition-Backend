/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OperationService } from '../../src/modules/operation/operation.service';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';
const HUGE = 99_999_999_999;

describe('경계와 동시성', () => {
  let t: TestApp;
  let serial = 0;

  const http = () => request(t.app.getHttpServer());
  const get = (path: string, jwt: string) =>
    http().get(`${API}${path}`).set('Authorization', `Bearer ${jwt}`);
  const post = (path: string, jwt: string, key: string = randomUUID()) =>
    http()
      .post(`${API}${path}`)
      .set('Authorization', `Bearer ${jwt}`)
      .set('Idempotency-Key', key);
  const newUser = async () => {
    serial += 1;
    const res = await http()
      .post(`${API}/user`)
      .send({ name: `경계${serial}` })
      .expect(201);
    return { jwt: res.body.jwt as string, id: res.body.user.id as number };
  };
  const elapse = (id: number, seconds: number) =>
    t.ds.query(
      `UPDATE idle_reward SET recent_receive = date_trunc('second', now()) - make_interval(secs => $2) WHERE user_id = $1`,
      [id, seconds],
    );

  beforeAll(async () => {
    t = await startApp();
    for (let i = 0; i < 3; i += 1) {
      await t.ds.query(
        `INSERT INTO region_quiz (region_id, content, choices, answer_index, explanation)
         VALUES (1, 'q', '["a","b","c","d"]', 0, 'e')`,
      );
    }
  });

  afterAll(async () => {
    await stopApp(t);
  });

  describe('입력', () => {
    it('깨진 JSON 은 500 이 아니라 VALIDATION_ERROR 이다', async () => {
      const res = await http()
        .post(`${API}/user`)
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('허용되지 않은 필드를 거절한다', async () => {
      const res = await http()
        .post(`${API}/user`)
        .send({ name: '필드확인', admin: true })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('int 범위를 넘는 ID 는 500 이 아니다', async () => {
      const { jwt } = await newUser();
      await post('/regions/move', jwt)
        .send({ target_region_id: HUGE })
        .expect(400);
      await get(`/products?region_id=${HUGE}`, jwt).expect(400);
      await get(`/products?specialty_id=${HUGE}`, jwt).expect(400);
      await get(`/codex?region_id=${HUGE}`, jwt).expect(400);
      await get(`/products/${HUGE}`, jwt).expect(404);
      await get(`/codex/${HUGE}`, jwt).expect(404);
    });

    it('날짜가 아닌 set_id 는 QUIZ_SET_NOT_FOUND 이다', async () => {
      const { jwt } = await newUser();
      const answers = [1, 2, 3].map((order_no) => ({
        order_no,
        selected_index: 0,
      }));
      for (const set_id of [20261399, 123, -20261103, HUGE]) {
        const res = await post('/quiz/submit', jwt)
          .send({ set_id, answers })
          .expect(404);
        expect(res.body.code).toBe('QUIZ_SET_NOT_FOUND');
      }
    });

    it('다른 유저의 세트는 내 세트처럼 보이지 않는다', async () => {
      const owner = await newUser();
      const other = await newUser();
      const issued = await post('/quiz/today', owner.jwt).expect(200);
      const res = await post('/quiz/submit', other.jwt)
        .send({
          set_id: issued.body.set.set_id,
          answers: [1, 2, 3].map((order_no) => ({
            order_no,
            selected_index: 0,
          })),
        })
        .expect(404);
      expect(res.body.code).toBe('QUIZ_SET_NOT_FOUND');
    });
  });

  describe('인증', () => {
    it('만료·위조 토큰은 401 이다', async () => {
      const { id } = await newUser();
      const jwt = t.app.get(JwtService);
      const expired = jwt.sign({ sub: id }, { expiresIn: -10 });
      await get('/user', expired).expect(401);
      const forged = jwt.sign({ sub: id }, { secret: 'x'.repeat(40) });
      await get('/user', forged).expect(401);
      const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
        JSON.stringify({ sub: id }),
      ).toString('base64url')}.`;
      await get('/user', none).expect(401);
      await get('/user', jwt.sign({ sub: 987654 })).expect(401);
    });
  });

  describe('동시 요청', () => {
    it('같은 이름 동시 생성은 하나만 성공한다', async () => {
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          http().post(`${API}/user`).send({ name: '동시이름' }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409]);
    });

    it('다른 키의 동시 강화는 비용을 한 번만 낸다', async () => {
      const { jwt, id } = await newUser();
      await t.ds.query(`UPDATE users SET gold = 100 WHERE id = $1`, [id]);
      const results = await Promise.all([
        post('/equipment/upgrade', jwt),
        post('/equipment/upgrade', jwt),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const me = await get('/user', jwt);
      expect(me.body.equipment.stage).toBe(2);
      expect(me.body.gold).toBe(0);
    });

    it('다른 키의 동시 수령은 같은 구간을 두 번 지급하지 않는다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 3600);
      const results = await Promise.all([
        post('/idle-reward', jwt),
        post('/idle-reward', jwt),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const me = await get('/user', jwt);
      expect(me.body.gold).toBe(300);
    });

    it('동시 퀴즈 발급과 제출은 세트 하나, 보상 한 번이다', async () => {
      const { jwt } = await newUser();
      const issued = await Promise.all([
        post('/quiz/today', jwt),
        post('/quiz/today', jwt),
      ]);
      expect(issued.map((r) => r.status)).toEqual([200, 200]);
      expect(issued[0].body.set.set_id).toBe(issued[1].body.set.set_id);
      expect(issued[0].body.set.questions).toEqual(
        issued[1].body.set.questions,
      );

      const body = {
        set_id: issued[0].body.set.set_id,
        answers: [1, 2, 3].map((order_no) => ({
          order_no,
          selected_index: 0,
        })),
      };
      const submitted = await Promise.all([
        post('/quiz/submit', jwt).send(body),
        post('/quiz/submit', jwt).send(body),
      ]);
      expect(submitted.map((r) => r.status).sort()).toEqual([200, 409]);
      const me = await get('/user', jwt);
      expect(me.body.gold).toBe(100);
    });
  });

  describe('영수증 만료', () => {
    it('만료된 키는 새 요청으로 처리하고 조회되지 않으며 정리된다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 3600);
      const key = randomUUID();
      await post('/idle-reward', jwt, key).expect(200);
      await t.ds.query(
        `UPDATE operation SET expires_at = now() - interval '1 minute' WHERE idempotency_key = $1`,
        [key],
      );
      await get(`/operations/${key}`, jwt).expect(404);

      await elapse(id, 3600);
      const again = await post('/idle-reward', jwt, key).expect(200);
      expect(again.headers['idempotent-replayed']).toBeUndefined();
      expect(again.body.gold).toBe(600);

      await t.ds.query(
        `UPDATE operation SET expires_at = now() - interval '1 minute' WHERE idempotency_key = $1`,
        [key],
      );
      await t.app.get(OperationService).deleteExpired();
      const rows: unknown[] = await t.ds.query(
        `SELECT 1 FROM operation WHERE idempotency_key = $1`,
        [key],
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('정수 나머지', () => {
    it('60초씩 나눠 받아도 한 번에 받은 것과 합계가 같다', async () => {
      const { jwt, id } = await newUser();
      await t.ds.query(`UPDATE users SET level = 2, exp = 100 WHERE id = $1`, [
        id,
      ]);
      for (let i = 0; i < 60; i += 1) {
        await elapse(id, 60);
        await post('/idle-reward', jwt).expect(200);
      }
      const me = await get('/user', jwt);
      expect(me.body.gold).toBe(315);
      expect(me.body.exp).toBe(160);
    });
  });
});

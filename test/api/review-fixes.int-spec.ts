/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OperationService } from '../../src/modules/operation/operation.service';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';

describe('코드 리뷰 결함', () => {
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
      .send({ name: `리뷰${serial}` })
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
  });

  afterAll(async () => {
    await stopApp(t);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('3번: 인증 중 DB 장애는 401 이 아니라 500 이다', async () => {
    const { jwt } = await newUser();
    jest
      .spyOn(t.ds.manager, 'existsBy')
      .mockRejectedValueOnce(new Error('db down'));
    const res = await get('/user', jwt);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('4번: 다른 유저의 같은 키 동시 요청은 한쪽만 처리한다', async () => {
    for (let round = 0; round < 5; round += 1) {
      const a = await newUser();
      const b = await newUser();
      await elapse(a.id, 3600);
      await elapse(b.id, 3600);
      const key = randomUUID();
      const results = await Promise.all([
        post('/idle-reward', a.jwt, key),
        post('/idle-reward', b.jwt, key),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const golds = await Promise.all([
        get('/user', a.jwt),
        get('/user', b.jwt),
      ]);
      expect(golds.map((r) => r.body.gold).sort((x, y) => x - y)).toEqual([
        0, 300,
      ]);
    }
  });

  it('5번: 보관 중인 영수증은 지우지 않고 만료된 것만 지운다', async () => {
    const { jwt, id } = await newUser();
    await elapse(id, 3600);
    const key = randomUUID();
    await post('/idle-reward', jwt, key).expect(200);
    const operations = t.app.get(OperationService);
    expect(await operations.findLive(key)).not.toBeNull();
    await t.ds.query(
      `UPDATE operation SET expires_at = now() - interval '1 second' WHERE idempotency_key = $1`,
      [key],
    );
    expect(await operations.findLive(key)).toBeNull();
    const rows: unknown[] = await t.ds.query(
      `SELECT 1 FROM operation WHERE idempotency_key = $1`,
      [key],
    );
    expect(rows).toHaveLength(0);
  });

  describe('6번: 초기화 재시도', () => {
    it('같은 토큰·키·본문이면 성공 응답을 재생한다', async () => {
      const { jwt } = await newUser();
      const key = randomUUID();
      const body = { confirmation: 'RESET' };
      const first = await post('/progress/reset', jwt, key)
        .send(body)
        .expect(200);
      const again = await post('/progress/reset', jwt, key)
        .send(body)
        .expect(200);
      expect(again.body).toEqual(first.body);
      expect(again.headers['idempotent-replayed']).toBe('true');
    });

    it('삭제된 유저의 다른 요청은 계속 401 이다', async () => {
      const { jwt } = await newUser();
      const other = await newUser();
      const key = randomUUID();
      await post('/progress/reset', jwt, key)
        .send({ confirmation: 'RESET' })
        .expect(200);
      await get('/user', jwt).expect(401);
      await post('/idle-reward', jwt, key).expect(401);
      await post('/progress/reset', jwt)
        .send({ confirmation: 'RESET' })
        .expect(401);
      const changed = await post('/progress/reset', jwt, key)
        .send({ confirmation: 'NO' })
        .expect(409);
      expect(changed.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

      // 다른 유저의 초기화 영수증으로는 삭제된 유저가 통과하지 못합니다.
      const otherKey = randomUUID();
      await post('/progress/reset', other.jwt, otherKey)
        .send({ confirmation: 'RESET' })
        .expect(200);
      await post('/progress/reset', jwt, otherKey)
        .send({ confirmation: 'RESET' })
        .expect(401);
    });

    it('영수증이 만료되면 401 이다', async () => {
      const { jwt } = await newUser();
      const key = randomUUID();
      await post('/progress/reset', jwt, key)
        .send({ confirmation: 'RESET' })
        .expect(200);
      await t.ds.query(
        `UPDATE operation SET expires_at = now() - interval '1 second' WHERE idempotency_key = $1`,
        [key],
      );
      await post('/progress/reset', jwt, key)
        .send({ confirmation: 'RESET' })
        .expect(401);
    });
  });

  it('동시 초기화 재시도는 둘 다 같은 성공 응답을 받는다', async () => {
    for (let round = 0; round < 5; round += 1) {
      const { jwt } = await newUser();
      const key = randomUUID();
      const body = { confirmation: 'RESET' };
      const results = await Promise.all([
        post('/progress/reset', jwt, key).send(body),
        post('/progress/reset', jwt, key).send(body),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results[0].body).toEqual(results[1].body);
    }
  });

  it('다른 유저의 같은 키 동시 실패 요청도 한쪽은 409 이다', async () => {
    for (let round = 0; round < 5; round += 1) {
      const a = await newUser();
      const b = await newUser();
      const key = randomUUID();
      const body = { target_region_id: 'x' };
      const results = await Promise.all([
        post('/regions/move', a.jwt, key).send(body),
        post('/regions/move', b.jwt, key).send(body),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([400, 409]);
      const conflict = results.find((r) => r.status === 409);
      expect(conflict?.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('9번: int 범위를 벗어난 음수 상품 ID 는 404 이다', async () => {
    const { jwt } = await newUser();
    const res = await get('/products/-2147483649', jwt).expect(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    await get('/products/0', jwt).expect(404);
  });

  it('10번: 중간 지역이 비활성이어도 실제 순서로 해금 조건을 보여 준다', async () => {
    const { jwt } = await newUser();
    await t.ds.query(
      `UPDATE region SET is_active = (id IN (1, 3)) WHERE id IN (1, 2, 3)`,
    );
    try {
      const codex = await get('/codex/1', jwt).expect(200);
      expect(codex.body.unlocks_region).toBeNull();
      const regions = await get('/regions', jwt).expect(200);
      const r03 = regions.body.regions.find(
        (region: { id: number }) => region.id === 3,
      );
      expect(r03.unlock).toMatchObject({
        region_id: 2,
        specialty_name: '간고등어',
      });
    } finally {
      await t.ds.query(
        `UPDATE region SET is_active = (id IN (1, 2)) WHERE id IN (1, 2, 3)`,
      );
    }
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';

// 1번: 트랜잭션이 연결을 쥔 채 다른 연결을 요청하면 풀이 고갈되어 요청이 끝나지 않습니다.
describe('연결 풀', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp();
  });

  afterAll(async () => {
    await stopApp(t);
  });

  it('풀 크기(10)보다 많은 잠긴 지역 이동이 동시에 와도 모두 끝난다', async () => {
    const http = () => request(t.app.getHttpServer());
    const users = await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        http()
          .post(`${API}/user`)
          .send({ name: `풀${index}` })
          .expect(201),
      ),
    );
    const results = await Promise.all(
      users.map((user) =>
        http()
          .post(`${API}/regions/move`)
          .set('Authorization', `Bearer ${user.body.jwt}`)
          .set('Idempotency-Key', randomUUID())
          .send({ target_region_id: 2 }),
      ),
    );
    expect(new Set(results.map((res) => res.status))).toEqual(new Set([409]));
    expect(results[0].body).toMatchObject({
      code: 'REGION_LOCKED',
      details: { unlock_region: { id: 1 }, required_pieces: 20 },
    });
  }, 30_000);
});

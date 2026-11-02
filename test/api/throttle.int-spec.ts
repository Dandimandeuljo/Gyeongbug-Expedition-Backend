/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import { startApp, stopApp, TestApp } from './support';

describe('속도 제한', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp({
      THROTTLE_PER_USER_PER_MINUTE: '3',
      THROTTLE_CREATE_USER_PER_IP_PER_HOUR: '2',
    });
  });

  afterAll(async () => {
    await stopApp(t);
  });

  it('POST /user 는 IP 기준, 인증 요청은 유저 기준으로 429 를 돌려준다', async () => {
    const http = () => request(t.app.getHttpServer());
    const first = await http()
      .post('/api/v1/user')
      .send({ name: '제한1' })
      .expect(201);
    await http().post('/api/v1/user').send({ name: '제한2' }).expect(201);
    const blocked = await http()
      .post('/api/v1/user')
      .send({ name: '제한3' })
      .expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.details.retry_after_seconds).toBeGreaterThan(0);

    // 2번: 토큰을 붙여도 IP 제한을 우회하지 못합니다.
    const bypass = await http()
      .post('/api/v1/user')
      .set('Authorization', `Bearer ${first.body.jwt}`)
      .send({ name: '제한4' });
    expect(bypass.status).toBe(429);

    const me = () =>
      http()
        .get('/api/v1/user')
        .set('Authorization', `Bearer ${first.body.jwt}`);
    await me().expect(200);
    await me().expect(200);
    await me().expect(200);
    const limited = await me().expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');

    // 7번: 유저당 제한은 엔드포인트마다 따로 세지 않습니다.
    await http()
      .get('/api/v1/regions')
      .set('Authorization', `Bearer ${first.body.jwt}`)
      .expect(429);
    await http().get('/health').expect(200);
  });
});

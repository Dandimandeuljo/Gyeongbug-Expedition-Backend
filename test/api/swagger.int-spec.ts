/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';

/** 실제 응답이 문서의 required 필드를 모두 갖추었는지 재귀적으로 확인합니다. */
function missingFields(schema: any, value: any, path = '$'): string[] {
  if (value === null || value === undefined) {
    return schema.nullable ? [] : [path];
  }
  if (schema.type === 'array') {
    return value.flatMap((item: unknown, index: number) =>
      missingFields(schema.items, item, `${path}[${index}]`),
    );
  }
  if (schema.type === 'object' && schema.properties) {
    return Object.keys(schema.properties).flatMap((key) =>
      missingFields(schema.properties[key], value[key], `${path}.${key}`),
    );
  }
  return [];
}

describe('Swagger', () => {
  let t: TestApp;
  let paths: any;

  const http = () => request(t.app.getHttpServer());
  const expectMatches = (
    method: string,
    path: string,
    res: request.Response,
  ) => {
    const operation = paths[`${API}${path}`][method];
    const schema =
      operation.responses[String(res.status)].content['application/json']
        .schema;
    expect(missingFields(schema, res.body)).toEqual([]);
  };

  beforeAll(async () => {
    t = await startApp({ SWAGGER_ENABLED: 'true' });
    const res = await http().get('/docs-json').expect(200);
    paths = res.body.paths;
  });

  afterAll(async () => {
    await stopApp(t);
  });

  it('API 18개와 멱등성 헤더 5개를 문서화한다', () => {
    const operations = Object.entries(paths)
      .filter(([path]) => path.startsWith(API))
      .flatMap(([, methods]: [string, any]) => Object.values(methods));
    expect(operations).toHaveLength(18);
    for (const operation of operations as any[]) {
      expect(operation.summary).toBeTruthy();
      const success = operation.responses['200'] ?? operation.responses['201'];
      expect(success.content['application/json'].schema).toBeDefined();
    }
    const idempotent = (operations as any[]).filter((operation) =>
      operation.parameters?.some(
        (parameter: { name: string }) => parameter.name === 'Idempotency-Key',
      ),
    );
    expect(idempotent).toHaveLength(5);
  });

  it('실제 응답이 문서의 필드를 모두 갖춘다', async () => {
    const created = await http()
      .post(`${API}/user`)
      .send({ name: '문서확인' })
      .expect(201);
    expectMatches('post', '/user', created);
    const { jwt, user } = created.body;
    const get = (path: string) =>
      http().get(`${API}${path}`).set('Authorization', `Bearer ${jwt}`);
    const post = (path: string) =>
      http()
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${jwt}`)
        .set('Idempotency-Key', randomUUID());

    await t.ds.query(
      `UPDATE idle_reward SET recent_receive = now() - interval '2 hours' WHERE user_id = $1`,
      [user.id],
    );
    await t.ds.query(
      `INSERT INTO shop_product (region_id, region_product_id, name, status, detail_link)
       VALUES (1, 1, '상품', 'ACTIVE', 'https://shop.test/a')`,
    );
    for (let i = 0; i < 3; i += 1) {
      await t.ds.query(
        `INSERT INTO region_quiz (region_id, content, choices, answer_index, explanation)
         VALUES (1, 'q', '["a","b","c","d"]', 0, 'e')`,
      );
    }

    expectMatches('get', '/user', await get('/user').expect(200));
    expectMatches('get', '/idle-reward', await get('/idle-reward').expect(200));
    expectMatches('get', '/equipment', await get('/equipment').expect(200));
    expectMatches('get', '/regions', await get('/regions').expect(200));
    expectMatches('get', '/codex', await get('/codex').expect(200));
    expectMatches(
      'get',
      '/codex/{specialty_id}',
      await get('/codex/1').expect(200),
    );
    const products = await get('/products').expect(200);
    expectMatches('get', '/products', products);
    expectMatches(
      'get',
      '/products/{product_id}',
      await get(`/products/${products.body.items[0].id}`).expect(200),
    );

    const issued = await post('/quiz/today').expect(200);
    expectMatches('post', '/quiz/today', issued);
    expectMatches('get', '/quiz/today', await get('/quiz/today').expect(200));

    const claimKey = randomUUID();
    const claim = await http()
      .post(`${API}/idle-reward`)
      .set('Authorization', `Bearer ${jwt}`)
      .set('Idempotency-Key', claimKey)
      .expect(200);
    expectMatches('post', '/idle-reward', claim);
    expectMatches(
      'get',
      '/operations/{key}',
      await get(`/operations/${claimKey}`).expect(200),
    );
    expectMatches(
      'post',
      '/equipment/upgrade',
      await post('/equipment/upgrade').expect(200),
    );
    expectMatches(
      'post',
      '/quiz/submit',
      await post('/quiz/submit')
        .send({
          set_id: issued.body.set.set_id,
          answers: [1, 2, 3].map((order_no) => ({
            order_no,
            selected_index: 1,
          })),
        })
        .expect(200),
    );
    await t.ds.query(
      `INSERT INTO user_region_unlock (user_id, region_id) VALUES ($1, 2)`,
      [user.id],
    );
    expectMatches(
      'post',
      '/regions/move',
      await post('/regions/move').send({ target_region_id: 2 }).expect(200),
    );
    expectMatches(
      'post',
      '/user/refresh',
      await post('/user/refresh').expect(200),
    );
    expectMatches(
      'post',
      '/progress/reset',
      await post('/progress/reset').send({ confirmation: 'RESET' }).expect(200),
    );
  });
});

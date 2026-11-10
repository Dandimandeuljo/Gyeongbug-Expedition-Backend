/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startApp, stopApp, TestApp } from './support';

const API = '/api/v1';

describe('게임 API', () => {
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
      .send({ name: `유저${serial}` })
      .expect(201);
    return { jwt: res.body.jwt as string, id: res.body.user.id as number };
  };
  /** 마지막 정산 시각을 과거로 옮겨 시간 경과를 만듭니다. */
  const elapse = (id: number, seconds: number) =>
    t.ds.query(
      `UPDATE idle_reward SET recent_receive = date_trunc('second', now()) - make_interval(secs => $2) WHERE user_id = $1`,
      [id, seconds],
    );
  const setUser = (id: number, set: string) =>
    t.ds.query(`UPDATE users SET ${set} WHERE id = $1`, [id]);

  beforeAll(async () => {
    t = await startApp();
  });

  afterAll(async () => {
    await stopApp(t);
  });

  beforeEach(() => {
    t.rng.length = 0;
  });

  describe('챗봇', () => {
    const chat = (jwt: string, message: unknown) =>
      http()
        .post(`${API}/chat`)
        .set('Authorization', `Bearer ${jwt}`)
        .send({ message });

    it('키가 없으면 정형 답변으로 추천하고 게임 상태를 바꾸지 않는다', async () => {
      const { jwt } = await newUser();
      const before = await get('/user', jwt).expect(200);
      const res = await chat(
        jwt,
        '달콤한 과일을 좋아해! 2만 원 이하로 추천해 줘.',
      ).expect(200);
      expect(res.body).toMatchObject({
        source: 'TEMPLATE',
        recommendation: {
          specialty_id: 1,
          name: '사과',
          region: '청송',
          product: { title: '햇살 과수원 사과' },
        },
      });
      expect(res.body.reply).toContain('청송 사과를 추천해 드릴게요.');
      const after = await get('/user', jwt).expect(200);
      expect(after.body.state_version).toBe(before.body.state_version);
      expect(after.body.gold).toBe(before.body.gold);
    });

    it('저장된 시세로 답하고 없는 특산물은 없다고 답한다', async () => {
      const { jwt } = await newUser();
      await t.ds.query(
        `INSERT INTO specialty_price
           (region_product_id, kind, area, label, unit, price, survey_date)
         VALUES (2, 'RETAIL', '안동', '국산(염장)', '1손', 7180, '2026-11-06')`,
      );
      try {
        const known = await chat(jwt, '고등어 얼마야?').expect(200);
        expect(known.body.prices).toEqual([
          {
            kind: 'RETAIL',
            area: '안동',
            label: '국산(염장)',
            unit: '1손',
            price: 7180,
            year_ago_price: null,
            survey_date: '2026-11-06',
          },
        ]);
        expect(known.body.reply).toContain('7,180원');
        const unknown = await chat(jwt, '과메기 시세 알려줘').expect(200);
        expect(unknown.body.prices).toEqual([]);
        expect(unknown.body.reply).toContain('시세 자료는 아직 없어요');
      } finally {
        await t.ds.query(`DELETE FROM specialty_price`);
      }
    });

    it('빈 메시지, 긴 메시지, 인증 없는 요청을 거절한다', async () => {
      const { jwt } = await newUser();
      await chat(jwt, '   ').expect(400);
      await chat(jwt, '가'.repeat(201)).expect(400);
      await chat(jwt, 1).expect(400);
      await http().post(`${API}/chat`).send({ message: '사과' }).expect(401);
    });
  });

  describe('레벨 진행값', () => {
    it('현재 레벨 안의 경험치를 응답한다', async () => {
      const { jwt, id } = await newUser();
      const fresh = await get('/user', jwt).expect(200);
      expect(fresh.body).toMatchObject({
        level_exp: 0,
        level_exp_required: 100,
      });
      await setUser(id, 'exp = 520, level = 3');
      const mid = await get('/user', jwt).expect(200);
      expect(mid.body).toMatchObject({
        level: 3,
        exp: 520,
        exp_to_next_level: 130,
        level_exp: 220,
        level_exp_required: 350,
      });
      await setUser(id, 'exp = 70000, level = 20');
      const max = await get('/user', jwt).expect(200);
      expect(max.body).toMatchObject({
        exp_to_next_level: 0,
        level_exp: 0,
        level_exp_required: 0,
      });
    });

    it('상태를 바꾸는 응답에도 진행값이 들어간다', async () => {
      const { jwt, id } = await newUser();
      await setUser(id, 'exp = 520, level = 3');
      await elapse(id, 600);
      const claim = await post('/idle-reward', jwt).expect(200);
      expect(claim.body.exp).toBe(530);
      expect(claim.body.level_exp).toBe(230);
      expect(claim.body.level_exp_required).toBe(350);
    });
  });

  describe('공통', () => {
    it('없는 경로와 인증 실패를 정해진 코드로 돌려준다', async () => {
      const { jwt } = await newUser();
      const missing = await get('/nope', jwt).expect(404);
      expect(missing.body.code).toBe('ROUTE_NOT_FOUND');
      const denied = await http().get(`${API}/user`).expect(401);
      expect(denied.body).toMatchObject({
        code: 'UNAUTHORIZED',
        details: null,
      });
      await http().get('/health').expect(200);
    });
  });

  describe('유저', () => {
    it('생성하면 201 과 초기 상태를 돌려준다', async () => {
      const res = await http()
        .post(`${API}/user`)
        .send({ name: '  Abc  ' })
        .expect(201);
      expect(res.body.user).toMatchObject({
        name: 'Abc',
        level: 1,
        exp: 0,
        exp_to_next_level: 100,
        gold: 0,
        level_gold_bonus_percent: 0,
        equipment: {
          stage: 1,
          gold_bonus_percent: 0,
          next_upgrade_cost: 100,
          next_required_level: 1,
        },
        cur_region: { id: 1, code: 'R01', name: '청송' },
        state_version: 0,
      });
      const me = await get('/user', res.body.jwt).expect(200);
      expect(me.body.id).toBe(res.body.user.id);
    });

    it('대소문자만 다른 이름은 409, 제약 위반은 400 이다', async () => {
      await http().post(`${API}/user`).send({ name: 'Dup1' }).expect(201);
      const dup = await http()
        .post(`${API}/user`)
        .send({ name: 'dUP1' })
        .expect(409);
      expect(dup.body.code).toBe('NAME_DUPLICATED');
      const short = await http().post(`${API}/user`).send({ name: 'a' });
      expect(short.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { field: 'name', reason: 'LENGTH' },
      });
      const charset = await http().post(`${API}/user`).send({ name: 'a b!' });
      expect(charset.body.details.reason).toBe('CHARSET');
    });

    it('토큰을 연장한다', async () => {
      const { jwt } = await newUser();
      const res = await post('/user/refresh', jwt).expect(200);
      await get('/user', res.body.jwt).expect(200);
    });
  });

  describe('방치 보상', () => {
    it('v1.2: 1시간이면 몹 900마리가 300골드 60XP 를 주고, 조각은 미리보기에 없다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 3600);
      const preview = await get('/idle-reward', jwt).expect(200);
      expect(preview.body).toMatchObject({
        elapsed_seconds: 3600,
        claimable: true,
        gold: 300,
        exp: 60,
        mobs_defeated: 900,
        piece_judgments: 900,
      });
      expect(preview.body.pieces).toBeUndefined();

      const res = await post('/idle-reward', jwt).expect(200);
      expect(res.body).toMatchObject({
        gold: 300,
        exp: 60,
        gained: {
          gold: 300,
          exp: 60,
          mobs_defeated: 900,
          // 추첨이 모두 실패해도 301·602번째 몹은 확정 드롭이다.
          pieces: { judgments: 900, gained: 2, drop_rate_bp: 60 },
        },
        state_version: 1,
      });
    });

    it('9절 4행: 10시간이 지나도 8시간까지만 지급한다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 36000);
      const res = await post('/idle-reward', jwt).expect(200);
      expect(res.body.gained).toMatchObject({
        elapsed_seconds: 28800,
        capped: true,
        gold: 2400,
        exp: 480,
        mobs_defeated: 7200,
        pieces: { judgments: 7200 },
      });
    });

    it('60초 전에는 CLAIM_TOO_EARLY 이고 상태가 그대로다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 30);
      const res = await post('/idle-reward', jwt).expect(409);
      expect(res.body.code).toBe('CLAIM_TOO_EARLY');
      expect(res.body.details.seconds_remaining).toBeGreaterThan(0);
      const me = await get('/user', jwt);
      expect(me.body.state_version).toBe(0);
    });

    it('레벨 2 는 골드 보너스 5% 를 받는다 (9절 8행)', async () => {
      const { jwt, id } = await newUser();
      await setUser(id, 'level = 2, exp = 100');
      await elapse(id, 3600);
      const res = await post('/idle-reward', jwt).expect(200);
      expect(res.body.gained).toMatchObject({ gold: 315, exp: 60 });
    });

    it('4초 미만 시간은 이월해 다음 정산의 몹 수에 더한다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 62);
      const first = await post('/idle-reward', jwt).expect(200);
      expect(first.body.gained.pieces).toMatchObject({
        judgments: 15,
        gained: 0,
        carry_seconds: 2,
        consecutive_fails: 15,
      });
      await elapse(id, 62);
      t.rng.push(0);
      const second = await post('/idle-reward', jwt).expect(200);
      expect(second.body.gained).toMatchObject({
        mobs_defeated: 16,
        pieces: { judgments: 16, gained: 1, carry_seconds: 0 },
      });
    });
  });

  describe('멱등성', () => {
    it('9절 6행: 같은 키는 추첨 없이 같은 결과를 재생한다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 3600);
      t.rng.push(0, 0, 0, 0, 0);
      const key = randomUUID();
      const first = await post('/idle-reward', jwt, key).expect(200);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      await elapse(id, 3600);
      t.rng.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      const second = await post('/idle-reward', jwt, key).expect(200);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
      const me = await get('/user', jwt);
      expect(me.body.gold).toBe(first.body.gold);

      const found = await get(`/operations/${key}`, jwt).expect(200);
      expect(found.body).toMatchObject({
        key,
        path: 'POST /idle-reward',
        status_code: 200,
      });
      expect(found.body.response).toEqual(first.body);
    });

    it('오류 응답도 저장해 재생한다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 10);
      const key = randomUUID();
      await post('/idle-reward', jwt, key).expect(409);
      await elapse(id, 3600);
      const again = await post('/idle-reward', jwt, key).expect(409);
      expect(again.body.code).toBe('CLAIM_TOO_EARLY');
      expect(again.headers['idempotent-replayed']).toBe('true');
    });

    it('키 없음, 경로 재사용, 다른 유저의 키를 거절한다', async () => {
      const { jwt, id } = await newUser();
      const other = await newUser();
      const none = await http()
        .post(`${API}/idle-reward`)
        .set('Authorization', `Bearer ${jwt}`)
        .expect(400);
      expect(none.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      await elapse(id, 3600);
      const key = randomUUID();
      await post('/idle-reward', jwt, key).expect(200);
      const reused = await post('/equipment/upgrade', jwt, key).expect(409);
      expect(reused.body).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
        details: { original_path: 'POST /idle-reward' },
      });
      const foreign = await post('/idle-reward', other.jwt, key).expect(409);
      expect(foreign.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      await get(`/operations/${key}`, other.jwt).expect(404);
      await get(`/operations/${randomUUID()}`, jwt).expect(404);
    });

    it('동시 요청에도 한 번만 지급한다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 3600);
      const key = randomUUID();
      const [a, b] = await Promise.all([
        post('/idle-reward', jwt, key),
        post('/idle-reward', jwt, key),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body).toEqual(b.body);
      const me = await get('/user', jwt);
      expect(me.body.gold).toBe(300);
      expect(me.body.state_version).toBe(1);
    });
  });

  describe('장비', () => {
    const equipmentState = (id: number) =>
      t.ds.query(
        `SELECT to_jsonb(u) AS player, to_jsonb(e) AS equipment,
                to_jsonb(ir) AS idle, to_jsonb(l) AS logbook,
                (SELECT jsonb_agg(to_jsonb(ur) ORDER BY ur.region_id)
                   FROM user_region_unlock ur WHERE ur.user_id = u.id) AS unlocks
           FROM users u
           JOIN equipment e ON e.user_id = u.id
           JOIN idle_reward ir ON ir.user_id = u.id
           JOIN logbook l ON l.user_id = u.id AND l.region_id = u.cur_region_id
          WHERE u.id = $1`,
        [id],
      );

    it('9절 9행: 요구 레벨 미달이면 정산과 차감을 모두 취소한다', async () => {
      const { jwt, id } = await newUser();
      await setUser(id, 'level = 2, exp = 100, gold = 1000');
      await t.ds.query(
        `UPDATE equipment SET cur_upgrade = 2 WHERE user_id = $1`,
        [id],
      );
      await elapse(id, 600);
      const info = await get('/equipment', jwt).expect(200);
      expect(info.body).toMatchObject({
        can_upgrade: false,
        blocked_by: ['LEVEL'],
      });
      const res = await post('/equipment/upgrade', jwt).expect(409);
      expect(res.body).toMatchObject({
        code: 'EQUIPMENT_LEVEL_REQUIRED',
        details: { required_level: 3, current_level: 2 },
      });
      const me = await get('/user', jwt);
      expect(me.body).toMatchObject({ gold: 1000, state_version: 0 });
      const preview = await get('/idle-reward', jwt);
      expect(preview.body.elapsed_seconds).toBeGreaterThanOrEqual(600);
    });

    it('정산으로 모은 골드로 강화하고 이전 효율을 적용한다', async () => {
      const { jwt, id } = await newUser();
      await elapse(id, 1200); // 100골드
      const info = await get('/equipment', jwt).expect(200);
      expect(info.body).toMatchObject({
        stage: 1,
        max_stage: 5,
        gold: 0,
        gold_after_settle: 100,
        can_upgrade: true,
        blocked_by: [],
        next: { stage: 2, gold_bonus_percent: 10, upgrade_cost: 100 },
      });
      const res = await post('/equipment/upgrade', jwt).expect(200);
      expect(res.body).toMatchObject({
        gold: 0,
        cost: 100,
        equipment: {
          stage: 2,
          gold_bonus_percent: 10,
          next_upgrade_cost: 250,
          next_required_level: 3,
        },
        settled: { gold: 100 },
      });
      await elapse(id, 3600);
      const claim = await post('/idle-reward', jwt).expect(200);
      expect(claim.body.gained.gold).toBe(330); // 300 × 1.10
    });

    it('골드 부족과 최고 단계를 구분한다', async () => {
      const { jwt, id } = await newUser();
      const poorInfo = await get('/equipment', jwt).expect(200);
      expect(poorInfo.body).toMatchObject({
        can_upgrade: false,
        blocked_by: ['GOLD'],
      });
      const poor = await post('/equipment/upgrade', jwt).expect(409);
      expect(poor.body).toMatchObject({
        code: 'INSUFFICIENT_GOLD',
        details: { required: 100 },
      });
      await t.ds.query(
        `UPDATE equipment SET cur_upgrade = 5 WHERE user_id = $1`,
        [id],
      );
      await elapse(id, 600);
      const beforeMax = await equipmentState(id);
      t.rng.push(0, 0);
      const max = await post('/equipment/upgrade', jwt).expect(409);
      expect(max.body).toMatchObject({
        code: 'EQUIPMENT_MAX_STAGE',
        details: { stage: 5 },
      });
      expect(await equipmentState(id)).toEqual(beforeMax);
      expect(t.rng).toEqual([0, 0]);
      const info = await get('/equipment', jwt);
      expect(info.body).toMatchObject({
        is_max: true,
        next: null,
        can_upgrade: false,
        blocked_by: ['MAX_STAGE'],
      });
    });

    it('골드와 레벨이 모두 부족하면 함께 안내하고 정산을 롤백하며 같은 키로 재생한다', async () => {
      const { jwt, id } = await newUser();
      await setUser(
        id,
        'level = 2, exp = 100, gold = 100, gold_remainder = 123, exp_remainder = 456',
      );
      await t.ds.query(
        `UPDATE equipment SET cur_upgrade = 2 WHERE user_id = $1`,
        [id],
      );
      await elapse(id, 600);
      const before = await equipmentState(id);
      const info = await get('/equipment', jwt).expect(200);
      expect(info.body).toMatchObject({
        can_upgrade: false,
        blocked_by: ['GOLD', 'LEVEL'],
        level_after_settle: 2,
      });
      expect(info.body.gold_after_settle).toBeLessThan(250);

      t.rng.push(0, 0);
      const key = randomUUID();
      const first = await post('/equipment/upgrade', jwt, key).expect(409);
      expect(first.body).toMatchObject({
        code: 'EQUIPMENT_REQUIREMENTS_NOT_MET',
        details: {
          blocked_by: ['GOLD', 'LEVEL'],
          required_level: 3,
          current_level: 2,
          required_gold: 250,
        },
      });
      expect(first.body.details.current_gold).toBeGreaterThan(100);
      expect(first.body.details.current_gold).toBeLessThan(250);
      expect(t.rng).toHaveLength(0);
      expect(await equipmentState(id)).toEqual(before);

      // 이제 강화할 수 있어도 같은 요청 키에는 당시의 실패 영수증을 돌려줍니다.
      await setUser(id, 'level = 3, exp = 300, gold = 1000');
      const beforeReplay = await equipmentState(id);
      t.rng.push(0, 0);
      const replay = await post('/equipment/upgrade', jwt, key).expect(409);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(await equipmentState(id)).toEqual(beforeReplay);
      expect(t.rng).toEqual([0, 0]);
      const receipt = await get(`/operations/${key}`, jwt).expect(200);
      expect(receipt.body.status_code).toBe(409);
      expect(receipt.body.response).toEqual(first.body);
    });

    it.each([
      {
        label: '골드만 충족',
        exp: 100,
        gold: 200,
        blockedBy: ['LEVEL'],
        code: 'EQUIPMENT_LEVEL_REQUIRED',
        details: { required_level: 3, current_level: 2 },
      },
      {
        label: '레벨만 충족',
        exp: 295,
        gold: 0,
        blockedBy: ['GOLD'],
        code: 'INSUFFICIENT_GOLD',
        details: { required: 250 },
      },
    ])(
      '둘 다 부족하다가 정산으로 $label 하면 남은 사유만 반환한다',
      async (scenario) => {
        const { jwt, id } = await newUser();
        await t.ds.query(
          `UPDATE users SET level = 2, exp = $2, gold = $3 WHERE id = $1`,
          [id, scenario.exp, scenario.gold],
        );
        await t.ds.query(
          `UPDATE equipment SET cur_upgrade = 2 WHERE user_id = $1`,
          [id],
        );
        await elapse(id, 600);
        const before = await equipmentState(id);
        const info = await get('/equipment', jwt).expect(200);
        expect(info.body).toMatchObject({
          can_upgrade: false,
          blocked_by: scenario.blockedBy,
        });
        const res = await post('/equipment/upgrade', jwt).expect(409);
        expect(res.body).toMatchObject({
          code: scenario.code,
          details: scenario.details,
        });
        expect(await equipmentState(id)).toEqual(before);
      },
    );
  });

  describe('지역', () => {
    it('include_inactive=true 면 잠긴 지역까지 8개를 주고 기본 응답은 유지한다', async () => {
      const { jwt, id } = await newUser();
      const basic = await get('/regions', jwt).expect(200);
      expect(basic.body.regions).toHaveLength(2);
      expect(basic.body.regions[0].is_active).toBe(true);
      const off = await get('/regions?include_inactive=false', jwt).expect(200);
      expect(off.body.regions).toHaveLength(2);

      const all = await get('/regions?include_inactive=true', jwt).expect(200);
      expect(all.body.regions).toHaveLength(8);
      expect(all.body.regions[2]).toMatchObject({
        code: 'R03',
        name: '영주',
        is_active: false,
        status: 'LOCKED',
        unlocked_at: null,
        specialty: { name: '풍기인삼', pieces: 0, required_pieces: 20 },
        unlock: {
          specialty_name: '간고등어',
          required_pieces: 20,
          current_pieces: 0,
        },
      });

      await post('/regions/move', jwt)
        .send({ target_region_id: 3 })
        .expect(404);
      await t.ds.query(
        `INSERT INTO user_region_unlock (user_id, region_id) VALUES ($1, 3)`,
        [id],
      );
      const recorded = await get('/regions?include_inactive=true', jwt);
      expect(recorded.body.regions[2].status).toBe('LOCKED');
      expect(recorded.body.regions[2].unlocked_at).not.toBeNull();
    });

    it('include_inactive 는 true 또는 false 만 받는다', async () => {
      const { jwt } = await newUser();
      for (const path of ['/regions', '/codex']) {
        const res = await get(`${path}?include_inactive=yes`, jwt).expect(400);
        expect(res.body).toMatchObject({
          code: 'VALIDATION_ERROR',
          details: { field: 'include_inactive' },
        });
      }
    });

    it('9절 5행: 조각 20개면 해금을 기록하되 이동하지 않고 조각을 유지한다', async () => {
      const { jwt, id } = await newUser();
      const before = await get('/regions', jwt).expect(200);
      expect(before.body.regions).toHaveLength(2);
      expect(before.body.regions[0]).toMatchObject({
        code: 'R01',
        status: 'CURRENT',
        unlock: null,
      });
      expect(before.body.regions[1]).toMatchObject({
        code: 'R02',
        status: 'LOCKED',
        unlocked_at: null,
        unlock: {
          specialty_name: '사과',
          required_pieces: 20,
          current_pieces: 0,
        },
      });

      const locked = await http()
        .post(`${API}/regions/move`)
        .set('Authorization', `Bearer ${jwt}`)
        .set('Idempotency-Key', randomUUID())
        .send({ target_region_id: 2 })
        .expect(409);
      expect(locked.body).toMatchObject({
        code: 'REGION_LOCKED',
        details: {
          unlock_region: { id: 1, name: '청송' },
          required_pieces: 20,
          current_pieces: 0,
        },
      });

      await t.ds.query(
        `UPDATE logbook SET cur_collect = 19 WHERE user_id = $1`,
        [id],
      );
      await elapse(id, 300);
      t.rng.push(0);
      const claim = await post('/idle-reward', jwt).expect(200);
      expect(claim.body.gained.unlocked_regions).toEqual([
        { id: 2, name: '안동' },
      ]);
      expect(claim.body.gained.pieces.total).toBe(20);
      const me = await get('/user', jwt);
      expect(me.body.cur_region.code).toBe('R01');
      const after = await get('/regions', jwt);
      expect(after.body.regions[1].status).toBe('UNLOCKED');
      expect(after.body.regions[1].unlocked_at).not.toBeNull();
    });

    it('이동은 이전 지역으로 정산하고 이월 초는 그 지역에 남는다', async () => {
      const { jwt, id } = await newUser();
      await t.ds.query(
        `INSERT INTO user_region_unlock (user_id, region_id) VALUES ($1, 2)`,
        [id],
      );
      await elapse(id, 182);
      const move = (target: number) =>
        post('/regions/move', jwt).send({ target_region_id: target });
      const res = await move(2).expect(200);
      expect(res.body).toMatchObject({
        gold: 15,
        cur_region: { code: 'R02' },
        previous_region: { code: 'R01' },
        settled: { pieces: { region_id: 1, judgments: 45, carry_seconds: 2 } },
      });
      await elapse(id, 181);
      const back = await move(1).expect(200);
      expect(back.body.settled.pieces).toMatchObject({
        region_id: 2,
        name: '간고등어',
        drop_rate_bp: 55,
        judgments: 45,
        carry_seconds: 1,
      });
      const carried: { carry_seconds: number }[] = await t.ds.query(
        `SELECT carry_seconds FROM logbook WHERE user_id = $1 AND region_id = 1`,
        [id],
      );
      expect(carried[0].carry_seconds).toBe(2);
      const same = await move(1).expect(409);
      expect(same.body.code).toBe('ALREADY_IN_REGION');
      const inactive = await move(3).expect(404);
      expect(inactive.body.code).toBe('REGION_NOT_FOUND');
    });
  });

  describe('퀴즈', () => {
    const answers = [1, 2, 3].map((order_no) => ({
      order_no,
      selected_index: 0,
    }));

    it('문항이 없으면 QUIZ_NOT_AVAILABLE, 발급 전 조회는 QUIZ_SET_NOT_ISSUED 이다', async () => {
      const { jwt } = await newUser();
      const none = await get('/quiz/today', jwt).expect(404);
      expect(none.body.code).toBe('QUIZ_SET_NOT_ISSUED');
      const missing = await post('/quiz/today', jwt).expect(404);
      expect(missing.body).toMatchObject({
        code: 'QUIZ_NOT_AVAILABLE',
        details: { region_id: 1 },
      });
    });

    describe('문항이 있을 때', () => {
      beforeAll(async () => {
        for (let i = 0; i < 4; i += 1) {
          await t.ds.query(
            `INSERT INTO region_quiz (region_id, content, choices, answer_index, explanation)
             VALUES (1, $1, '["a","b","c","d"]', 0, '해설')`,
            [`문제${i}`],
          );
        }
      });

      it('같은 세트를 돌려주고 제출 전에는 정답을 숨긴다', async () => {
        const { jwt } = await newUser();
        const first = await post('/quiz/today', jwt).expect(200);
        expect(first.body.created).toBe(true);
        expect(first.body.set.status).toBe('ISSUED');
        expect(first.body.set.region.code).toBe('R01');
        expect(first.body.set.questions).toHaveLength(3);
        expect(JSON.stringify(first.body)).not.toContain('answer_index');
        expect(JSON.stringify(first.body)).not.toContain('해설');
        const second = await post('/quiz/today', jwt).expect(200);
        expect(second.body.created).toBe(false);
        expect(second.body.set).toEqual(first.body.set);
        expect(first.body.set.set_id).toBe(
          Number(first.body.set.quiz_date.replaceAll('-', '')),
        );
      });

      it('제출하면 미정산 보상을 먼저 정산하고 100골드 20XP 를 한 번만 준다', async () => {
        const { jwt, id } = await newUser();
        const issued = await post('/quiz/today', jwt).expect(200);
        const set_id = issued.body.set.set_id;
        await elapse(id, 3600);
        const submit = (key?: string) =>
          post('/quiz/submit', jwt, key).send({ set_id, answers });
        const res = await submit().expect(200);
        expect(res.body).toMatchObject({
          gold: 400,
          exp: 80,
          settled: { gold: 300, exp: 60 },
          set: {
            status: 'SUBMITTED',
            result: {
              correct_count: 3,
              total: 3,
              rewarded: { gold: 100, exp: 20 },
            },
          },
        });
        expect(res.body.set.result.answers[0]).toMatchObject({
          answer_index: 0,
          is_correct: true,
          explanation: '해설',
        });
        const again = await submit().expect(409);
        expect(again.body.code).toBe('QUIZ_ALREADY_SUBMITTED');
        const view = await get('/quiz/today', jwt).expect(200);
        expect(view.body.result.correct_count).toBe(3);
      });

      it('입력 오류, 없는 세트, 지난 세트를 구분한다', async () => {
        const { jwt, id } = await newUser();
        const issued = await post('/quiz/today', jwt).expect(200);
        const set_id = issued.body.set.set_id;
        const dupOrders = answers.map((a) => ({ ...a, order_no: 1 }));
        const bad = await post('/quiz/submit', jwt)
          .send({ set_id, answers: dupOrders })
          .expect(400);
        expect(bad.body.code).toBe('VALIDATION_ERROR');
        const short = await post('/quiz/submit', jwt)
          .send({ set_id, answers: answers.slice(0, 2) })
          .expect(400);
        expect(short.body.code).toBe('VALIDATION_ERROR');
        const unknown = await post('/quiz/submit', jwt)
          .send({ set_id: 20000101, answers })
          .expect(404);
        expect(unknown.body.code).toBe('QUIZ_SET_NOT_FOUND');
        await t.ds.query(
          `UPDATE today_region_quiz SET date = date - 1 WHERE user_id = $1`,
          [id],
        );
        const old = String(set_id);
        const stale = await t.ds.query(
          `SELECT replace(date::text, '-', '')::int AS id FROM today_region_quiz WHERE user_id = $1 LIMIT 1`,
          [id],
        );
        expect(String(stale[0].id)).not.toBe(old);
        const expired = await post('/quiz/submit', jwt)
          .send({ set_id: stale[0].id, answers })
          .expect(409);
        expect(expired.body.code).toBe('QUIZ_SET_EXPIRED');
      });
    });
  });

  describe('도감과 상품', () => {
    it('include_inactive=true 면 도감에 8개 특산물을 주고 상세는 계속 막는다', async () => {
      const { jwt } = await newUser();
      const all = await get('/codex?include_inactive=true', jwt).expect(200);
      expect(all.body.summary).toEqual({
        total: 8,
        discovered: 0,
        completed: 0,
      });
      expect(all.body.items[2]).toMatchObject({
        name: '풍기인삼',
        state: 'UNDISCOVERED',
        is_active: false,
        pieces: 0,
        required_pieces: 20,
        image_url: 'http://localhost:3000/static/silhouette.png',
        region: { code: 'R03', status: 'LOCKED' },
      });
      const r03 = await get('/codex?region_id=3&include_inactive=true', jwt);
      expect(r03.status).toBe(200);
      expect(r03.body.items).toHaveLength(1);
      const basic = await get('/codex', jwt).expect(200);
      expect(basic.body.items).toHaveLength(2);
      expect(basic.body.items[0].is_active).toBe(true);
      await get('/codex?region_id=3', jwt).expect(404);
      await get('/codex/3', jwt).expect(404);
    });

    it('미발견은 소개를 숨기고 조각이 있으면 보여 준다', async () => {
      const { jwt, id } = await newUser();
      await t.ds.query(
        `UPDATE region_product SET description = '소개', detail_link = '출처', img_path = 'apple.png' WHERE id = 1`,
      );
      const list = await get('/codex', jwt).expect(200);
      expect(list.body.summary).toEqual({
        total: 2,
        discovered: 0,
        completed: 0,
      });
      expect(list.body.items[0]).toMatchObject({
        name: '사과',
        state: 'UNDISCOVERED',
        image_url: 'http://localhost:3000/static/silhouette.png',
        region: { code: 'R01', status: 'CURRENT' },
      });
      const hidden = await get('/codex/1', jwt).expect(200);
      expect(hidden.body).toMatchObject({
        description: null,
        source: null,
        unlocks_region: { code: 'R02' },
      });

      await t.ds.query(
        `UPDATE logbook SET cur_collect = 5 WHERE user_id = $1`,
        [id],
      );
      const shown = await get('/codex/1', jwt).expect(200);
      expect(shown.body).toMatchObject({
        state: 'COLLECTING',
        description: '소개',
        source: '출처',
        image_url: 'http://localhost:3000/static/apple.png',
      });
      const r02 = await get('/codex?region_id=2', jwt).expect(200);
      expect(r02.body.items).toHaveLength(1);
      const lastActive = await get('/codex/2', jwt).expect(200);
      expect(lastActive.body.unlocks_region).toBeNull();
      await get('/codex/3', jwt).expect(404);
      await get('/codex?region_id=3', jwt).expect(404);
    });

    it('상품은 ACTIVE 먼저, 링크는 ACTIVE 일 때만 준다', async () => {
      const { jwt } = await newUser();
      await t.ds.query(
        `INSERT INTO shop_product (region_id, region_product_id, name, status)
         VALUES (1, 1, '준비', 'PREPARING')`,
      );
      await t.ds.query(
        `INSERT INTO shop_product (region_id, region_product_id, name, status, detail_link, price)
         VALUES (1, 1, '판매', 'ACTIVE', 'https://shop.test/a', 1000)`,
      );
      const list = await get('/products?specialty_id=1', jwt).expect(200);
      expect(list.body.items.map((i: { name: string }) => i.name)).toEqual([
        '판매',
        '준비',
      ]);
      const active = await get(`/products/${list.body.items[0].id}`, jwt);
      expect(active.body).toMatchObject({
        external_url: 'https://shop.test/a',
        link_available: true,
        price: 1000,
      });
      const preparing = await get(`/products/${list.body.items[1].id}`, jwt);
      expect(preparing.body).toMatchObject({
        external_url: null,
        link_available: false,
      });
      await get('/products/99999', jwt).expect(404);
      await get('/products?region_id=3', jwt).expect(404);
      const detail = await get('/codex/1', jwt);
      expect(detail.body.products).toHaveLength(2);
    });
  });

  describe('초기화', () => {
    it('확인 문구가 틀리면 거절하고, 맞으면 삭제 후 토큰이 무효가 된다', async () => {
      const { jwt, id } = await newUser();
      const wrong = await post('/progress/reset', jwt)
        .send({ confirmation: 'NO' })
        .expect(400);
      expect(wrong.body.code).toBe('CONFIRMATION_MISMATCH');
      const key = randomUUID();
      const res = await post('/progress/reset', jwt, key)
        .send({ confirmation: 'RESET' })
        .expect(200);
      expect(res.body.deleted).toBe(true);
      await get('/user', jwt).expect(401);
      const left = await t.ds.query(
        `SELECT user_id FROM operation WHERE idempotency_key = $1`,
        [key],
      );
      expect(left[0].user_id).toBe(id);
      const rows = await t.ds.query(
        `SELECT count(*)::int AS count FROM logbook WHERE user_id = $1`,
        [id],
      );
      expect(rows[0].count).toBe(0);
    });
  });
});

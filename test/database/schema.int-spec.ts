import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/config/typeorm.config';
import { User } from '../../src/database/entities';
import { runSeeds } from '../../src/database/seeds/run-seeds';

const TABLES = [
  'equipment',
  'equipment_stat',
  'equipment_stat_set',
  'equipment_upgrade',
  'idle_reward',
  'logbook',
  'operation',
  'region',
  'region_product',
  'region_quiz',
  'shop_product',
  'today_region_quiz',
  'user_region_unlock',
  'users',
];

describe('스키마', () => {
  let container: StartedPostgreSqlContainer;
  let ds: DataSource;

  const tableNames = async (): Promise<string[]> => {
    const rows: { table_name: string }[] = await ds.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'migrations' ORDER BY 1`,
    );
    return rows.map((row) => row.table_name);
  };

  const sqlState = async (sql: string, params: unknown[] = []) => {
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(sql, params);
      return 'OK';
    } catch (error) {
      return (error as { driverError?: { code?: string } }).driverError?.code;
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  };

  let seq = 0;
  const createUser = async (): Promise<number> => {
    seq += 1;
    const rows: { id: number }[] = await ds.query(
      `INSERT INTO users (name, cur_region_id) VALUES ($1, 1) RETURNING id`,
      [`u${seq}`],
    );
    return rows[0].id;
  };

  const createQuiz = async (): Promise<number> => {
    const rows: { id: number }[] = await ds.query(
      `INSERT INTO region_quiz (region_id, content, choices, answer_index, explanation)
       VALUES (1, 'q', '["a","b","c","d"]', 0, 'e') RETURNING id`,
    );
    return rows[0].id;
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine').start();
    ds = new DataSource(
      buildDataSourceOptions(container.getConnectionUri(), false),
    );
    await ds.initialize();
    await ds.runMigrations();
    await runSeeds(ds);
  });

  afterAll(async () => {
    await ds?.destroy();
    await container?.stop();
  });

  describe('마이그레이션', () => {
    it('14개 테이블을 만든다', async () => {
      expect(await tableNames()).toEqual(TABLES);
    });

    it('엔티티와 마이그레이션 사이에 차이가 없다', async () => {
      const log = await ds.driver.createSchemaBuilder().log();
      expect(log.upQueries.map((query) => query.query)).toEqual([]);
    });

    it('revert 후 테이블이 사라지고 다시 적용된다', async () => {
      await ds.undoLastMigration();
      expect(await tableNames()).toEqual([]);
      await ds.runMigrations();
      await runSeeds(ds);
      expect(await tableNames()).toEqual(TABLES);
    });
  });

  describe('시드', () => {
    it('지역과 특산물이 GAME_RULES 4절과 일치한다', async () => {
      const rows: unknown[] = await ds.query(
        `SELECT r.name, r.sort_order, r.gold_per_minute AS gold, r.exp_per_minute AS exp,
                r.is_active AS active, p.name AS specialty, p.required_pieces AS pieces
         FROM region r JOIN region_product p ON p.region_id = r.id ORDER BY r.sort_order`,
      );
      const row = (
        name: string,
        order: number,
        gold: number,
        exp: number,
        specialty: string,
      ) => ({
        name,
        sort_order: order,
        gold,
        exp,
        active: order <= 2,
        specialty,
        pieces: 20,
      });
      expect(rows).toEqual([
        row('청송', 1, 5, 1, '사과'),
        row('안동', 2, 8, 2, '간고등어'),
        row('영주', 3, 12, 3, '풍기인삼'),
        row('문경', 4, 17, 4, '오미자'),
        row('상주', 5, 23, 5, '곶감'),
        row('성주', 6, 30, 6, '참외'),
        row('의성', 7, 38, 8, '마늘'),
        row('포항', 8, 48, 10, '과메기'),
      ]);
    });

    it('장비 강화 표와 스탯이 GAME_RULES 5절과 일치한다', async () => {
      expect(
        await ds.query(
          `SELECT upgrade, cost, required_level FROM equipment_upgrade ORDER BY upgrade`,
        ),
      ).toEqual([
        { upgrade: 2, cost: 100, required_level: 1 },
        { upgrade: 3, cost: 250, required_level: 3 },
        { upgrade: 4, cost: 500, required_level: 6 },
        { upgrade: 5, cost: 900, required_level: 10 },
      ]);
      expect(await ds.query(`SELECT stat, ratio FROM equipment_stat`)).toEqual([
        { stat: 'GOLD_BONUS', ratio: 10 },
      ]);
    });

    it('다시 실행해도 행 수가 같고 is_active 와 콘텐츠를 덮어쓰지 않는다', async () => {
      await ds.query(
        `UPDATE region SET is_active = true, description = '소개' WHERE id = 3`,
      );
      await runSeeds(ds);
      const [{ count }]: { count: number }[] = await ds.query(
        `SELECT count(*)::int AS count FROM region`,
      );
      expect(count).toBe(8);
      const [region]: { is_active: boolean; description: string }[] =
        await ds.query(
          `SELECT is_active, description FROM region WHERE id = 3`,
        );
      expect(region).toEqual({ is_active: true, description: '소개' });
      await ds.query(
        `UPDATE region SET is_active = false, description = NULL WHERE id = 3`,
      );
    });
  });

  describe('제약', () => {
    let uid: number;
    let quizId: number;

    beforeAll(async () => {
      uid = await createUser();
      quizId = await createQuiz();
      await ds.query(`INSERT INTO idle_reward (user_id) VALUES ($1)`, [uid]);
      await ds.query(`INSERT INTO equipment (user_id) VALUES ($1)`, [uid]);
      await ds.query(
        `INSERT INTO user_region_unlock (user_id, region_id) VALUES ($1, 1)`,
        [uid],
      );
      await ds.query(
        `INSERT INTO logbook (user_id, region_id, region_product_id) VALUES ($1, 1, 1)`,
        [uid],
      );
      await ds.query(
        `INSERT INTO today_region_quiz (user_id, date, order_no, quiz_id)
         VALUES ($1, '2026-11-03', 1, $2)`,
        [uid, quizId],
      );
    });

    const quizInsert = `INSERT INTO region_quiz (region_id, content, choices, answer_index, explanation) VALUES (1, 'q', `;
    const opKey = '3f2b9c1e-6d4a-4f0b-9a7e-1c2d3e4f5a6b';

    it.each<[string, string]>([
      [
        '대소문자만 다른 이름',
        `INSERT INTO users (name, cur_region_id) VALUES ('Abc', 1), ('aBC', 1)`,
      ],
      [
        '유저당 두 번째 idle_reward',
        `INSERT INTO idle_reward (user_id) SELECT user_id FROM idle_reward LIMIT 1`,
      ],
      [
        '유저당 두 번째 equipment',
        `INSERT INTO equipment (user_id) SELECT user_id FROM equipment LIMIT 1`,
      ],
      [
        '같은 유저·지역 logbook',
        `INSERT INTO logbook (user_id, region_id, region_product_id) SELECT user_id, region_id, region_product_id FROM logbook LIMIT 1`,
      ],
      [
        '같은 유저·지역 해금',
        `INSERT INTO user_region_unlock (user_id, region_id) SELECT user_id, region_id FROM user_region_unlock LIMIT 1`,
      ],
      [
        '같은 지역의 두 번째 특산물',
        `INSERT INTO region_product (id, region_id, name) VALUES (99, 1, 'x')`,
      ],
      [
        '같은 날 같은 순서의 문항',
        `INSERT INTO today_region_quiz (user_id, date, order_no, quiz_id) SELECT user_id, date, order_no, quiz_id FROM today_region_quiz LIMIT 1`,
      ],
      [
        '같은 장비·스탯 연결',
        `WITH e AS (SELECT id FROM equipment LIMIT 1) INSERT INTO equipment_stat_set SELECT e.id, 1 FROM e, generate_series(1, 2)`,
      ],
      [
        '같은 operation 키',
        `INSERT INTO operation (idempotency_key, request_path, request_hash, status_code, response_body, expires_at) SELECT '${opKey}'::uuid, 'p', repeat('a', 64), 200, '{}', now() FROM generate_series(1, 2)`,
      ],
    ])('23505: %s', async (_name, sql) => {
      expect(await sqlState(sql)).toBe('23505');
    });

    it.each<[string, string]>([
      ['level 21', `UPDATE users SET level = 21`],
      ['gold -1', `UPDATE users SET gold = -1`],
      ['exp -1', `UPDATE users SET exp = -1`],
      ['gold_remainder 6000', `UPDATE users SET gold_remainder = 6000`],
      ['exp_remainder 6000', `UPDATE users SET exp_remainder = 6000`],
      ['carry_seconds 300', `UPDATE logbook SET carry_seconds = 300`],
      ['consecutive_fails 4', `UPDATE logbook SET consecutive_fails = 4`],
      ['cur_upgrade 6', `UPDATE equipment SET cur_upgrade = 6`],
      ['order_no 4', `UPDATE today_region_quiz SET order_no = 4`],
      [
        'selected_index 4',
        `UPDATE today_region_quiz SET selected_index = 4, right_answer = false, submitted_at = now()`,
      ],
      [
        '제출 컬럼 일부만 채움',
        `UPDATE today_region_quiz SET selected_index = 1`,
      ],
      ['선택지 3개', `${quizInsert}'["a","b","c"]', 0, 'e')`],
      ['배열이 아닌 choices', `${quizInsert}'{"a":1}', 0, 'e')`],
      ['answer_index 4', `${quizInsert}'["a","b","c","d"]', 4, 'e')`],
      [
        'http 링크',
        `INSERT INTO shop_product (region_id, name, detail_link) VALUES (1, 'p', 'http://x.test')`,
      ],
      [
        '링크 없는 ACTIVE',
        `INSERT INTO shop_product (region_id, name, status) VALUES (1, 'p', 'ACTIVE')`,
      ],
      [
        '허용되지 않은 상품 status',
        `INSERT INTO shop_product (region_id, name, status) VALUES (1, 'p', 'X')`,
      ],
      [
        '허용되지 않은 stat',
        `INSERT INTO equipment_stat (id, stat, ratio) VALUES (9, 'X', 1)`,
      ],
      ['sort_order 0', `UPDATE region SET sort_order = 0 WHERE id = 1`],
    ])('23514: %s', async (_name, sql) => {
      expect(await sqlState(sql)).toBe('23514');
    });

    it('23502: expires_at 없는 operation', async () => {
      expect(
        await sqlState(
          `INSERT INTO operation (idempotency_key, request_path, request_hash, status_code, response_body)
           VALUES ('${opKey}', 'p', repeat('a', 64), 200, '{}')`,
        ),
      ).toBe('23502');
    });
  });

  describe('삭제', () => {
    it('유저를 지우면 하위 행은 사라지고 영수증과 마스터는 남는다', async () => {
      const id = await createUser();
      const quizId = await createQuiz();
      const [equipment]: { id: number }[] = await ds.query(
        `INSERT INTO equipment (user_id) VALUES ($1) RETURNING id`,
        [id],
      );
      await ds.query(`INSERT INTO idle_reward (user_id) VALUES ($1)`, [id]);
      await ds.query(`INSERT INTO equipment_stat_set VALUES ($1, 1)`, [
        equipment.id,
      ]);
      await ds.query(
        `INSERT INTO user_region_unlock (user_id, region_id) VALUES ($1, 1)`,
        [id],
      );
      await ds.query(
        `INSERT INTO logbook (user_id, region_id, region_product_id) VALUES ($1, 1, 1)`,
        [id],
      );
      await ds.query(
        `INSERT INTO today_region_quiz (user_id, date, order_no, quiz_id) VALUES ($1, '2026-11-03', 1, $2)`,
        [id, quizId],
      );
      const key = '11111111-1111-4111-8111-111111111111';
      await ds.query(
        `INSERT INTO operation (idempotency_key, user_id, request_path, request_hash, status_code, response_body, expires_at)
         VALUES ($1, $2, 'p', repeat('a', 64), 200, '{}', now() + make_interval(hours => 24))`,
        [key, id],
      );

      await ds.query(`DELETE FROM users WHERE id = $1`, [id]);

      for (const table of [
        'idle_reward',
        'equipment',
        'user_region_unlock',
        'logbook',
        'today_region_quiz',
      ]) {
        const [{ count }]: { count: number }[] = await ds.query(
          `SELECT count(*)::int AS count FROM ${table} WHERE user_id = $1`,
          [id],
        );
        expect(count).toBe(0);
      }
      const [link]: { count: number }[] = await ds.query(
        `SELECT count(*)::int AS count FROM equipment_stat_set WHERE equipment_id = $1`,
        [equipment.id],
      );
      expect(link.count).toBe(0);
      const [operation]: { user_id: number | null }[] = await ds.query(
        `SELECT user_id FROM operation WHERE idempotency_key = $1`,
        [key],
      );
      expect(operation.user_id).toBeNull();
      const [stat]: { count: number }[] = await ds.query(
        `SELECT count(*)::int AS count FROM equipment_stat`,
      );
      expect(stat.count).toBe(1);
    });
  });

  it('트랜잭션 안에서 유저 행을 잠글 수 있다', async () => {
    const id = await createUser();
    await ds.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      expect(user?.id).toBe(id);
    });
  });
});

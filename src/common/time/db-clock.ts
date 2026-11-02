import type { EntityManager } from 'typeorm';

/** 정산 기준 시각. 서버 시계가 아니라 DB 시각을 초 단위로 내림해 씁니다 (GAME_RULES 2절). */
export async function dbNow(manager: EntityManager): Promise<Date> {
  const rows: { now: Date }[] = await manager.query(
    `SELECT date_trunc('second', now()) AS now`,
  );
  return rows[0].now;
}

/** 퀴즈 날짜 경계인 KST 달력 날짜 YYYY-MM-DD */
export async function kstToday(manager: EntityManager): Promise<string> {
  const rows: { today: string }[] = await manager.query(
    `SELECT (now() AT TIME ZONE 'Asia/Seoul')::date::text AS today`,
  );
  return rows[0].today;
}

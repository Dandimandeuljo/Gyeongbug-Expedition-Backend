import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GAME_RULES v1.2 몹 처치 드롭.
 * - region.piece_drop_bp: 몹 1마리당 조각 드롭률(만분율). 기존 행은 v1.2 지역별 값으로 채운다.
 * - logbook: 이월 초 0~299 → 0~3, 연속 실패 0~3 → 0~300.
 *   5분 슬롯 기준이던 이월 초와 연속 실패는 4초 몹 기준과 단위가 달라 이어 쓸 수 없으므로,
 *   이월 초는 4로 나눈 나머지만 남기고 연속 실패는 0 으로 되돌린다.
 */
export class MobDrop1794058436985 implements MigrationInterface {
  name = 'MobDrop1794058436985';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "region" ADD "piece_drop_bp" integer NOT NULL DEFAULT 60`,
    );
    await queryRunner.query(
      `UPDATE "region" SET "piece_drop_bp" = CASE "id"
         WHEN 1 THEN 60 WHEN 2 THEN 55 WHEN 3 THEN 50 WHEN 4 THEN 45
         WHEN 5 THEN 40 WHEN 6 THEN 36 WHEN 7 THEN 33 WHEN 8 THEN 30
         ELSE 60 END`,
    );
    await queryRunner.query(
      `ALTER TABLE "region" ALTER COLUMN "piece_drop_bp" DROP DEFAULT`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "region"."piece_drop_bp" IS '몹 1마리당 특산물 조각 드롭률(만분율, 60 = 0.60%). GAME_RULES v1.2'`,
    );
    await queryRunner.query(
      `ALTER TABLE "region" ADD CONSTRAINT "ck_region_piece_drop_bp_range" CHECK ("piece_drop_bp" BETWEEN 1 AND 10000)`,
    );

    await queryRunner.query(
      `ALTER TABLE "logbook" DROP CONSTRAINT "ck_logbook_carry_seconds_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "logbook" DROP CONSTRAINT "ck_logbook_consecutive_fails_range"`,
    );
    await queryRunner.query(
      `UPDATE "logbook" SET "carry_seconds" = "carry_seconds" % 4, "consecutive_fails" = 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "logbook" ADD CONSTRAINT "ck_logbook_carry_seconds_range" CHECK ("carry_seconds" BETWEEN 0 AND 3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "logbook" ADD CONSTRAINT "ck_logbook_consecutive_fails_range" CHECK ("consecutive_fails" BETWEEN 0 AND 300)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "logbook" DROP CONSTRAINT "ck_logbook_consecutive_fails_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "logbook" DROP CONSTRAINT "ck_logbook_carry_seconds_range"`,
    );
    await queryRunner.query(`UPDATE "logbook" SET "consecutive_fails" = 0`);
    await queryRunner.query(
      `ALTER TABLE "logbook" ADD CONSTRAINT "ck_logbook_consecutive_fails_range" CHECK ("consecutive_fails" BETWEEN 0 AND 3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "logbook" ADD CONSTRAINT "ck_logbook_carry_seconds_range" CHECK ("carry_seconds" BETWEEN 0 AND 299)`,
    );
    await queryRunner.query(
      `ALTER TABLE "region" DROP CONSTRAINT "ck_region_piece_drop_bp_range"`,
    );
    await queryRunner.query(`ALTER TABLE "region" DROP COLUMN "piece_drop_bp"`);
  }
}

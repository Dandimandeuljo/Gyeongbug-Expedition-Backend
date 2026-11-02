import type { DataSource } from 'typeorm';
import {
  EQUIPMENT_UPGRADE_SEED,
  GOLD_BONUS_STAT,
  REGION_SEED,
  REQUIRED_PIECES,
} from './seed-data';

/** 여러 번 실행해도 안전합니다. is_active 와 콘텐츠 컬럼은 충돌 시 건드리지 않습니다. */
export async function runSeeds(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const region of REGION_SEED) {
      await manager.query(
        `INSERT INTO region (id, name, sort_order, gold_per_minute, exp_per_minute, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           sort_order = EXCLUDED.sort_order,
           gold_per_minute = EXCLUDED.gold_per_minute,
           exp_per_minute = EXCLUDED.exp_per_minute`,
        [
          region.id,
          region.name,
          region.sortOrder,
          region.gold,
          region.exp,
          region.active,
        ],
      );
      await manager.query(
        `INSERT INTO region_product (id, region_id, name, required_pieces)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           region_id = EXCLUDED.region_id,
           name = EXCLUDED.name,
           required_pieces = EXCLUDED.required_pieces`,
        [region.id, region.id, region.specialty, REQUIRED_PIECES],
      );
    }

    for (const row of EQUIPMENT_UPGRADE_SEED) {
      await manager.query(
        `INSERT INTO equipment_upgrade (upgrade, cost, required_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (upgrade) DO UPDATE SET
           cost = EXCLUDED.cost,
           required_level = EXCLUDED.required_level`,
        [row.upgrade, row.cost, row.requiredLevel],
      );
    }

    await manager.query(
      `INSERT INTO equipment_stat (id, stat, ratio)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET stat = EXCLUDED.stat, ratio = EXCLUDED.ratio`,
      [GOLD_BONUS_STAT.id, GOLD_BONUS_STAT.stat, GOLD_BONUS_STAT.ratio],
    );
  });
}

import type { DataSource } from 'typeorm';
import { REGION_CONTENT } from './content-data';

/**
 * 콘텐츠 시드입니다. 여러 번 실행해도 안전합니다.
 * 판매처 링크는 실제 존재를 확인한 뒤 넣어야 하므로 상품은 PREPARING 으로만 등록합니다.
 */
export async function runContentSeeds(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const region of REGION_CONTENT) {
      await manager.query(`UPDATE region SET description = $2 WHERE id = $1`, [
        region.regionId,
        region.description,
      ]);
      await manager.query(
        `UPDATE region_product
            SET origin_area = $2, description = $3, detail_link = $4
          WHERE region_id = $1`,
        [
          region.regionId,
          region.specialty.originArea,
          region.specialty.description,
          region.specialty.source,
        ],
      );
      await manager.query(
        `INSERT INTO shop_product (id, region_id, region_product_id, name, status)
         SELECT $1, $2, p.id, $3, 'PREPARING' FROM region_product p WHERE p.region_id = $2
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [region.product.id, region.regionId, region.product.name],
      );
      for (const quiz of region.quizzes) {
        await manager.query(
          `INSERT INTO region_quiz (id, region_id, content, choices, answer_index, explanation)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             region_id = EXCLUDED.region_id,
             content = EXCLUDED.content,
             choices = EXCLUDED.choices,
             answer_index = EXCLUDED.answer_index,
             explanation = EXCLUDED.explanation`,
          [
            quiz.id,
            region.regionId,
            quiz.content,
            JSON.stringify(quiz.choices),
            quiz.answerIndex,
            quiz.explanation,
          ],
        );
      }
    }
    // ID 를 직접 넣었으므로 자동 증가 값을 맞춥니다.
    for (const table of ['region_quiz', 'shop_product']) {
      await manager.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`,
      );
    }
  });
}

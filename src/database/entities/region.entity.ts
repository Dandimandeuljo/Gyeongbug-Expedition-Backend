import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('region')
@Check('ck_region_sort_order_min', '"sort_order" >= 1')
@Check('ck_region_gold_per_minute_pos', '"gold_per_minute" > 0')
@Check('ck_region_exp_per_minute_pos', '"exp_per_minute" > 0')
@Check('ck_region_piece_drop_bp_range', '"piece_drop_bp" BETWEEN 1 AND 10000')
export class Region {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ type: 'int', unique: true })
  sortOrder!: number;

  @Column({ type: 'int' })
  goldPerMinute!: number;

  @Column({ type: 'int' })
  expPerMinute!: number;

  /** 몹 1마리당 특산물 조각 드롭률(만분율). GAME_RULES v1.2 지역별 드롭률. */
  @Column({
    type: 'int',
    comment:
      '몹 1마리당 특산물 조각 드롭률(만분율, 60 = 0.60%). GAME_RULES v1.2',
  })
  pieceDropBp!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  description!: string | null;
}

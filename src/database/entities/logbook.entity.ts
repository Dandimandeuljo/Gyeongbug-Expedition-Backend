import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RegionProduct } from './region-product.entity';
import { Region } from './region.entity';
import { User } from './users.entity';

@Entity('logbook')
@Unique('uq_logbook_user_region', ['userId', 'regionId'])
@Check('ck_logbook_cur_collect_nonneg', '"cur_collect" >= 0')
@Check('ck_logbook_carry_seconds_range', '"carry_seconds" BETWEEN 0 AND 299')
@Check(
  'ck_logbook_consecutive_fails_range',
  '"consecutive_fails" BETWEEN 0 AND 3',
)
export class Logbook {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'int' })
  regionId!: number;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ type: 'int' })
  regionProductId!: number;

  @ManyToOne(() => RegionProduct, { nullable: false })
  @JoinColumn({ name: 'region_product_id' })
  regionProduct?: RegionProduct;

  @Column({ type: 'int', default: 0 })
  curCollect!: number;

  @Column({ type: 'int', default: 0 })
  carrySeconds!: number;

  @Column({ type: 'int', default: 0 })
  consecutiveFails!: number;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}

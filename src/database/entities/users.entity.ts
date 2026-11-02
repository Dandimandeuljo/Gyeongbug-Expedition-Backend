import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Region } from './region.entity';

@Entity('users')
@Index('ux_users_name_lower', { synchronize: false })
@Check('ck_users_level_range', '"level" BETWEEN 1 AND 20')
@Check('ck_users_exp_nonneg', '"exp" >= 0')
@Check('ck_users_gold_nonneg', '"gold" >= 0')
@Check('ck_users_gold_remainder_range', '"gold_remainder" BETWEEN 0 AND 5999')
@Check('ck_users_exp_remainder_range', '"exp_remainder" BETWEEN 0 AND 5999')
@Check('ck_users_state_version_nonneg', '"state_version" >= 0')
export class User {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id!: number;

  @Column({ type: 'varchar', length: 10 })
  name!: string;

  @Column({ type: 'int', default: 1 })
  level!: number;

  @Column({ type: 'int', default: 0 })
  exp!: number;

  @Column({ type: 'int', default: 0 })
  gold!: number;

  @Column({ type: 'int', default: 0 })
  goldRemainder!: number;

  @Column({ type: 'int', default: 0 })
  expRemainder!: number;

  @Column({ type: 'int', default: 0 })
  stateVersion!: number;

  @Column({ type: 'int' })
  curRegionId!: number;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'cur_region_id' })
  curRegion?: Region;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

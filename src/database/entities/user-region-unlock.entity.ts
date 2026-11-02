import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Region } from './region.entity';
import { User } from './users.entity';

@Entity('user_region_unlock')
export class UserRegionUnlock {
  @PrimaryColumn({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @PrimaryColumn({ type: 'int' })
  regionId!: number;

  @ManyToOne(() => Region)
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  unlockedAt!: Date;
}

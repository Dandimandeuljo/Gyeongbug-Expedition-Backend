import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './users.entity';

@Entity('equipment')
@Check(
  'ck_equipment_cur_upgrade_range',
  '"cur_upgrade" BETWEEN 1 AND "max_upgrade"',
)
export class Equipment {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 50, default: '탐험 장비' })
  name!: string;

  @Column({ type: 'int', default: 1 })
  curUpgrade!: number;

  @Column({ type: 'int', default: 5 })
  maxUpgrade!: number;
}

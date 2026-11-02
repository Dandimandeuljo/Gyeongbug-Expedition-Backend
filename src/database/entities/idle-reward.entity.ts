import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from './users.entity';

@Entity('idle_reward')
export class IdleReward {
  @PrimaryColumn({ type: 'int' })
  userId!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'timestamptz',
    default: () => 'now()',
    comment:
      '마지막 정산 시각. 수령·강화·이동·퀴즈 제출 정산이 끝날 때마다 DB now() 로 갱신',
  })
  recentReceive!: Date;
}

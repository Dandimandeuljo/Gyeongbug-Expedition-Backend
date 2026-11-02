import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './users.entity';

/** 멱등성 키별 처리 결과. 유저가 삭제되어도 보관 기간까지 남습니다. */
@Entity('operation')
@Index('ix_operation_expires_at', ['expiresAt'])
@Check('ck_operation_status_code', '"status_code" BETWEEN 100 AND 599')
export class Operation {
  @PrimaryColumn({ type: 'uuid' })
  idempotencyKey!: string;

  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'varchar', length: 100 })
  requestPath!: string;

  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'int' })
  statusCode!: number;

  @Column({ type: 'jsonb' })
  responseBody!: unknown;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  /** 식 기본값을 두지 않고 INSERT 때 now() + 보관 시간으로 넣습니다. */
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;
}

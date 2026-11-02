import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * 멱등성 키별 처리 결과입니다.
 * user_id 는 FK 가 아닙니다. 초기화로 유저가 삭제된 뒤에도 소유자를 확인해 재생해야 하기 때문입니다.
 * 유저 ID 는 재사용되지 않고 행은 보관 기간 뒤 삭제됩니다.
 */
@Entity('operation')
@Index('ix_operation_expires_at', ['expiresAt'])
@Check('ck_operation_status_code', '"status_code" BETWEEN 100 AND 599')
export class Operation {
  @PrimaryColumn({ type: 'uuid' })
  idempotencyKey!: string;

  @Column({ type: 'int' })
  userId!: number;

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

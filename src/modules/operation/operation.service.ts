import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import type { OperationContext } from '../../common/decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { Operation, User } from '../../database/entities';
import { IDEMPOTENCY_TTL_HOURS } from '../settlement/game-rules.constants';

/** 초기화 영수증의 경로입니다. 유저 삭제 뒤 재시도를 판별할 때 씁니다. */
export const RESET_OPERATION_PATH = 'POST /progress/reset';

/** 같은 키가 이미 처리된 것을 발견했을 때 던지는 신호입니다. 트랜잭션을 롤백합니다. */
export class OperationReplay extends Error {
  constructor(readonly operation: Operation) {
    super('operation replay');
  }
}

const INSERT_SQL = `INSERT INTO operation
  (idempotency_key, user_id, request_path, request_hash, status_code, response_body, expires_at)
  VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING idempotency_key`;

@Injectable()
export class OperationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * 유저 행을 잠그고 요청 키를 다시 확인한 뒤(GAME_RULES 6절 1단계) 본 처리를 실행하고,
   * 성공 응답을 같은 트랜잭션에 저장합니다.
   */
  execute<T>(
    context: OperationContext,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: context.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const existing = await this.loadLive(manager, context.key);
      if (existing) {
        throw new OperationReplay(existing);
      }
      if (!user) {
        // 영수증을 먼저 봅니다. 동시 초기화 재시도는 잠금을 기다리는 동안 유저가 사라집니다.
        throw new GameError(ErrorCode.UNAUTHORIZED);
      }
      const body = await work(manager);
      const saved = await this.insert(manager, context, 200, body);
      if (!saved) {
        // 다른 유저가 같은 키를 먼저 저장했습니다. 유저 잠금으로는 막히지 않는 경우입니다.
        throw new OperationReplay(
          await manager.findOneByOrFail(Operation, {
            idempotencyKey: context.key,
          }),
        );
      }
      return body;
    });
  }

  /**
   * 4xx 응답을 저장합니다. 본 트랜잭션이 롤백된 뒤 별도로 실행됩니다.
   * 같은 키가 이미 있으면 false 를 돌려줍니다.
   */
  saveError(
    context: OperationContext,
    status: number,
    body: unknown,
  ): Promise<boolean> {
    return this.insert(this.dataSource.manager, context, status, body);
  }

  /** 보관 기간이 지나지 않은 영수증을 찾습니다. */
  findLive(key: string): Promise<Operation | null> {
    return this.loadLive(this.dataSource.manager, key);
  }

  /** 삭제된 유저가 자신의 초기화를 재시도하는 요청인지 확인합니다. */
  async hasResetReceipt(key: string, userId: number): Promise<boolean> {
    if (!isUUID(key, '4')) {
      return false;
    }
    const operation = await this.findLive(key);
    return (
      operation?.userId === userId &&
      operation.requestPath === RESET_OPERATION_PATH
    );
  }

  async view(key: string, userId: number) {
    const operation = isUUID(key) ? await this.findLive(key) : null;
    if (operation?.userId !== userId) {
      throw new GameError(ErrorCode.OPERATION_NOT_FOUND);
    }
    return {
      key: operation.idempotencyKey,
      path: operation.requestPath,
      status_code: operation.statusCode,
      response: operation.responseBody,
      created_at: operation.createdAt,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async deleteExpired(): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM operation WHERE expires_at <= now()`,
    );
  }

  /** 삭제 조건에 만료를 넣어, 그사이 새로 저장된 영수증을 지우지 않습니다. */
  private async loadLive(
    manager: EntityManager,
    key: string,
  ): Promise<Operation | null> {
    await manager.query(
      `DELETE FROM operation WHERE idempotency_key = $1 AND expires_at <= now()`,
      [key],
    );
    return manager.findOneBy(Operation, { idempotencyKey: key });
  }

  /** 저장했으면 true, 같은 키가 이미 있으면 false 입니다. */
  private async insert(
    manager: EntityManager,
    context: OperationContext,
    status: number,
    body: unknown,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(INSERT_SQL, [
      context.key,
      context.userId,
      context.path,
      context.hash,
      status,
      JSON.stringify(body),
      IDEMPOTENCY_TTL_HOURS,
    ]);
    return rows.length > 0;
  }
}

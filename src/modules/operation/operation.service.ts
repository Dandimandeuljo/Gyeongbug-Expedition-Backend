import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import type { OperationContext } from '../../common/decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { Operation, User } from '../../database/entities';
import { IDEMPOTENCY_TTL_HOURS } from '../settlement/game-rules.constants';

/** 잠금을 얻은 뒤 같은 키가 이미 처리된 것을 발견했을 때 던지는 신호입니다. */
export class OperationReplay extends Error {
  constructor(readonly operation: Operation) {
    super('operation replay');
  }
}

const INSERT_SQL = `INSERT INTO operation
  (idempotency_key, user_id, request_path, request_hash, status_code, response_body, expires_at)
  VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
  ON CONFLICT (idempotency_key) DO NOTHING`;

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
    options: { deletesUser?: boolean } = {},
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: context.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new GameError(ErrorCode.UNAUTHORIZED);
      }
      const existing = await manager.findOneBy(Operation, {
        idempotencyKey: context.key,
      });
      if (existing) {
        throw new OperationReplay(existing);
      }
      const body = await work(manager);
      await this.insert(
        manager,
        context,
        200,
        body,
        options.deletesUser ? null : context.userId,
      );
      return body;
    });
  }

  /** 4xx 응답을 저장합니다. 본 트랜잭션이 롤백된 뒤 별도로 실행됩니다. */
  saveError(
    context: OperationContext,
    status: number,
    body: unknown,
  ): Promise<void> {
    return this.insert(
      this.dataSource.manager,
      context,
      status,
      body,
      context.userId,
    );
  }

  /** 보관 기간이 지나지 않은 영수증을 찾습니다. 만료된 행은 지웁니다. */
  async findLive(key: string): Promise<Operation | null> {
    const operation = await this.dataSource.manager.findOneBy(Operation, {
      idempotencyKey: key,
    });
    if (!operation) {
      return null;
    }
    const rows: { live: boolean }[] = await this.dataSource.query(
      `SELECT expires_at > now() AS live FROM operation WHERE idempotency_key = $1`,
      [key],
    );
    if (rows[0]?.live) {
      return operation;
    }
    await this.dataSource.manager.delete(Operation, { idempotencyKey: key });
    return null;
  }

  async view(key: string, userId: number) {
    const operation = isUUID(key) ? await this.findLive(key) : null;
    if (!operation || operation.userId !== userId) {
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

  private async insert(
    manager: EntityManager,
    context: OperationContext,
    status: number,
    body: unknown,
    userId: number | null,
  ): Promise<void> {
    await manager.query(INSERT_SQL, [
      context.key,
      userId,
      context.path,
      context.hash,
      status,
      JSON.stringify(body),
      IDEMPOTENCY_TTL_HOURS,
    ]);
  }
}

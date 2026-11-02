import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { catchError, from, Observable, of, switchMap, throwError } from 'rxjs';
import {
  AuthUser,
  IS_IDEMPOTENT,
  OperationContext,
} from '../../common/decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError, GameErrorBody } from '../../common/errors/game-error';
import type { Operation } from '../../database/entities';
import { OperationReplay, OperationService } from './operation.service';

const REPLAY_HEADER = 'Idempotent-Replayed';

type IdempotentRequest = Request & {
  user: AuthUser;
  operation?: OperationContext;
};

function bodyHash(body: unknown): string {
  const hasBody =
    typeof body === 'object' && body !== null && Object.keys(body).length > 0;
  return createHash('sha256')
    .update(hasBody ? JSON.stringify(body) : '')
    .digest('hex');
}

/** API 0-4 의 요청 키 검사, 재생, 4xx 저장을 담당합니다. 성공 저장은 OperationService.execute 가 합니다. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly operations: OperationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IS_IDEMPOTENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const response = http.getResponse<Response>();
    const key = request.header('Idempotency-Key');
    if (!key || !isUUID(key, '4')) {
      return throwError(
        () => new GameError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED),
      );
    }
    const routePath = String((request.route as { path: string }).path).replace(
      /^\/api\/v1/,
      '',
    );
    const operation: OperationContext = {
      key,
      userId: request.user.id,
      path: `${request.method} ${routePath}`,
      hash: bodyHash(request.body),
    };
    request.operation = operation;

    return from(this.operations.findLive(key)).pipe(
      switchMap((existing) => {
        if (existing) {
          this.assertSameRequest(existing, operation);
          return this.replay(existing, response);
        }
        return next.handle().pipe(
          catchError((error: unknown) => {
            if (error instanceof OperationReplay) {
              this.assertSameRequest(error.operation, operation);
              return this.replay(error.operation, response);
            }
            if (
              error instanceof GameError &&
              error.getStatus() < Number(HttpStatus.INTERNAL_SERVER_ERROR)
            ) {
              return from(
                this.operations.saveError(
                  operation,
                  error.getStatus(),
                  error.getResponse(),
                ),
              ).pipe(
                switchMap((saved) =>
                  saved
                    ? throwError(() => error)
                    : this.replayAfterConflict(operation, error, response),
                ),
              );
            }
            return throwError(() => error);
          }),
        );
      }),
    );
  }

  /** 동시에 들어온 같은 키가 먼저 저장된 경우입니다. 다른 요청이면 409, 같은 요청이면 재생합니다. */
  private replayAfterConflict(
    operation: OperationContext,
    error: GameError,
    response: Response,
  ): Observable<unknown> {
    return from(this.operations.findLive(operation.key)).pipe(
      switchMap((existing) => {
        if (!existing) {
          return throwError(() => error);
        }
        this.assertSameRequest(existing, operation);
        return this.replay(existing, response);
      }),
    );
  }

  private assertSameRequest(
    existing: Operation,
    current: OperationContext,
  ): void {
    const sameUser = existing.userId === current.userId;
    if (
      !sameUser ||
      existing.requestPath !== current.path ||
      existing.requestHash !== current.hash
    ) {
      throw new GameError(ErrorCode.IDEMPOTENCY_KEY_REUSED, {
        original_path: sameUser ? existing.requestPath : current.path,
      });
    }
  }

  private replay(existing: Operation, response: Response): Observable<unknown> {
    response.setHeader(REPLAY_HEADER, 'true');
    if (existing.statusCode >= Number(HttpStatus.BAD_REQUEST)) {
      const body = existing.responseBody as GameErrorBody;
      return throwError(
        () => new GameError(body.code, body.details, body.message),
      );
    }
    return of(existing.responseBody);
  }
}

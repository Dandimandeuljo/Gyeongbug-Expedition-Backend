import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from './error-code.enum';
import { GameError, GameErrorBody } from './game-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    let error: GameError;

    if (exception instanceof GameError) {
      error = exception;
    } else if (exception instanceof HttpException) {
      error = this.fromHttpException(exception);
    } else {
      error = new GameError(ErrorCode.INTERNAL_ERROR);
    }

    if (error.getStatus() === Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      // 예외 메시지에는 닉네임·토큰이 섞일 수 있으므로 호출 위치만 기록합니다.
      const frames =
        exception instanceof Error
          ? exception.stack
              ?.replace(exception.message, '')
              ?.split('\n')
              .filter((line) => /^\s+at /.test(line))
              .join('\n')
          : undefined;
      this.logger.error(ErrorCode.INTERNAL_ERROR, frames ?? '');
      // 직접 던진 INTERNAL_ERROR도 내부 상세를 응답으로 노출하지 않습니다.
      error = new GameError(ErrorCode.INTERNAL_ERROR);
    }

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.getStatus())
      .json(error.getResponse());
  }

  /** 프레임워크가 던진 예외를 API 0-3 의 코드로 바꿉니다. */
  private fromHttpException(exception: HttpException): GameError {
    switch (exception.getStatus()) {
      case Number(HttpStatus.BAD_REQUEST):
        return new GameError(
          ErrorCode.VALIDATION_ERROR,
          this.validationDetails(exception),
        );
      case Number(HttpStatus.UNAUTHORIZED):
        return new GameError(ErrorCode.UNAUTHORIZED);
      case Number(HttpStatus.NOT_FOUND):
        return new GameError(ErrorCode.ROUTE_NOT_FOUND);
      case Number(HttpStatus.TOO_MANY_REQUESTS):
        return new GameError(ErrorCode.RATE_LIMITED);
      default:
        return new GameError(ErrorCode.INTERNAL_ERROR);
    }
  }

  private validationDetails(
    exception: HttpException,
  ): GameErrorBody['details'] {
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return { field: 'body', reason: body };
    }

    const message: unknown = 'message' in body ? body.message : undefined;
    const field: unknown = 'field' in body ? body.field : undefined;
    const reason =
      typeof message === 'string'
        ? message
        : Array.isArray(message) &&
            message.every((value): value is string => typeof value === 'string')
          ? message.join('; ')
          : exception.message;

    return { field: typeof field === 'string' ? field : 'body', reason };
  }
}

import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { IS_CREATE_USER_THROTTLE, IS_PUBLIC } from '../../common/decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { extractBearerToken } from './bearer-token';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  override handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
    // DB 장애를 401 로 바꾸면 클라이언트가 멀쩡한 토큰을 지웁니다. 인증 실패만 401 입니다.
    if (error) {
      throw error instanceof Error
        ? error
        : new GameError(ErrorCode.INTERNAL_ERROR);
    }
    if (!user) {
      throw new GameError(ErrorCode.UNAUTHORIZED);
    }
    return user;
  }
}

/** 인증 요청은 유저당, POST /user 는 IP 당으로 제한합니다 (API 0-0). */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storage, reflector);
  }

  protected override async handleRequest(
    props: ThrottlerRequest,
  ): Promise<boolean> {
    const isCreateUser = Boolean(
      this.reflector.getAllAndOverride<boolean>(IS_CREATE_USER_THROTTLE, [
        props.context.getHandler(),
        props.context.getClass(),
      ]),
    );
    if ((props.throttler.name === 'createUser') !== isCreateUser) {
      return true;
    }
    // 계정 생성은 토큰으로 우회하지 못하도록 항상 IP 로 셉니다.
    return super.handleRequest(
      isCreateUser
        ? { ...props, getTracker: (request) => this.ipTracker(request) }
        : props,
    );
  }

  protected override getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const token = extractBearerToken(request);
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: number }>(token);
        return Promise.resolve(`user:${payload.sub}`);
      } catch {
        // 유효하지 않은 토큰은 IP 기준으로 셉니다.
      }
    }
    return this.ipTracker(request);
  }

  /** 기본 키는 컨트롤러·핸들러를 포함하므로, 유저당 제한이 전체 경로에 걸리도록 바꿉니다. */
  protected override generateKey(
    _context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    return `${name}:${suffix}`;
  }

  private ipTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(`ip:${String(request.ip)}`);
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new GameError(ErrorCode.RATE_LIMITED, {
      retry_after_seconds: detail.timeToBlockExpire,
    });
  }
}

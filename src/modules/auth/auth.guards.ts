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
    if (error || !user) {
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
    return super.handleRequest(props);
  }

  protected override getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const headers = request.headers as Record<string, string | undefined>;
    const token = headers.authorization?.replace(/^Bearer /, '');
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: number }>(token);
        return Promise.resolve(`user:${payload.sub}`);
      } catch {
        // 유효하지 않은 토큰은 IP 기준으로 셉니다.
      }
    }
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

import type { Request } from 'express';
import { OperationService } from '../operation/operation.service';
import { extractBearerToken } from './bearer-token';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { Strategy } from 'passport-jwt';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators';
import { User } from '../../database/entities';

const RESET_REQUEST_PATH = '/api/v1/progress/reset';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly operations: OperationService,
  ) {
    super({
      jwtFromRequest: extractBearerToken,
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  /**
   * 초기화로 삭제된 유저의 토큰은 거절합니다.
   * 단 자신의 초기화 재시도는 저장된 응답을 재생할 수 있도록 통과시킵니다 (API 2-18).
   */
  async validate(
    request: Request,
    payload: { sub: number },
  ): Promise<AuthUser | false> {
    const exists = await this.dataSource.manager.existsBy(User, {
      id: payload.sub,
    });
    if (exists) {
      return { id: payload.sub };
    }
    const key = request.header('Idempotency-Key');
    const isResetRetry =
      request.method === 'POST' &&
      request.path === RESET_REQUEST_PATH &&
      key !== undefined &&
      (await this.operations.hasResetReceipt(key, payload.sub));
    return isResetRetry ? { id: payload.sub } : false;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators';
import { User } from '../../database/entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** 초기화로 삭제된 유저의 토큰은 여기서 거절됩니다. */
  async validate(payload: { sub: number }): Promise<AuthUser | false> {
    const exists = await this.dataSource.manager.existsBy(User, {
      id: payload.sub,
    });
    return exists ? { id: payload.sub } : false;
  }
}

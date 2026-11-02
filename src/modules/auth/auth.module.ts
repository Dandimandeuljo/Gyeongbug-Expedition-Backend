import {
  Body,
  Controller,
  Global,
  HttpCode,
  Injectable,
  Module,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches, registerDecorator } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  CreateUserThrottle,
  CurrentUser,
  Public,
} from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { dbNow } from '../../common/time/db-clock';
import {
  Equipment,
  EquipmentStat,
  EquipmentStatSet,
  IdleReward,
  Logbook,
  Region,
  RegionProduct,
  User,
  UserRegionUnlock,
} from '../../database/entities';
import {
  BANNED_WORDS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
} from '../settlement/game-rules.constants';
import { UserModule, UserService } from '../user/user.module';

function NotBannedWord() {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'notBannedWord',
      target: target.constructor,
      propertyName,
      options: { message: 'BANNED_WORD' },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          !BANNED_WORDS.some((word) => value.toLowerCase().includes(word)),
      },
    });
  };
}

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'LENGTH' })
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH, { message: 'LENGTH' })
  @Matches(/^[가-힣A-Za-z0-9]+$/, { message: 'CHARSET' })
  @NotBannedWord()
  name!: string;
}

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

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly users: UserService,
  ) {}

  async createUser(name: string) {
    let userId: number;
    try {
      userId = await this.dataSource.transaction(async (manager) => {
        const now = await dbNow(manager);
        const region = await manager
          .createQueryBuilder(Region, 'r')
          .orderBy('r.sortOrder', 'ASC')
          .getOneOrFail();
        const product = await manager.findOneByOrFail(RegionProduct, {
          regionId: region.id,
        });
        const stat = await manager.findOneByOrFail(EquipmentStat, {
          stat: 'GOLD_BONUS',
        });
        const user = await manager.save(
          manager.create(User, { name, curRegionId: region.id }),
        );
        await manager.insert(IdleReward, {
          userId: user.id,
          recentReceive: now,
        });
        const equipment = await manager.save(
          manager.create(Equipment, { userId: user.id }),
        );
        await manager.insert(EquipmentStatSet, {
          equipmentId: equipment.id,
          equipmentStatId: stat.id,
        });
        await manager.insert(UserRegionUnlock, {
          userId: user.id,
          regionId: region.id,
          unlockedAt: now,
        });
        await manager.insert(Logbook, {
          userId: user.id,
          regionId: region.id,
          regionProductId: product.id,
        });
        return user.id;
      });
    } catch (error) {
      const driverError = (
        error as QueryFailedError<Error & { constraint?: string }>
      ).driverError;
      if (
        error instanceof QueryFailedError &&
        driverError?.constraint === 'ux_users_name_lower'
      ) {
        throw new GameError(ErrorCode.NAME_DUPLICATED);
      }
      throw error;
    }
    return {
      jwt: await this.sign(userId),
      user: await this.users.view(userId),
    };
  }

  async refresh(userId: number) {
    return { jwt: await this.sign(userId) };
  }

  private sign(userId: number): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }
}

@Controller('user')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiEndpoint(DOCS.createUser)
  @Public()
  @CreateUserThrottle()
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.auth.createUser(body.name);
  }

  @ApiEndpoint(DOCS.refreshToken)
  @Post('refresh')
  @HttpCode(200)
  refresh(@CurrentUser() user: AuthUser) {
    return this.auth.refresh(user.id);
  }
}

@Global()
@Module({
  imports: [
    PassportModule,
    UserModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          expiresIn: `${config.getOrThrow<number>('JWT_TTL_DAYS')}d`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}

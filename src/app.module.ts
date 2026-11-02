import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Joi from 'joi';
import { buildDataSourceOptions } from './config/typeorm.config';
import { HealthController } from './health.controller';
import { AppThrottlerGuard, JwtAuthGuard } from './modules/auth/auth.guards';
import { AuthModule } from './modules/auth/auth.module';
import { CodexModule } from './modules/codex/codex.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { IdleRewardModule } from './modules/idle-reward/idle-reward.module';
import { OperationModule } from './modules/operation/operation.module';
import { ProductModule } from './modules/product/product.module';
import { ProgressModule } from './modules/progress/progress.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { RegionModule } from './modules/region/region.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      // ARCHITECTURE 5절
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .required(),
        PORT: Joi.number().port().required(),
        TZ: Joi.string().valid('UTC').required(),
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgres', 'postgresql'] })
          .required(),
        DATABASE_SSL: Joi.boolean().required(),
        DATABASE_SSL_CA: Joi.string().empty('').optional(),
        JWT_SECRET: Joi.string().min(32, 'utf8').required(),
        JWT_TTL_DAYS: Joi.number().integer().positive().required(),
        CORS_ORIGIN: Joi.string()
          .custom((value: string, helpers) => {
            const origins = value.split(',').map((origin) => origin.trim());
            try {
              if (
                origins.some((origin) => {
                  const url = new URL(origin);
                  return (
                    !['http:', 'https:'].includes(url.protocol) ||
                    url.origin !== origin
                  );
                })
              ) {
                return helpers.error('any.invalid');
              }
            } catch {
              return helpers.error('any.invalid');
            }
            return value;
          })
          .required(),
        THROTTLE_PER_USER_PER_MINUTE: Joi.number()
          .integer()
          .positive()
          .required(),
        THROTTLE_CREATE_USER_PER_IP_PER_HOUR: Joi.number()
          .integer()
          .positive()
          .required(),
        LOG_LEVEL: Joi.string()
          .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
          .required(),
        SWAGGER_ENABLED: Joi.boolean().required(),
        TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
        STATIC_ROOT: Joi.string().required(),
        PUBLIC_BASE_URL: Joi.string()
          .uri({ scheme: ['http', 'https'] })
          .required(),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions(
          config.getOrThrow<string>('DATABASE_URL'),
          String(config.get('DATABASE_SSL')) === 'true',
          config.get<string>('DATABASE_SSL_CA'),
        ),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('LOG_LEVEL'),
          // 토큰과 요청 본문은 로그에 남기지 않습니다 (SECURITY 7절).
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: config.getOrThrow<number>('THROTTLE_PER_USER_PER_MINUTE'),
          },
          {
            name: 'createUser',
            ttl: 3_600_000,
            limit: config.getOrThrow<number>(
              'THROTTLE_CREATE_USER_PER_IP_PER_HOUR',
            ),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    SettlementModule,
    OperationModule,
    AuthModule,
    UserModule,
    IdleRewardModule,
    EquipmentModule,
    RegionModule,
    QuizModule,
    CodexModule,
    ProductModule,
    ProgressModule,
  ],
  controllers: [HealthController],
  providers: [
    // 순서가 곧 실행 순서입니다 (ARCHITECTURE 3-2).
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { runSeeds } from '../../src/database/seeds/run-seeds';
import { SETTLEMENT_RNG } from '../../src/modules/settlement/settlement.service';

export interface TestApp {
  app: NestExpressApplication;
  ds: DataSource;
  container: StartedPostgreSqlContainer;
  rng: number[];
}

/** 개발 DB 를 건드리지 않도록 .env 를 읽지 않고 컨테이너 주소를 넣은 뒤 AppModule 을 불러옵니다. */
export async function startApp(
  overrides: Record<string, string> = {},
): Promise<TestApp> {
  const container = await new PostgreSqlContainer('postgres:15-alpine').start();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '0',
    TZ: 'UTC',
    DATABASE_URL: container.getConnectionUri(),
    DATABASE_SSL: 'false',
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_TTL_DAYS: '30',
    CORS_ORIGIN: 'http://localhost:5173',
    THROTTLE_PER_USER_PER_MINUTE: '100000',
    THROTTLE_CREATE_USER_PER_IP_PER_HOUR: '100000',
    LOG_LEVEL: 'silent',
    SWAGGER_ENABLED: 'false',
    STATIC_ROOT: './static',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    ...overrides,
  });
  // ConfigModule.forRoot 가 환경 변수를 읽는 시점이 import 시점이므로 여기서 불러옵니다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../../src/app.module') as {
    AppModule: Type<unknown>;
  };

  // 큐가 비면 실패(9999, 모든 드롭률보다 큼)를 돌려줍니다.
  const rng: number[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SETTLEMENT_RNG)
    .useValue(() => rng.shift() ?? 9999)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  const ds = app.get(DataSource);
  await ds.runMigrations();
  await runSeeds(ds);
  return { app, ds, container, rng };
}

export async function stopApp(testApp?: TestApp): Promise<void> {
  await testApp?.app.close();
  await testApp?.container.stop();
}

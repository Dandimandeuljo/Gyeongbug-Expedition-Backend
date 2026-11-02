import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { ENTITIES } from '../database/entities';
import { MIGRATIONS } from '../database/migrations';

export function buildDataSourceOptions(
  url: string,
  ssl: boolean,
  ca?: string,
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    // 연결 상대가 올바른 DB 인지 검증합니다. 사설 CA 면 DATABASE_SSL_CA 로 넘깁니다.
    ssl: ssl
      ? {
          rejectUnauthorized: true,
          ...(ca ? { ca: ca.replaceAll('\\n', '\n') } : {}),
        }
      : false,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
  };
}

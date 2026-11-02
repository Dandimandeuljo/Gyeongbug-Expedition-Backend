import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { ENTITIES } from '../database/entities';
import { MIGRATIONS } from '../database/migrations';

export function buildDataSourceOptions(
  url: string,
  ssl: boolean,
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
  };
}

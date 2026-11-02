import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { ENTITIES } from '../database/entities';
import { MIGRATIONS } from '../database/migrations';

/** pg 는 URL 의 SSL 옵션으로 ssl 설정을 덮어쓰므로 URL 에서 제거합니다. */
const URL_SSL_PARAMS = [
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslpassword',
  'sslaccept',
  'uselibpqcompat',
];
const SSL_REQUIRED_MODES = ['require', 'no-verify', 'verify-ca', 'verify-full'];

/**
 * TLS 는 DATABASE_SSL 하나로 정합니다. URL 과 뜻이 어긋나면 조용히 암호화를 끄거나
 * 검증을 풀지 않도록 기동을 막습니다.
 */
export function normalizeDatabaseUrl(url: string, ssl: boolean): string {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get('sslmode');
  const sslFlag = parsed.searchParams.get('ssl');
  const urlRequiresSsl =
    (mode !== null && SSL_REQUIRED_MODES.includes(mode)) ||
    sslFlag === 'true' ||
    sslFlag === '1';
  if (urlRequiresSsl && !ssl) {
    throw new Error(
      'DATABASE_URL 이 SSL 을 요구합니다. DATABASE_SSL=true 로 설정하세요.',
    );
  }
  if (mode === 'disable' && ssl) {
    throw new Error(
      'DATABASE_URL 의 sslmode=disable 과 DATABASE_SSL=true 가 충돌합니다.',
    );
  }
  for (const name of URL_SSL_PARAMS) {
    parsed.searchParams.delete(name);
  }
  return parsed.toString();
}

export function buildDataSourceOptions(
  url: string,
  ssl: boolean,
  ca?: string,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: normalizeDatabaseUrl(url, ssl),
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

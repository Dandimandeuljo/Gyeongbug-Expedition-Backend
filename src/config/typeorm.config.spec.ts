import { buildDataSourceOptions, normalizeDatabaseUrl } from './typeorm.config';

const URL = 'postgres://app:pw@db:5432/gbexp';

/** 실제 pg 드라이버가 받는 SSL 설정을 확인합니다. TypeORM 은 url 과 ssl 을 그대로 넘깁니다. */
function driverSsl(options: { url?: string; ssl?: unknown }): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg') as {
    Client: new (config: unknown) => {
      connectionParameters: { ssl: unknown };
    };
  };
  return new pg.Client({
    connectionString: options.url,
    ssl: options.ssl,
  }).connectionParameters.ssl;
}

describe('buildDataSourceOptions', () => {
  it('SSL 을 켜면 인증서를 검증한다', () => {
    const options = buildDataSourceOptions(URL, true);
    expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it('CA 를 주면 줄바꿈을 복원해 넘긴다', () => {
    const options = buildDataSourceOptions(URL, true, 'BEGIN\\nBODY\\nEND');
    expect(options).toMatchObject({
      ssl: { rejectUnauthorized: true, ca: 'BEGIN\nBODY\nEND' },
    });
  });

  it('SSL 을 끄면 ssl 옵션을 쓰지 않는다', () => {
    expect(buildDataSourceOptions(URL, false)).toMatchObject({ ssl: false });
  });

  it.each(['require', 'no-verify', 'verify-full'])(
    'URL 의 sslmode=%s 가 드라이버에서 검증과 CA 를 덮어쓰지 않는다',
    (mode) => {
      const options = buildDataSourceOptions(
        `${URL}?sslmode=${mode}`,
        true,
        'MY-CA',
      );
      expect(
        driverSsl(options as { url?: string; ssl?: unknown }),
      ).toMatchObject({
        rejectUnauthorized: true,
        ca: 'MY-CA',
      });
    },
  );
});

describe('normalizeDatabaseUrl', () => {
  it('SSL 옵션만 지우고 나머지는 유지한다', () => {
    expect(
      normalizeDatabaseUrl(
        `${URL}?sslmode=require&sslrootcert=a.pem&sslcert=b&sslkey=c&ssl=true&uselibpqcompat=true&application_name=gb`,
        true,
      ),
    ).toBe(`${URL}?application_name=gb`);
    expect(normalizeDatabaseUrl(URL, false)).toBe(URL);
  });

  it('비밀번호의 인코딩을 유지한다', () => {
    const url = 'postgres://app:p%40ss%2Fw@db:5432/gbexp';
    expect(normalizeDatabaseUrl(`${url}?sslmode=require`, true)).toBe(url);
  });

  it.each(['require', 'no-verify', 'verify-ca', 'verify-full'])(
    'sslmode=%s 인데 DATABASE_SSL 이 꺼져 있으면 암호화가 조용히 꺼지지 않게 거절한다',
    (mode) => {
      expect(() =>
        normalizeDatabaseUrl(`${URL}?sslmode=${mode}`, false),
      ).toThrow('DATABASE_SSL');
    },
  );

  it('ssl=true 인데 DATABASE_SSL 이 꺼져 있어도 거절한다', () => {
    expect(() => normalizeDatabaseUrl(`${URL}?ssl=true`, false)).toThrow(
      'DATABASE_SSL',
    );
  });

  it('sslmode=disable 인데 DATABASE_SSL 이 켜져 있으면 거절한다', () => {
    expect(() => normalizeDatabaseUrl(`${URL}?sslmode=disable`, true)).toThrow(
      'DATABASE_SSL',
    );
  });

  it('의미가 약한 prefer, allow 는 어느 쪽이든 지운다', () => {
    expect(normalizeDatabaseUrl(`${URL}?sslmode=prefer`, false)).toBe(URL);
    expect(normalizeDatabaseUrl(`${URL}?sslmode=allow`, true)).toBe(URL);
  });
});

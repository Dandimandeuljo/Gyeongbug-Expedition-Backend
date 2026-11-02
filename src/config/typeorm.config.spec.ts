import { buildDataSourceOptions } from './typeorm.config';

const URL = 'postgres://app:pw@db:5432/gbexp';

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
});

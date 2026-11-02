// .env.example 을 바탕으로 로컬 개발용 .env 를 만들고 비밀 값을 무작위로 채웁니다.
// 이미 있는 .env 는 덮어쓰지 않습니다.
const { randomBytes } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');

if (existsSync('.env')) {
  console.log('.env 가 이미 있어 그대로 둡니다.');
  process.exit(0);
}

const password = randomBytes(24).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');
const example = readFileSync('.env.example', 'utf8').replace(/\r\n/g, '\n');
const port = /^POSTGRES_PORT=(.*)$/m.exec(example)?.[1] || '5433';

const env = example
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${password}`)
  .replace(/^JWT_SECRET=$/m, `JWT_SECRET=${jwtSecret}`)
  .replace(
    /^DATABASE_URL=$/m,
    `DATABASE_URL=postgres://app:${password}@localhost:${port}/gbexp`,
  );

writeFileSync('.env', env);
console.log('.env 를 만들었습니다. 비밀 값은 이 컴퓨터에만 저장됩니다.');

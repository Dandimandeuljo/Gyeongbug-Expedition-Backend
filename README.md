# 경북 원정대 서버

경상북도 지역을 탐험하며 골드, 경험치, 특산물 조각을 모으는 방치형 웹 게임의 백엔드입니다. 로그인 없이 캐릭터를 만들면 체험을 시작할 수 있습니다.

API 명세, 게임 규칙 같은 기획 문서는 이 저장소에 없고 팀이 따로 보관합니다. 코드 주석의 `GAME_RULES`, `API`, `DATABASE`, `ARCHITECTURE` 는 그 문서를 가리킵니다.

| 구분 | 사용 기술 |
|---|---|
| 서버 | Node.js, TypeScript, NestJS 11 |
| 데이터베이스 | PostgreSQL 15, TypeORM 0.3 |
| 테스트 | Jest, Testcontainers |

## 1. 준비물

아래 두 가지를 먼저 설치합니다. 데이터베이스는 Docker 가 띄워 주므로 PostgreSQL 을 따로 설치할 필요가 없습니다.

| 프로그램 | 버전 | 확인 명령 |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22.22 이상 (24 LTS 권장) | `node --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 최신 | `docker --version` |

Docker Desktop 은 설치만으로는 부족합니다. **프로그램을 실행해 둔 상태**여야 다음 단계가 동작합니다.

## 2. 처음 실행하기

저장소를 내려받은 폴더의 터미널에서 순서대로 실행합니다. 한 번만 하면 되는 작업입니다.

**1) 패키지 설치**

```bash
npm ci
```

**2) 환경 변수 파일 만들기**

다음 명령이 `.env` 파일을 만들고 DB 비밀번호와 JWT 키를 무작위로 채웁니다. 값을 고칠 필요는 없습니다. 이 값은 내 컴퓨터에만 저장되고 저장소에는 올라가지 않습니다.

```bash
npm run setup:env
```

**3) 데이터베이스 실행**

PostgreSQL 컨테이너를 띄웁니다. 처음에는 이미지를 내려받느라 1~2분 걸릴 수 있습니다. `Healthy` 가 나오면 준비된 것입니다.

```bash
docker compose up -d --wait
```

**4) 테이블과 초기 데이터 만들기**

```bash
npm run migration:run
npm run seed
```

`migration:run` 은 테이블을 만들고, `seed` 는 지역, 특산물, 장비 강화표, 청송·안동의 퀴즈를 넣습니다. 끝에 `시드를 적용했습니다.` 가 나오면 성공입니다.

**5) 서버 실행**

```bash
npm run start:dev
```

`Nest application successfully started` 가 보이면 켜진 것입니다. 이 터미널은 켜 둡니다. 코드를 저장하면 서버가 자동으로 다시 시작합니다. 끌 때는 `Ctrl + C` 를 누릅니다.

**6) 동작 확인**

브라우저에서 다음 주소를 엽니다.

| 주소 | 확인할 내용 |
|---|---|
| <http://localhost:3000/health> | `{"status":"ok","config_version":"v1.1"}` 이 보이면 서버와 DB 가 정상입니다 |
| <http://localhost:3000/docs> | API 문서와 테스트 화면(Swagger)이 열립니다 |

## 3. 다음부터 실행할 때

컴퓨터를 다시 켠 뒤에는 Docker Desktop 을 실행하고 두 명령만 입력하면 됩니다.

```bash
docker compose up -d --wait
npm run start:dev
```

`git pull` 로 코드를 받은 뒤에는 서버를 켜기 전에 다음도 실행합니다. 패키지와 테이블이 바뀌었을 수 있습니다.

```bash
npm ci
npm run migration:run
npm run seed
```

작업을 마치고 데이터베이스를 끄려면 다음 명령을 실행합니다. 데이터는 남아 있습니다.

```bash
docker compose down
```

## 4. API 써 보기

코드를 작성하지 않아도 <http://localhost:3000/docs> 에서 직접 호출할 수 있습니다.

1. `POST /api/v1/user` 를 펼치고 **Try it out** 을 누릅니다.
2. 본문에 `{ "name": "테스트유저" }` 를 넣고 **Execute** 를 누릅니다. 이름은 2~10자의 한글, 영문, 숫자이며 다른 유저와 겹치면 안 됩니다.
3. 응답의 `jwt` 값을 복사합니다.
4. 화면 위쪽의 **Authorize** 를 누르고 복사한 값을 붙여 넣습니다. 이제 다른 API 를 호출할 수 있습니다.
5. `GET /api/v1/user` 로 내 캐릭터를 조회해 봅니다.

보상 수령처럼 상태를 바꾸는 API 에는 `Idempotency-Key` 칸이 있습니다. [UUID 생성기](https://www.uuidgenerator.net/version4)로 만든 값을 넣습니다. 방금 만든 캐릭터는 60초가 지나야 보상을 받을 수 있습니다.

### 프런트엔드에서 연동할 때 기억할 것

- **기본 주소:** `http://localhost:3000/api/v1`
- **CORS:** 기본으로 `http://localhost:5173` 만 허용합니다. 다른 포트로 개발한다면 `.env` 의 `CORS_ORIGIN` 에 주소를 쉼표로 추가하고 서버를 다시 시작합니다.
- **인증:** `POST /user` 응답의 `jwt` 를 보관했다가 `Authorization: Bearer <jwt>` 헤더로 보냅니다.
- **`401` 일 때만 토큰을 지웁니다.** `500`, `429`, 네트워크 실패는 일시적인 문제이므로 토큰을 유지합니다.
- **`Idempotency-Key`:** 보상 수령, 장비 강화, 지역 이동, 퀴즈 제출, 초기화에 필수입니다. 요청마다 UUID v4 를 새로 만들고, **같은 요청을 재시도할 때는 같은 값**을 보냅니다. 버튼을 두 번 눌러도 보상이 두 번 지급되지 않게 하는 장치입니다.
- **오류 처리:** 오류 본문은 `{ code, message, details }` 입니다. 화면 분기는 `message` 가 아니라 `code` 로 합니다.
- **시간:** 기기 시각이 아니라 응답의 `server_time` 을 기준으로 계산합니다.

자세한 내용은 함께 전달받은 `API.md` 와 `USER_FLOW.md` 를 봅니다.

## 5. 자주 쓰는 명령

| 명령 | 설명 |
|---|---|
| `npm run start:dev` | 개발 서버 실행. 코드를 저장하면 다시 시작합니다 |
| `npm run build` | 운영용 빌드. 결과는 `dist/` 에 생깁니다 |
| `npm run lint` | 코드 검사와 자동 수정 |
| `npm run test` | 단위 테스트. Docker 가 필요 없습니다 |
| `npm run test:integration` | API 통합 테스트. Docker Desktop 이 켜져 있어야 하며 개발 DB 는 건드리지 않습니다 |
| `npm run migration:run` | 아직 적용되지 않은 테이블 변경을 적용 |
| `npm run seed` | 초기 데이터 넣기. 여러 번 실행해도 안전합니다 |
| `docker compose up -d --wait` | 개발 DB 켜기 |
| `docker compose down` | 개발 DB 끄기. 데이터는 남습니다 |
| `docker compose down -v` | 개발 DB 끄고 **데이터까지 삭제** |

개발 DB 를 처음 상태로 되돌리려면 다음을 순서대로 실행합니다. 지금까지 만든 캐릭터가 모두 사라집니다.

```bash
docker compose down -v
docker compose up -d --wait
npm run migration:run
npm run seed
```

## 6. 문제가 생겼을 때

| 증상 | 원인과 해결 |
|---|---|
| `docker` 명령에서 `cannot connect`, `pipe` 오류 | Docker Desktop 이 꺼져 있습니다. 실행한 뒤 1분쯤 기다립니다 |
| `port is already allocated` (5433) | 다른 프로그램이 5433 을 쓰고 있습니다. `.env` 의 `POSTGRES_PORT` 와 `DATABASE_URL` 의 포트를 같은 값으로 바꿉니다 |
| `EADDRINUSE` (3000) | 서버가 이미 켜져 있거나 다른 프로그램이 3000 을 씁니다. `.env` 의 `PORT` 와 `PUBLIC_BASE_URL` 을 바꿉니다 |
| `Config validation error` | `.env` 가 없거나 값이 비어 있습니다. `.env` 를 지우고 `npm run setup:env` 를 다시 실행합니다 |
| `password authentication failed` | DB 를 만든 뒤 `.env` 의 비밀번호가 바뀌었습니다. 5절의 처음 상태로 되돌리기를 실행합니다 |
| `relation "users" does not exist` | 테이블이 없습니다. `npm run migration:run` 을 실행합니다 |
| 스키마 오류가 나거나 `migration:run` 이 실패 | 이전 버전으로 만든 DB 일 수 있습니다. 5절의 처음 상태로 되돌리기를 실행합니다 |
| 브라우저 콘솔의 CORS 오류 | 프런트엔드 주소가 허용 목록에 없습니다. `.env` 의 `CORS_ORIGIN` 에 추가하고 서버를 다시 시작합니다 |
| `POST /quiz/today` 가 `QUIZ_NOT_AVAILABLE` | 시드를 넣지 않았거나 현재 지역에 문항이 없습니다. `npm run seed` 를 실행합니다 |
| `POST /user` 가 `429` | 개발 중 캐릭터를 시간당 10개 넘게 만들었습니다. `.env` 의 `THROTTLE_CREATE_USER_PER_IP_PER_HOUR` 를 늘리고 서버를 다시 시작합니다 |
| 통합 테스트가 시작 전에 실패 | Docker Desktop 이 꺼져 있습니다 |

## 7. 코드 구조

```
src/
├── main.ts                 서버 시작점
├── app.module.ts           전체 모듈 조립, 환경 변수 검증
├── app.setup.ts            CORS, 입력 검증, 오류 처리, Swagger 설정
├── common/                 오류 코드, 데코레이터, 공통 함수, Swagger 정의
├── config/                 DB 연결 설정
├── database/
│   ├── entities/           테이블 정의
│   ├── migrations/         테이블 변경 이력
│   └── seeds/              초기 데이터와 퀴즈 문항
└── modules/                기능별 코드
    ├── settlement/         보상 계산 (게임 수치와 공식은 여기에만 있습니다)
    ├── operation/          중복 요청 방지 (Idempotency-Key)
    ├── auth/               캐릭터 생성, JWT, 속도 제한
    ├── user/               유저 조회
    ├── idle-reward/        방치 보상
    ├── equipment/          장비 강화
    ├── region/             지역 조회와 이동
    ├── quiz/               오늘의 퀴즈
    ├── codex/              특산물 도감
    ├── product/            지역 상품
    └── progress/           체험 기록 초기화
test/                       통합 테스트
static/                     이미지 파일 (/static 주소로 제공)
```

기능을 고칠 때는 `modules/` 의 해당 폴더에서 `*.controller.ts` 부터 보면 요청이 어떻게 처리되는지 따라갈 수 있습니다.

## 8. 비밀 값 관리

- `.env` 는 커밋하지 않습니다. `.gitignore` 에 들어 있습니다.
- `.env.example` 에는 변수 이름과 비밀이 아닌 기본값만 적습니다. 비밀번호, 키, 토큰은 임시 값이라도 적지 않습니다.
- 비밀 값을 팀원에게 전달할 일이 생기면 저장소나 메신저 대신 비밀 공유 도구를 씁니다.

## 9. 배포

`Dockerfile` 로 운영 이미지를 만듭니다. 운영 값은 호스팅의 환경 변수나 비밀 저장소에 넣고 저장소에는 올리지 않습니다. `JWT_SECRET`, DB 접속 정보, `CORS_ORIGIN`, `PUBLIC_BASE_URL` 을 운영용으로 넣고 `NODE_ENV=production`, `SWAGGER_ENABLED=false` 로 둡니다.

```bash
docker build -t gyeongbug-server .
docker run --rm --env-file .env gyeongbug-server npm run -s migration:run:prod
docker run --rm --env-file .env gyeongbug-server npm run -s seed:prod
docker run -d -p 3000:3000 --env-file .env gyeongbug-server
```

- DB 가 SSL 을 쓰면 `DATABASE_SSL=true` 로 둡니다. 사설 인증서라면 `DATABASE_SSL_CA` 도 넣습니다. `DATABASE_URL` 에 `sslmode=require` 가 있는데 `DATABASE_SSL=false` 면 서버가 뜨지 않습니다.
- 프록시 뒤에 배포하면 `TRUST_PROXY_HOPS` 를 프록시 단계 수로 설정합니다.

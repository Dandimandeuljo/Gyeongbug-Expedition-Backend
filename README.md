# 경북 원정대 서버

NestJS 11, TypeORM 0.3, PostgreSQL 15, Node.js 22.22 이상입니다. API 명세, 게임 규칙, 인수인계 같은 기획 문서는 이 저장소에 넣지 않고 팀이 별도로 보관합니다. 코드 주석의 `GAME_RULES`, `API`, `DATABASE`, `ARCHITECTURE` 는 그 문서를 가리킵니다.

## 실행

```powershell
npm ci
Copy-Item .env.example .env   # 값을 채웁니다. POSTGRES_PASSWORD 는 DATABASE_URL 의 비밀번호와 같아야 합니다
docker compose up -d --wait   # 개발 DB, 호스트 포트 5433
npm run migration:run
npm run seed
npm run start:dev
```

API 는 `/api/v1` 아래에 있고 `/health` 만 예외입니다. `SWAGGER_ENABLED=true` 면 `/docs` 를 엽니다.

## 검증

```powershell
npm run lint
npm run test               # 단위 테스트
npm run test:integration   # Docker 필요. 자체 PostgreSQL 컨테이너 사용
npm run build
```

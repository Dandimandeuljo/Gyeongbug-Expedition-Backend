import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { resolve } from 'node:path';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { createValidationPipe } from './common/validation/validation.pipe';

/** main.ts 와 통합 테스트가 같은 구성을 쓰도록 모았습니다. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));
  // 프록시 뒤에서는 실제 접속 IP 로 POST /user 를 제한하도록 신뢰할 단계 수를 지정합니다.
  app.set('trust proxy', config.get<number>('TRUST_PROXY_HOPS') ?? 0);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim()),
    exposedHeaders: ['Idempotent-Replayed'],
  });
  app.useStaticAssets(resolve(config.getOrThrow<string>('STATIC_ROOT')), {
    prefix: '/static',
  });
  if (String(config.get('SWAGGER_ENABLED')) === 'true') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('경북 원정대 API').addBearerAuth().build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}

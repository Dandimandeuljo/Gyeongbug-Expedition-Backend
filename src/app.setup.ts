import { RequestMethod, ValidationError, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { resolve } from 'node:path';
import { ErrorCode } from './common/errors/error-code.enum';
import { GameError } from './common/errors/game-error';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';

function validationError(errors: ValidationError[]): GameError {
  let current = errors[0];
  let field = current?.property ?? 'body';
  while (current?.children?.length) {
    current = current.children[0];
    field = `${field}.${current.property}`;
  }
  const reason = Object.values(current?.constraints ?? {})[0] ?? 'INVALID';
  return new GameError(ErrorCode.VALIDATION_ERROR, { field, reason });
}

/** main.ts 와 통합 테스트가 같은 구성을 쓰도록 모았습니다. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      validationError: { target: false, value: false },
      exceptionFactory: validationError,
    }),
  );
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

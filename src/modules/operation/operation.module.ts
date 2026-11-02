import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { OperationService } from './operation.service';
import { OperationController } from './operation.controller';

@Global()
@Module({
  controllers: [OperationController],
  providers: [
    OperationService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: [OperationService],
})
export class OperationModule {}

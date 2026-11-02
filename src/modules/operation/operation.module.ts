import { Controller, Get, Global, Module, Param } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { OperationService } from './operation.service';

@Controller('operations')
export class OperationController {
  constructor(private readonly operations: OperationService) {}

  @ApiEndpoint(DOCS.getOperation)
  @Get(':key')
  find(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.operations.view(key, user.id);
  }
}

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

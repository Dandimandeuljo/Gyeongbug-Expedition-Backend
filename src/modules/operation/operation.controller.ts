import { Controller, Get, Param } from '@nestjs/common';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
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

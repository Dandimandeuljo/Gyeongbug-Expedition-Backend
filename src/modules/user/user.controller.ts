import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  @ApiEndpoint(DOCS.getUser)
  @Get()
  find(@CurrentUser() user: AuthUser) {
    return this.users.view(user.id);
  }
}

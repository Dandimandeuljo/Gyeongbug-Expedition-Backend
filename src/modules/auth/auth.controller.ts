import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  CreateUserThrottle,
  CurrentUser,
  Public,
} from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthService } from './auth.service';

@Controller('user')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiEndpoint(DOCS.createUser)
  @Public()
  @CreateUserThrottle()
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.auth.createUser(body.name);
  }

  @ApiEndpoint(DOCS.refreshToken)
  @Post('refresh')
  @HttpCode(200)
  refresh(@CurrentUser() user: AuthUser) {
    return this.auth.refresh(user.id);
  }
}

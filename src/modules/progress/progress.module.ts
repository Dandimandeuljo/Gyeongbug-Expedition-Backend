import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser, Idempotent, OperationCtx } from '../../common/decorators';
import type { AuthUser, OperationContext } from '../../common/decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { dbNow } from '../../common/time/db-clock';
import { User } from '../../database/entities';
import { OperationService } from '../operation/operation.service';

export class ResetProgressDto {
  @IsString()
  confirmation!: string;
}

const RESET_CONFIRMATION = 'RESET';

@Controller('progress')
export class ProgressController {
  constructor(private readonly operations: OperationService) {}

  @Post('reset')
  @HttpCode(200)
  @Idempotent()
  reset(
    @CurrentUser() auth: AuthUser,
    @OperationCtx() operation: OperationContext,
    @Body() body: ResetProgressDto,
  ) {
    if (body.confirmation !== RESET_CONFIRMATION) {
      throw new GameError(ErrorCode.CONFIRMATION_MISMATCH);
    }
    return this.operations.execute(
      operation,
      async (manager) => {
        const now = await dbNow(manager);
        // 하위 행은 ON DELETE CASCADE 로 함께 삭제됩니다.
        await manager.delete(User, { id: auth.id });
        return { deleted: true, deleted_at: now };
      },
      { deletesUser: true },
    );
  }
}

@Module({ controllers: [ProgressController] })
export class ProgressModule {}

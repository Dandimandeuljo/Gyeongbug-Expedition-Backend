import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser, Idempotent, OperationCtx } from '../../common/decorators';
import type { AuthUser, OperationContext } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { progressView } from '../../common/views';
import { OperationService } from '../operation/operation.service';
import {
  CLAIM_MIN_SECONDS,
  IDLE_CAP_SECONDS,
} from '../settlement/game-rules.constants';
import { SettlementService } from '../settlement/settlement.service';

@Controller('idle-reward')
export class IdleRewardController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settlement: SettlementService,
    private readonly operations: OperationService,
  ) {}

  @ApiEndpoint(DOCS.previewIdleReward)
  @Get()
  async preview(@CurrentUser() user: AuthUser) {
    const { now, result, rawElapsed } = await this.settlement.preview(
      this.dataSource.manager,
      user.id,
    );
    return {
      elapsed_seconds: result.elapsedSeconds,
      cap_seconds: IDLE_CAP_SECONDS,
      capped: result.capped,
      claimable: rawElapsed >= CLAIM_MIN_SECONDS,
      seconds_until_claimable: Math.max(
        0,
        CLAIM_MIN_SECONDS - Math.max(0, rawElapsed),
      ),
      gold: result.goldGain,
      exp: result.expGain,
      level_after: result.newLevel,
      piece_judgments: result.judgments,
      server_time: now,
    };
  }

  @ApiEndpoint(DOCS.claimIdleReward)
  @Post()
  @HttpCode(200)
  @Idempotent()
  claim(
    @CurrentUser() user: AuthUser,
    @OperationCtx() operation: OperationContext,
  ) {
    return this.operations.execute(operation, async (manager) => {
      const settled = await this.settlement.settle(manager, user.id, {
        enforceClaimMinimum: true,
      });
      return {
        ...progressView(settled.user),
        gained: settled.settled,
        leveled_up: settled.result.leveledUp,
        previous_level: settled.result.previousLevel,
        state_version: settled.user.stateVersion,
        settled_at: settled.now,
      };
    });
  }
}

@Module({ controllers: [IdleRewardController] })
export class IdleRewardModule {}

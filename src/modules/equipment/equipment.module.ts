import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser, Idempotent, OperationCtx } from '../../common/decorators';
import type { AuthUser, OperationContext } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { progressView } from '../../common/views';
import { Equipment } from '../../database/entities';
import { OperationService } from '../operation/operation.service';
import { SettlementService } from '../settlement/settlement.service';
import { equipmentView } from '../user/user.module';

@Controller('equipment')
export class EquipmentController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settlement: SettlementService,
    private readonly operations: OperationService,
  ) {}

  @ApiEndpoint(DOCS.getEquipment)
  @Get()
  async find(@CurrentUser() user: AuthUser) {
    const manager = this.dataSource.manager;
    const { state, result } = await this.settlement.preview(manager, user.id);
    const { equipment, statRatio } = state;
    const next = await this.settlement.nextUpgrade(manager, equipment);
    const isMax = equipment.curUpgrade >= equipment.maxUpgrade || !next;
    let blockedBy: 'MAX_STAGE' | 'LEVEL' | 'GOLD' | null = null;
    if (isMax) {
      blockedBy = 'MAX_STAGE';
    } else if (result.newLevel < next.requiredLevel) {
      blockedBy = 'LEVEL';
    } else if (result.newGold < next.cost) {
      blockedBy = 'GOLD';
    }
    return {
      stage: equipment.curUpgrade,
      gold_bonus_percent: statRatio * (equipment.curUpgrade - 1),
      max_stage: equipment.maxUpgrade,
      is_max: isMax,
      next: isMax
        ? null
        : {
            stage: next.upgrade,
            gold_bonus_percent: statRatio * (next.upgrade - 1),
            upgrade_cost: next.cost,
            required_level: next.requiredLevel,
          },
      gold: state.user.gold,
      gold_after_settle: result.newGold,
      level_after_settle: result.newLevel,
      can_upgrade: blockedBy === null,
      blocked_by: blockedBy,
    };
  }

  @ApiEndpoint(DOCS.upgradeEquipment)
  @Post('upgrade')
  @HttpCode(200)
  @Idempotent()
  upgrade(
    @CurrentUser() user: AuthUser,
    @OperationCtx() operation: OperationContext,
  ) {
    return this.operations.execute(operation, async (manager) => {
      const current = await manager.findOneByOrFail(Equipment, {
        userId: user.id,
      });
      if (current.curUpgrade >= current.maxUpgrade) {
        throw new GameError(ErrorCode.EQUIPMENT_MAX_STAGE, {
          stage: current.curUpgrade,
        });
      }

      // 이전 효율로 먼저 정산하고 갱신된 레벨·골드로 검사합니다. 실패하면 정산까지 롤백됩니다.
      const settled = await this.settlement.settle(manager, user.id);
      const { user: player, equipment, statRatio } = settled;
      const next = await this.settlement.nextUpgrade(manager, equipment);
      if (!next) {
        throw new GameError(ErrorCode.EQUIPMENT_MAX_STAGE, {
          stage: equipment.curUpgrade,
        });
      }
      if (player.level < next.requiredLevel) {
        throw new GameError(ErrorCode.EQUIPMENT_LEVEL_REQUIRED, {
          required_level: next.requiredLevel,
          current_level: player.level,
        });
      }
      if (player.gold < next.cost) {
        throw new GameError(ErrorCode.INSUFFICIENT_GOLD, {
          required: next.cost,
          current: player.gold,
        });
      }

      player.gold -= next.cost;
      equipment.curUpgrade += 1;
      await manager.save(player);
      await manager.save(equipment);

      const after = await this.settlement.nextUpgrade(manager, equipment);
      return {
        ...progressView(player),
        equipment: equipmentView(equipment, statRatio, after),
        cost: next.cost,
        settled: settled.settled,
        state_version: player.stateVersion,
        settled_at: settled.now,
      };
    });
  }
}

@Module({ controllers: [EquipmentController] })
export class EquipmentModule {}

import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { dbNow } from '../../common/time/db-clock';
import { progressView, regionRef } from '../../common/views';
import { CLAIM_MIN_SECONDS } from '../settlement/game-rules.constants';
import { levelGoldBonusPercent } from '../settlement/level';
import { SettlementService } from '../settlement/settlement.service';
import type { Equipment, EquipmentUpgrade } from '../../database/entities';

export function equipmentView(
  equipment: Equipment,
  statRatio: number,
  next: EquipmentUpgrade | null,
) {
  return {
    stage: equipment.curUpgrade,
    gold_bonus_percent: statRatio * (equipment.curUpgrade - 1),
    next_upgrade_cost: next?.cost ?? null,
    next_required_level: next?.requiredLevel ?? null,
  };
}

@Injectable()
export class UserService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settlement: SettlementService,
  ) {}

  async view(userId: number) {
    const manager = this.dataSource.manager;
    const state = await this.settlement.loadState(manager, userId, false);
    const next = await this.settlement.nextUpgrade(manager, state.equipment);
    const now = await dbNow(manager);
    const equipment = equipmentView(state.equipment, state.statRatio, next);
    const levelBonus = levelGoldBonusPercent(state.user.level);
    return {
      id: state.user.id,
      name: state.user.name,
      ...progressView(state.user),
      level_gold_bonus_percent: levelBonus,
      equipment,
      total_gold_bonus_percent: levelBonus + equipment.gold_bonus_percent,
      cur_region: regionRef(state.region),
      last_settled_at: state.idle.recentReceive,
      claimable_at: new Date(
        state.idle.recentReceive.getTime() + CLAIM_MIN_SECONDS * 1000,
      ),
      state_version: state.user.stateVersion,
      server_time: now,
    };
  }
}

@Controller('user')
export class UserController {
  constructor(private readonly users: UserService) {}

  @ApiEndpoint(DOCS.getUser)
  @Get()
  find(@CurrentUser() user: AuthUser) {
    return this.users.view(user.id);
  }
}

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

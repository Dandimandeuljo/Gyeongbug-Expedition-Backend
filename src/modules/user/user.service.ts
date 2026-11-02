import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { dbNow } from '../../common/time/db-clock';
import { progressView, regionRef } from '../../common/views';
import { CLAIM_MIN_SECONDS } from '../settlement/game-rules.constants';
import { levelGoldBonusPercent } from '../settlement/level';
import { SettlementService } from '../settlement/settlement.service';
import { equipmentView } from './user.view';

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

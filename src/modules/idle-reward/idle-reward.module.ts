import { Module } from '@nestjs/common';
import { IdleRewardController } from './idle-reward.controller';

@Module({ controllers: [IdleRewardController] })
export class IdleRewardModule {}

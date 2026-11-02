import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';
import { CONFIG_VERSION } from './modules/settlement/game-rules.constants';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async health() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', config_version: CONFIG_VERSION };
  }
}

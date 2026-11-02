import { Module } from '@nestjs/common';
import { RegionController } from './region.controller';

@Module({ controllers: [RegionController] })
export class RegionModule {}

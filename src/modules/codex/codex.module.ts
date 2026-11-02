import { Module } from '@nestjs/common';
import { CodexController } from './codex.controller';

@Module({ controllers: [CodexController] })
export class CodexModule {}

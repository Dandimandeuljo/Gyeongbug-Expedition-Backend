import { Module } from '@nestjs/common';
import { AiWriterService } from './ai-writer.service';
import { ChatController } from './chat.controller';
import { PriceCollectorService } from './price-collector.service';

@Module({
  controllers: [ChatController],
  providers: [AiWriterService, PriceCollectorService],
})
export class ChatModule {}

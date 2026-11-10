import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { Region, RegionProduct, SpecialtyPrice } from '../../database/entities';
import { AiWriterService } from './ai-writer.service';
import {
  buildFacts,
  canRewrite,
  ContentFact,
  parseChatMessage,
  PriceFact,
  renderTemplate,
  replyContext,
} from './chat-answer';
import { CATALOG, CatalogItem } from './chat.catalog';
import { buildKnowledge, isGroundedAnswer } from './chat.knowledge';
import { fixedReply, fixedTopic } from './chat.replies';
import { ChatMessageDto } from './dto/chat-message.dto';

function recommendationView(item: CatalogItem | null | undefined) {
  return item
    ? {
        specialty_id: item.id,
        name: item.name,
        region: item.region,
        product: item.shop ? { title: item.shop.title } : null,
      }
    : null;
}

function priceViews(prices: PriceFact[]) {
  return prices.map((price) => ({
    kind: price.kind,
    area: price.area,
    label: price.label,
    unit: price.unit,
    price: price.price,
    year_ago_price: price.yearAgoPrice,
    survey_date: price.surveyDate,
  }));
}

@Controller('chat')
export class ChatController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly writer: AiWriterService,
  ) {}

  @ApiEndpoint(DOCS.sendChat)
  @Post()
  @HttpCode(200)
  async send(@CurrentUser() auth: AuthUser, @Body() body: ChatMessageDto) {
    const intent = parseChatMessage(body.message);
    const topic = fixedTopic(body.message, replyContext(intent));
    const fixedResponse = (reply: string) => ({
      reply,
      source: 'TEMPLATE',
      recommendation: null,
      prices: [],
    });
    if (topic === 'QUIZ_ANSWER') {
      return fixedResponse(fixedReply(topic));
    }

    const prices: PriceFact[] = await this.dataSource.manager.find(
      SpecialtyPrice,
      { order: { id: 'ASC' } },
    );
    const contents = await this.loadContents();
    const facts = buildFacts(intent, prices, contents);
    const knowledge = buildKnowledge(prices, contents);
    const answered = await this.writer.answer(
      auth.id,
      body.message,
      knowledge,
      (answer) =>
        isGroundedAnswer(answer, {
          knowledge,
          message: body.message,
          budget: intent.budget,
          prices,
        }),
    );
    if (answered) {
      return {
        reply: answered.reply,
        source: 'AI',
        recommendation: recommendationView(
          CATALOG.find((item) => item.name === answered.specialty),
        ),
        prices: priceViews(facts.prices),
      };
    }

    // AI 를 쓸 수 없거나 답변이 검사에 걸리면 정해진 답변으로 대체합니다.
    if (topic) {
      return fixedResponse(fixedReply(topic));
    }
    const template = renderTemplate(facts);
    const written = canRewrite(facts)
      ? await this.writer.write(auth.id, body.message, facts, template)
      : null;
    return {
      reply: written ?? template,
      source: written ? 'AI' : 'TEMPLATE',
      recommendation: recommendationView(facts.item),
      prices: priceViews(facts.prices),
    };
  }

  private async loadContents(): Promise<ContentFact[]> {
    const { manager } = this.dataSource;
    const [products, regions] = await Promise.all([
      manager.find(RegionProduct),
      manager.find(Region),
    ]);
    return products.map((product) => ({
      id: product.id,
      description: product.description,
      regionDescription:
        regions.find((region) => region.id === product.regionId)?.description ??
        null,
    }));
  }
}

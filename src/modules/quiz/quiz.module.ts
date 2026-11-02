import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { CurrentUser, Idempotent, OperationCtx } from '../../common/decorators';
import type { AuthUser, OperationContext } from '../../common/decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { kstToday } from '../../common/time/db-clock';
import { progressView, regionRef } from '../../common/views';
import {
  Region,
  RegionQuiz,
  TodayRegionQuiz,
  User,
} from '../../database/entities';
import { OperationService } from '../operation/operation.service';
import {
  QUIZ_QUESTIONS_PER_SET,
  QUIZ_REWARD_EXP,
  QUIZ_REWARD_GOLD,
} from '../settlement/game-rules.constants';
import { levelFor } from '../settlement/level';
import { SettlementService } from '../settlement/settlement.service';

export class QuizAnswerDto {
  @IsInt()
  @Min(1)
  @Max(QUIZ_QUESTIONS_PER_SET)
  order_no!: number;

  @IsInt()
  @Min(0)
  @Max(3)
  selected_index!: number;
}

export class SubmitQuizDto {
  @IsInt()
  set_id!: number;

  @IsArray()
  @ArrayMinSize(QUIZ_QUESTIONS_PER_SET)
  @ArrayMaxSize(QUIZ_QUESTIONS_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

/** 유저당 하루 한 세트이므로 날짜가 곧 세트 식별자입니다 (API 2-10). */
function setIdOf(date: string): number {
  return Number(date.replaceAll('-', ''));
}

function dateOf(setId: number): string | null {
  const text = String(setId);
  return /^\d{8}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
    : null;
}

@Controller('quiz')
export class QuizController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settlement: SettlementService,
    private readonly operations: OperationService,
  ) {}

  @Post('today')
  @HttpCode(200)
  async issue(@CurrentUser() user: AuthUser) {
    const manager = this.dataSource.manager;
    const today = await kstToday(manager);
    const existing = await this.loadRows(manager, user.id, today);
    if (existing.length > 0) {
      return { created: false, set: await this.setView(manager, existing) };
    }

    const player = await manager.findOneByOrFail(User, { id: user.id });
    const picked: { id: number }[] = await manager.query(
      `SELECT id FROM region_quiz WHERE region_id = $1 AND is_active ORDER BY random() LIMIT $2`,
      [player.curRegionId, QUIZ_QUESTIONS_PER_SET],
    );
    if (picked.length < QUIZ_QUESTIONS_PER_SET) {
      throw new GameError(ErrorCode.QUIZ_NOT_AVAILABLE, {
        region_id: player.curRegionId,
      });
    }

    let created = true;
    try {
      await this.dataSource.transaction(async (tx) => {
        await tx.insert(
          TodayRegionQuiz,
          picked.map((quiz, index) => ({
            userId: user.id,
            date: today,
            orderNo: index + 1,
            quizId: quiz.id,
          })),
        );
      });
    } catch (error) {
      // 동시 발급으로 PK 가 충돌하면 먼저 만들어진 세트를 돌려줍니다.
      const code = (error as QueryFailedError<Error & { code?: string }>)
        .driverError?.code;
      if (!(error instanceof QueryFailedError) || code !== '23505') {
        throw error;
      }
      created = false;
    }
    const rows = await this.loadRows(manager, user.id, today);
    return { created, set: await this.setView(manager, rows) };
  }

  @Get('today')
  async today(@CurrentUser() user: AuthUser) {
    const manager = this.dataSource.manager;
    const rows = await this.loadRows(manager, user.id, await kstToday(manager));
    if (rows.length === 0) {
      throw new GameError(ErrorCode.QUIZ_SET_NOT_ISSUED);
    }
    return this.setView(manager, rows);
  }

  @Post('submit')
  @HttpCode(200)
  @Idempotent()
  submit(
    @CurrentUser() auth: AuthUser,
    @OperationCtx() operation: OperationContext,
    @Body() body: SubmitQuizDto,
  ) {
    const orders = new Set(body.answers.map((answer) => answer.order_no));
    if (orders.size !== QUIZ_QUESTIONS_PER_SET) {
      throw new GameError(ErrorCode.VALIDATION_ERROR, {
        field: 'answers',
        reason: 'ORDER_NO',
      });
    }

    return this.operations.execute(operation, async (manager) => {
      const date = dateOf(body.set_id);
      const rows = date
        ? await manager.find(TodayRegionQuiz, {
            where: { userId: auth.id, date },
            order: { orderNo: 'ASC' },
            lock: { mode: 'pessimistic_write' },
          })
        : [];
      if (rows.length === 0) {
        throw new GameError(ErrorCode.QUIZ_SET_NOT_FOUND);
      }
      if (rows.some((row) => row.submittedAt)) {
        throw new GameError(ErrorCode.QUIZ_ALREADY_SUBMITTED);
      }
      if (date !== (await kstToday(manager))) {
        throw new GameError(ErrorCode.QUIZ_SET_EXPIRED, { quiz_date: date });
      }

      // 미정산 보상을 기존 레벨·지역으로 먼저 정산하고 퀴즈 보상을 더합니다 (GAME_RULES 6절).
      const settled = await this.settlement.settle(manager, auth.id);
      const quizzes = await manager.findBy(RegionQuiz, {
        id: In(rows.map((row) => row.quizId)),
      });
      for (const row of rows) {
        const answer = body.answers.find((a) => a.order_no === row.orderNo);
        const quiz = quizzes.find((q) => q.id === row.quizId);
        row.selectedIndex = answer?.selected_index ?? null;
        row.rightAnswer = row.selectedIndex === quiz?.answerIndex;
        row.submittedAt = settled.now;
      }
      await manager.save(rows);

      const player = settled.user;
      player.gold += QUIZ_REWARD_GOLD;
      player.exp += QUIZ_REWARD_EXP;
      player.level = levelFor(player.exp);
      await manager.save(player);

      return {
        set: await this.setView(manager, rows),
        ...progressView(player),
        settled: settled.settled,
        leveled_up: player.level > settled.result.previousLevel,
        state_version: player.stateVersion,
      };
    });
  }

  private loadRows(
    manager: EntityManager,
    userId: number,
    date: string,
  ): Promise<TodayRegionQuiz[]> {
    return manager.find(TodayRegionQuiz, {
      where: { userId, date },
      order: { orderNo: 'ASC' },
    });
  }

  /** 정답과 해설은 제출 전까지 어떤 응답에도 넣지 않습니다. */
  private async setView(manager: EntityManager, rows: TodayRegionQuiz[]) {
    const quizzes = await manager.findBy(RegionQuiz, {
      id: In(rows.map((row) => row.quizId)),
    });
    const quizOf = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
    const region = await manager.findOneByOrFail(Region, {
      id: quizzes[0].regionId,
    });
    const submittedAt = rows[0].submittedAt;
    return {
      set_id: setIdOf(rows[0].date),
      quiz_date: rows[0].date,
      region: regionRef(region),
      status: submittedAt ? 'SUBMITTED' : 'ISSUED',
      questions: rows.map((row) => {
        const quiz = quizOf.get(row.quizId);
        return {
          order_no: row.orderNo,
          question_id: row.quizId,
          question: quiz?.content,
          choices: quiz?.choices,
          selected_index: row.selectedIndex,
        };
      }),
      result: submittedAt
        ? {
            correct_count: rows.filter((row) => row.rightAnswer).length,
            total: rows.length,
            rewarded: { gold: QUIZ_REWARD_GOLD, exp: QUIZ_REWARD_EXP },
            answers: rows.map((row) => {
              const quiz = quizOf.get(row.quizId);
              return {
                order_no: row.orderNo,
                selected_index: row.selectedIndex,
                answer_index: quiz?.answerIndex,
                is_correct: row.rightAnswer,
                explanation: quiz?.explanation,
              };
            }),
            submitted_at: submittedAt,
          }
        : null,
    };
  }
}

@Module({ controllers: [QuizController] })
export class QuizModule {}

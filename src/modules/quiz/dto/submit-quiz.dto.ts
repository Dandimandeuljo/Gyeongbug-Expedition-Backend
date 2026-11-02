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
import { QUIZ_QUESTIONS_PER_SET } from '../../settlement/game-rules.constants';

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

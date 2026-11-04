import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsObject,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { REQUIRED_INPUT_MESSAGE } from '../../../common/validation/validation.pipe';
import { QUIZ_QUESTIONS_PER_SET } from '../../settlement/game-rules.constants';

export class QuizAnswerDto {
  @IsDefined({ message: REQUIRED_INPUT_MESSAGE })
  @IsInt()
  @Min(1)
  @Max(QUIZ_QUESTIONS_PER_SET)
  order_no!: number;

  @IsDefined({ message: REQUIRED_INPUT_MESSAGE })
  @IsInt()
  @Min(0)
  @Max(3)
  selected_index!: number;
}

export class SubmitQuizDto {
  @IsDefined({ message: REQUIRED_INPUT_MESSAGE })
  @IsInt()
  set_id!: number;

  @IsDefined({ message: REQUIRED_INPUT_MESSAGE })
  @IsArray()
  @IsObject({ each: true, message: '각 답안은 객체여야 합니다.' })
  @ArrayMinSize(QUIZ_QUESTIONS_PER_SET)
  @ArrayMaxSize(QUIZ_QUESTIONS_PER_SET)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

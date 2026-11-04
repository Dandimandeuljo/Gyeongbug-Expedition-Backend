import { IsDefined, IsInt, Max, Min } from 'class-validator';
import { MAX_INT32 } from '../../../common/limits';
import { REQUIRED_INPUT_MESSAGE } from '../../../common/validation/validation.pipe';

export class MoveRegionDto {
  @IsDefined({ message: REQUIRED_INPUT_MESSAGE })
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  target_region_id!: number;
}

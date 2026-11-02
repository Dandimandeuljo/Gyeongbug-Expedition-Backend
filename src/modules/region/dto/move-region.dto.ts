import { IsInt, Max, Min } from 'class-validator';
import { MAX_INT32 } from '../../../common/limits';

export class MoveRegionDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  target_region_id!: number;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_INT32 } from '../../../common/limits';
import { IncludeInactiveQueryDto } from '../../../common/validation/include-inactive-query.dto';

export class CodexQueryDto extends IncludeInactiveQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  region_id?: number;
}

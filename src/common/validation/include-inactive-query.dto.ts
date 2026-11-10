import { IsIn, IsOptional } from 'class-validator';

/** 쿼리 문자열 "false" 가 true 로 변환되지 않도록 문자열 그대로 검사합니다. */
export class IncludeInactiveQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: 'true 또는 false 만 입력할 수 있습니다.',
  })
  include_inactive?: string;
}

export function includesInactive(query: IncludeInactiveQueryDto): boolean {
  return query.include_inactive === 'true';
}

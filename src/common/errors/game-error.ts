import { HttpException } from '@nestjs/common';
import { ERROR_HTTP_STATUS, ErrorCode } from './error-code.enum';

export interface GameErrorBody {
  code: ErrorCode;
  message: string;
  details: Record<string, unknown> | null;
}

const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  [ErrorCode.VALIDATION_ERROR]: '요청 형식이나 입력값이 올바르지 않습니다.',
  [ErrorCode.IDEMPOTENCY_KEY_REQUIRED]: '올바른 요청 키가 필요합니다.',
  [ErrorCode.CONFIRMATION_MISMATCH]: '초기화 확인 문구가 일치하지 않습니다.',
  [ErrorCode.UNAUTHORIZED]: '유효한 인증 정보가 필요합니다.',
  [ErrorCode.REGION_NOT_FOUND]: '이용할 수 있는 지역을 찾을 수 없습니다.',
  [ErrorCode.SPECIALTY_NOT_FOUND]: '이용할 수 있는 특산물을 찾을 수 없습니다.',
  [ErrorCode.PRODUCT_NOT_FOUND]: '상품을 찾을 수 없습니다.',
  [ErrorCode.QUIZ_SET_NOT_FOUND]: '내 퀴즈 세트를 찾을 수 없습니다.',
  [ErrorCode.QUIZ_SET_NOT_ISSUED]: '오늘의 퀴즈 세트를 먼저 발급받아 주세요.',
  [ErrorCode.QUIZ_NOT_AVAILABLE]: '현재 지역의 퀴즈 문항이 부족합니다.',
  [ErrorCode.OPERATION_NOT_FOUND]: '보관된 요청 결과를 찾을 수 없습니다.',
  [ErrorCode.ROUTE_NOT_FOUND]: '요청한 경로를 찾을 수 없습니다.',
  [ErrorCode.NAME_DUPLICATED]: '이미 사용 중인 이름입니다.',
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: '이미 다른 요청에 사용된 요청 키입니다.',
  [ErrorCode.CLAIM_TOO_EARLY]: '아직 보상을 수령할 수 없습니다.',
  [ErrorCode.EQUIPMENT_MAX_STAGE]: '이미 최고 단계의 장비입니다.',
  [ErrorCode.EQUIPMENT_LEVEL_REQUIRED]: '장비 강화에 필요한 레벨이 부족합니다.',
  [ErrorCode.INSUFFICIENT_GOLD]: '골드가 부족합니다.',
  [ErrorCode.REGION_LOCKED]: '지역 해금에 필요한 조각이 부족합니다.',
  [ErrorCode.ALREADY_IN_REGION]: '이미 해당 지역을 탐험하고 있습니다.',
  [ErrorCode.QUIZ_SET_EXPIRED]: '오늘 제출할 수 있는 퀴즈 세트가 아닙니다.',
  [ErrorCode.QUIZ_ALREADY_SUBMITTED]: '이미 제출한 퀴즈 세트입니다.',
  [ErrorCode.RATE_LIMITED]: '요청이 너무 많으니 잠시 후 다시 시도해 주세요.',
  [ErrorCode.INTERNAL_ERROR]: '요청 처리 중 오류가 발생했습니다.',
};

export class GameError extends HttpException {
  constructor(
    code: ErrorCode,
    details: GameErrorBody['details'] = null,
    message: string = ERROR_MESSAGES[code],
  ) {
    super(
      { code, message, details } satisfies GameErrorBody,
      ERROR_HTTP_STATUS[code],
    );
  }

  override getResponse(): GameErrorBody {
    return super.getResponse() as GameErrorBody;
  }
}

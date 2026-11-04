import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ERROR_HTTP_STATUS, ErrorCode } from './error-code.enum';
import { GameError } from './game-error';
import { HttpExceptionFilter } from './http-exception.filter';

function responseHost() {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { response, host };
}

describe('GameError', () => {
  it('골드 부족 응답에 409와 API 계약의 본문을 담는다', () => {
    const error = new GameError(ErrorCode.INSUFFICIENT_GOLD, {
      required: 250,
      current: 180,
    });

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      code: 'INSUFFICIENT_GOLD',
      message: '골드가 부족합니다.',
      details: { required: 250, current: 180 },
    });
  });

  it('추가 정보가 없으면 null이고 사용자 안내 메시지를 지정할 수 있다', () => {
    const error = new GameError(
      ErrorCode.UNAUTHORIZED,
      undefined,
      '다시 시작해 주세요.',
    );
    expect(error.getResponse()).toEqual({
      code: 'UNAUTHORIZED',
      message: '다시 시작해 주세요.',
      details: null,
    });
  });

  it('API 0-3의 모든 코드를 빠짐없이 상태에 매핑한다', () => {
    const expected: Record<number, ErrorCode[]> = {
      400: [
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        ErrorCode.CONFIRMATION_MISMATCH,
      ],
      401: [ErrorCode.UNAUTHORIZED],
      404: [
        ErrorCode.REGION_NOT_FOUND,
        ErrorCode.SPECIALTY_NOT_FOUND,
        ErrorCode.PRODUCT_NOT_FOUND,
        ErrorCode.QUIZ_SET_NOT_FOUND,
        ErrorCode.QUIZ_SET_NOT_ISSUED,
        ErrorCode.QUIZ_NOT_AVAILABLE,
        ErrorCode.OPERATION_NOT_FOUND,
        ErrorCode.ROUTE_NOT_FOUND,
      ],
      409: [
        ErrorCode.NAME_DUPLICATED,
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        ErrorCode.CLAIM_TOO_EARLY,
        ErrorCode.EQUIPMENT_MAX_STAGE,
        ErrorCode.EQUIPMENT_LEVEL_REQUIRED,
        ErrorCode.EQUIPMENT_REQUIREMENTS_NOT_MET,
        ErrorCode.INSUFFICIENT_GOLD,
        ErrorCode.REGION_LOCKED,
        ErrorCode.ALREADY_IN_REGION,
        ErrorCode.QUIZ_SET_EXPIRED,
        ErrorCode.QUIZ_ALREADY_SUBMITTED,
      ],
      429: [ErrorCode.RATE_LIMITED],
      500: [ErrorCode.INTERNAL_ERROR],
    };
    expect(Object.values(ErrorCode).sort()).toEqual(
      Object.values(expected).flat().sort(),
    );
    for (const [status, codes] of Object.entries(expected)) {
      for (const code of codes) {
        expect(ERROR_HTTP_STATUS[code]).toBe(Number(status));
        const body = new GameError(code).getResponse();
        expect(body.code).toBe(code);
        expect(body.message).toEqual(expect.any(String));
        expect(body.details).toBeNull();
      }
    }
  });
});

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('도메인 오류의 상태와 본문을 보존한다', () => {
    const { host, response } = responseHost();
    const error = new GameError(ErrorCode.CLAIM_TOO_EARLY, {
      seconds_remaining: 20,
    });
    filter.catch(error, host);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(error.getResponse());
    expect(logError).not.toHaveBeenCalled();
  });

  it('class-validator 메시지 배열을 details.reason 문자열로 변환한다', () => {
    const { host, response } = responseHost();
    filter.catch(
      new BadRequestException([
        'name must be a string',
        'name should not be empty',
      ]),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: '요청 형식이나 입력값이 올바르지 않습니다.',
      details: {
        field: 'body',
        reason: 'name must be a string; name should not be empty',
      },
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('문자열 본문의 400도 입력 오류로 변환한다', () => {
    const { host, response } = responseHost();
    filter.catch(new HttpException('Invalid JSON', 400), host);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: { field: 'body', reason: 'Invalid JSON' },
      }),
    );
  });

  it('알 수 없는 예외는 500으로 바꾸고 응답과 로그에 내부 메시지를 노출하지 않는다', () => {
    const { host, response } = responseHost();
    const error = new Error(
      'nickname=private-name\n    at token=private-token',
    );
    error.stack = `Error: ${error.message}\n    at service (service.ts:10:2)`;
    filter.catch(error, host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: '요청 처리 중 오류가 발생했습니다.',
      details: null,
    });
    expect(logError).toHaveBeenCalledWith(
      'INTERNAL_ERROR',
      '    at service (service.ts:10:2)',
    );
  });

  it.each([
    new HttpException('unmapped', 418),
    new GameError(ErrorCode.INTERNAL_ERROR, { secret: 'private' }, 'private'),
    'non-error exception',
  ])('미분류 HTTP 오류와 500의 내부 상세를 숨긴다: %p', (exception) => {
    const { host, response } = responseHost();
    filter.catch(exception, host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: '요청 처리 중 오류가 발생했습니다.',
      details: null,
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

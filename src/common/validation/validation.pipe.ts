import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';
import { GameError } from '../errors/game-error';

export const REQUIRED_INPUT_MESSAGE = '필수 입력값입니다.';

// 데코레이터 선언 순서 대신 API 0-3의 원인 우선순위를 적용합니다.
const CONSTRAINT_PRIORITY = [
  'isDefined',
  'whitelistValidation',
  'isInt',
  'isString',
  'isArray',
  'isObject',
  'nestedValidation',
  'isLength',
  'minLength',
  'maxLength',
  'arrayMinSize',
  'arrayMaxSize',
  'min',
  'max',
  'matches',
  'notBannedWord',
];

const TYPE_MESSAGES: Readonly<Record<string, string>> = {
  isInt: '정수만 입력할 수 있습니다.',
  isArray: '배열만 입력할 수 있습니다.',
};

function validationError(errors: ValidationError[]): GameError {
  let current = errors[0];
  let field = current?.property ?? 'body';
  // 부모 배열의 타입·길이가 틀리면 하위 답안 오류보다 먼저 알려 줍니다.
  while (
    current &&
    !Object.keys(current.constraints ?? {}).length &&
    current.children?.length
  ) {
    current = current.children[0];
    field = `${field}.${current.property}`;
  }

  const constraints = current?.constraints ?? {};
  const constraint =
    CONSTRAINT_PRIORITY.find((key) => Object.hasOwn(constraints, key)) ??
    Object.keys(constraints)[0];
  const reason = constraint
    ? (TYPE_MESSAGES[constraint] ?? constraints[constraint])
    : 'INVALID';
  return new GameError(ErrorCode.VALIDATION_ERROR, { field, reason });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    validationError: { target: false, value: false },
    exceptionFactory: validationError,
  });
}

import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const IS_IDEMPOTENT = 'isIdempotent';
export const IS_CREATE_USER_THROTTLE = 'isCreateUserThrottle';

/** JWT 없이 호출할 수 있는 경로 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Idempotency-Key 가 필수인 경로 (API 0-4) */
export const Idempotent = () => SetMetadata(IS_IDEMPOTENT, true);
/** IP 당 시간당 제한을 적용하는 경로 (POST /user) */
export const CreateUserThrottle = () =>
  SetMetadata(IS_CREATE_USER_THROTTLE, true);

export interface AuthUser {
  id: number;
}

export interface OperationContext {
  key: string;
  userId: number;
  path: string;
  hash: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

export const OperationCtx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OperationContext =>
    context.switchToHttp().getRequest<{ operation: OperationContext }>()
      .operation,
);

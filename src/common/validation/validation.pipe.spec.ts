import 'reflect-metadata';
import type { ArgumentMetadata, Type } from '@nestjs/common';
import { CreateUserDto } from '../../modules/auth/dto/create-user.dto';
import { ProductQueryDto } from '../../modules/product/dto/product-query.dto';
import { SubmitQuizDto } from '../../modules/quiz/dto/submit-quiz.dto';
import { MoveRegionDto } from '../../modules/region/dto/move-region.dto';
import { GameError } from '../errors/game-error';
import { createValidationPipe } from './validation.pipe';

const pipe = createValidationPipe();
const answers = () =>
  [1, 2, 3].map((order_no) => ({ order_no, selected_index: 0 }));

async function errorDetails(
  metatype: Type<unknown>,
  value: unknown,
  type: ArgumentMetadata['type'] = 'body',
) {
  try {
    await pipe.transform(value, { type, metatype });
  } catch (error) {
    if (error instanceof GameError) {
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse().code).toBe('VALIDATION_ERROR');
      return error.getResponse().details;
    }
    throw error;
  }
  throw new Error('검증 오류가 발생해야 합니다.');
}

describe('입력 검증 오류 우선순위', () => {
  it.each(['문자', '2', 0.5, true, {}, []])(
    '정수가 아닌 본문 %p는 범위보다 타입을 먼저 안내한다',
    async (target_region_id) => {
      expect(await errorDetails(MoveRegionDto, { target_region_id })).toEqual({
        field: 'target_region_id',
        reason: '정수만 입력할 수 있습니다.',
      });
    },
  );

  it.each([undefined, null])(
    '필수 값 %p는 타입보다 먼저 안내한다',
    async (value) => {
      expect(
        await errorDetails(MoveRegionDto, { target_region_id: value }),
      ).toEqual({
        field: 'target_region_id',
        reason: '필수 입력값입니다.',
      });
    },
  );

  it.each([
    [0, 'target_region_id must not be less than 1'],
    [2147483648, 'target_region_id must not be greater than 2147483647'],
  ])('정수 %p의 범위 오류는 유지한다', async (target_region_id, reason) => {
    expect(await errorDetails(MoveRegionDto, { target_region_id })).toEqual({
      field: 'target_region_id',
      reason,
    });
  });

  it('query 숫자 문자열은 변환하고 숫자가 아닌 문자열은 거절한다', async () => {
    await expect(
      pipe.transform(
        { region_id: '2', specialty_id: '1' },
        { type: 'query', metatype: ProductQueryDto },
      ),
    ).resolves.toMatchObject({ region_id: 2, specialty_id: 1 });
    expect(
      await errorDetails(ProductQueryDto, { region_id: 'abc' }, 'query'),
    ).toEqual({ field: 'region_id', reason: '정수만 입력할 수 있습니다.' });
  });

  it('퀴즈의 배열 타입 오류가 길이·중첩 검증보다 우선한다', async () => {
    expect(
      await errorDetails(SubmitQuizDto, { set_id: 20261103, answers: 'abc' }),
    ).toEqual({ field: 'answers', reason: '배열만 입력할 수 있습니다.' });
  });

  it.each([
    { label: '빈 배열', value: [] },
    { label: '중첩 답안 배열', value: [{ order_no: 1, selected_index: 0 }] },
    { label: '숫자', value: 1 },
    { label: '문자열', value: 'abc' },
    { label: '불리언', value: true },
    { label: 'null', value: null },
  ])('답안 원소가 $label이면 객체 오류로 거절한다', async ({ value }) => {
    const submitted = answers();
    expect(
      await errorDetails(SubmitQuizDto, {
        set_id: 20261103,
        answers: [value, submitted[1], submitted[2]],
      }),
    ).toEqual({ field: 'answers', reason: '각 답안은 객체여야 합니다.' });
  });

  it('답안 배열 길이가 틀리면 자식 필드 오류보다 먼저 안내한다', async () => {
    expect(
      await errorDetails(SubmitQuizDto, {
        set_id: 20261103,
        answers: [{ order_no: 'abc', selected_index: 'abc' }],
      }),
    ).toEqual({
      field: 'answers',
      reason: 'answers must contain at least 3 elements',
    });
  });

  it('배열이 올바르면 중첩 필드의 정확한 경로와 타입 오류를 반환한다', async () => {
    const submitted = answers();
    expect(
      await errorDetails(SubmitQuizDto, {
        set_id: 20261103,
        answers: [
          submitted[0],
          { order_no: 2, selected_index: 'abc' },
          submitted[2],
        ],
      }),
    ).toEqual({
      field: 'answers.1.selected_index',
      reason: '정수만 입력할 수 있습니다.',
    });
  });

  it.each([
    [undefined, 'LENGTH'],
    [null, 'LENGTH'],
    [123, 'LENGTH'],
    [{}, 'LENGTH'],
    ['a', 'LENGTH'],
    ['admin123456!', 'LENGTH'],
    ['admin!', 'CHARSET'],
    ['admin', 'BANNED_WORD'],
  ])('닉네임 %p의 안내는 %s이다', async (name, reason) => {
    expect(await errorDetails(CreateUserDto, { name })).toEqual({
      field: 'name',
      reason,
    });
  });

  it('유효한 닉네임의 공백 제거와 알 수 없는 필드 거절은 유지한다', async () => {
    await expect(
      pipe.transform(
        { name: '  탐험가  ' },
        { type: 'body', metatype: CreateUserDto },
      ),
    ).resolves.toMatchObject({ name: '탐험가' });
    expect(
      await errorDetails(CreateUserDto, { name: '탐험가', gold: 1 }),
    ).toEqual({
      field: 'gold',
      reason: 'property gold should not exist',
    });
  });
});

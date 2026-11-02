import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ERROR_HTTP_STATUS, ErrorCode as E } from './errors/error-code.enum';

type Schema = Record<string, unknown>;

const int: Schema = { type: 'integer' };
const str: Schema = { type: 'string' };
const bool: Schema = { type: 'boolean' };
const time: Schema = { type: 'string', format: 'date-time' };
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const arr = (items: Schema): Schema => ({ type: 'array', items });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  required: Object.keys(properties),
  properties,
});
const oneOf = (...values: string[]): Schema => ({
  type: 'string',
  enum: values,
});

const regionRef = obj({ id: int, code: str, name: str });
const progress = {
  gold: int,
  level: int,
  exp: int,
  exp_to_next_level: int,
};
const equipment = obj({
  stage: int,
  gold_bonus_percent: int,
  next_upgrade_cost: nullable(int),
  next_required_level: nullable(int),
});
const settled = obj({
  elapsed_seconds: int,
  capped: bool,
  gold: int,
  exp: int,
  pieces: obj({
    region_id: int,
    specialty_id: int,
    name: str,
    judgments: int,
    gained: int,
    total: int,
    carry_seconds: int,
    consecutive_fails: int,
  }),
  unlocked_regions: arr(obj({ id: int, name: str })),
});
const user = obj({
  id: int,
  name: str,
  ...progress,
  level_gold_bonus_percent: int,
  equipment,
  total_gold_bonus_percent: int,
  cur_region: regionRef,
  last_settled_at: time,
  claimable_at: time,
  state_version: int,
  server_time: time,
});
const quizSet = obj({
  set_id: int,
  quiz_date: { type: 'string', format: 'date' },
  region: regionRef,
  status: oneOf('ISSUED', 'SUBMITTED'),
  questions: arr(
    obj({
      order_no: int,
      question_id: int,
      question: str,
      choices: arr(str),
      selected_index: nullable(int),
    }),
  ),
  result: nullable(
    obj({
      correct_count: int,
      total: int,
      rewarded: obj({ gold: int, exp: int }),
      answers: arr(
        obj({
          order_no: int,
          selected_index: int,
          answer_index: int,
          is_correct: bool,
          explanation: str,
        }),
      ),
      submitted_at: time,
    }),
  ),
});
const collectState = oneOf('UNDISCOVERED', 'COLLECTING', 'COMPLETED');
const regionWithStatus = obj({
  id: int,
  code: str,
  name: str,
  status: oneOf('CURRENT', 'UNLOCKED', 'LOCKED'),
});
const codexItem = {
  id: int,
  name: str,
  region: regionWithStatus,
  state: collectState,
  pieces: int,
  required_pieces: int,
  image_url: nullable(str),
};
const productStatus = oneOf('ACTIVE', 'PREPARING');
const productItem = {
  id: int,
  name: str,
  image_url: nullable(str),
  region: regionRef,
  specialty_id: nullable(int),
  seller_name: nullable(str),
  price: nullable(int),
  status: productStatus,
};

interface EndpointDoc {
  summary: string;
  response: Schema;
  status?: number;
  errors?: E[];
  body?: Schema;
  query?: string[];
  isPublic?: boolean;
  idempotent?: boolean;
}

const IDEMPOTENT_ERRORS = [
  E.IDEMPOTENCY_KEY_REQUIRED,
  E.IDEMPOTENCY_KEY_REUSED,
];

/** 요청·응답·오류 코드를 Swagger 에 함께 적습니다. API 명세 문서와 내용을 맞춥니다. */
export function ApiEndpoint(doc: EndpointDoc) {
  const errors = [
    ...(doc.errors ?? []),
    ...(doc.isPublic ? [] : [E.UNAUTHORIZED]),
    ...(doc.idempotent ? IDEMPOTENT_ERRORS : []),
    E.RATE_LIMITED,
  ];
  const byStatus = new Map<number, E[]>();
  for (const code of errors) {
    const status = Number(ERROR_HTTP_STATUS[code]);
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return applyDecorators(
    ApiOperation({ summary: doc.summary }),
    ApiResponse({ status: doc.status ?? 200, schema: doc.response }),
    ...[...byStatus].map(([status, codes]) =>
      ApiResponse({ status, description: codes.join(', ') }),
    ),
    ...(doc.isPublic ? [] : [ApiBearerAuth()]),
    ...(doc.idempotent
      ? [
          ApiHeader({
            name: 'Idempotency-Key',
            required: true,
            description:
              '요청마다 새 UUID v4. 재시도할 때는 같은 값을 보냅니다.',
          }),
        ]
      : []),
    ...(doc.body ? [ApiBody({ schema: doc.body })] : []),
    ...(doc.query ?? []).map((name) =>
      ApiQuery({ name, required: false, type: 'integer' }),
    ),
  );
}

export const DOCS = {
  createUser: {
    summary: '유저(캐릭터) 생성',
    status: 201,
    isPublic: true,
    body: obj({ name: { ...str, minLength: 2, maxLength: 10 } }),
    response: obj({ jwt: str, user }),
    errors: [E.VALIDATION_ERROR, E.NAME_DUPLICATED],
  },
  refreshToken: {
    summary: '토큰 연장',
    response: obj({ jwt: str }),
  },
  getUser: { summary: '유저 조회', response: user },
  previewIdleReward: {
    summary: '획득 가능한 방치 보상 조회. 조각 개수는 공개하지 않습니다',
    response: obj({
      elapsed_seconds: int,
      cap_seconds: int,
      capped: bool,
      claimable: bool,
      seconds_until_claimable: int,
      gold: int,
      exp: int,
      level_after: int,
      piece_judgments: int,
      server_time: time,
    }),
  },
  claimIdleReward: {
    summary: '방치 보상 수령',
    idempotent: true,
    response: obj({
      ...progress,
      gained: settled,
      leveled_up: bool,
      previous_level: int,
      state_version: int,
      settled_at: time,
    }),
    errors: [E.CLAIM_TOO_EARLY],
  },
  getEquipment: {
    summary: '장비 정보와 강화 미리보기',
    response: obj({
      stage: int,
      gold_bonus_percent: int,
      max_stage: int,
      is_max: bool,
      next: nullable(
        obj({
          stage: int,
          gold_bonus_percent: int,
          upgrade_cost: int,
          required_level: int,
        }),
      ),
      gold: int,
      gold_after_settle: int,
      level_after_settle: int,
      can_upgrade: bool,
      blocked_by: nullable(oneOf('MAX_STAGE', 'LEVEL', 'GOLD')),
    }),
  },
  upgradeEquipment: {
    summary:
      '장비 강화. 이전 효율로 정산한 뒤 검사하며, 실패하면 정산까지 취소합니다',
    idempotent: true,
    response: obj({
      ...progress,
      equipment,
      cost: int,
      settled,
      state_version: int,
      settled_at: time,
    }),
    errors: [
      E.EQUIPMENT_MAX_STAGE,
      E.EQUIPMENT_LEVEL_REQUIRED,
      E.INSUFFICIENT_GOLD,
    ],
  },
  listRegions: {
    summary: '활성 지역 목록과 해금 상태',
    response: obj({
      regions: arr(
        obj({
          id: int,
          code: str,
          name: str,
          sort_order: int,
          gold_per_minute: int,
          exp_per_minute: int,
          description: nullable(str),
          specialty: obj({
            id: int,
            name: str,
            pieces: int,
            required_pieces: int,
          }),
          status: oneOf('CURRENT', 'UNLOCKED', 'LOCKED'),
          unlocked_at: nullable(time),
          unlock: nullable(
            obj({
              region_id: int,
              region_name: str,
              specialty_name: str,
              required_pieces: int,
              current_pieces: int,
            }),
          ),
        }),
      ),
    }),
  },
  moveRegion: {
    summary: '탐험 지역 이동. 이전 지역 기준으로 정산합니다',
    idempotent: true,
    body: obj({ target_region_id: int }),
    response: obj({
      ...progress,
      cur_region: regionRef,
      previous_region: regionRef,
      settled,
      state_version: int,
      started_at: time,
    }),
    errors: [
      E.VALIDATION_ERROR,
      E.REGION_NOT_FOUND,
      E.ALREADY_IN_REGION,
      E.REGION_LOCKED,
    ],
  },
  issueQuiz: {
    summary: '오늘의 퀴즈 세트 발급. 없으면 만들고 있으면 돌려줍니다',
    response: obj({ created: bool, set: quizSet }),
    errors: [E.QUIZ_NOT_AVAILABLE],
  },
  getQuiz: {
    summary: '오늘의 세트와 결과 조회',
    response: quizSet,
    errors: [E.QUIZ_SET_NOT_ISSUED],
  },
  submitQuiz: {
    summary: '답안 제출과 보상. 미정산 보상을 먼저 정산합니다',
    idempotent: true,
    body: obj({
      set_id: int,
      answers: arr(obj({ order_no: int, selected_index: int })),
    }),
    response: obj({
      set: quizSet,
      ...progress,
      settled,
      leveled_up: bool,
      state_version: int,
    }),
    errors: [
      E.VALIDATION_ERROR,
      E.QUIZ_SET_NOT_FOUND,
      E.QUIZ_SET_EXPIRED,
      E.QUIZ_ALREADY_SUBMITTED,
    ],
  },
  listCodex: {
    summary: '도감 목록과 수집 상태',
    query: ['region_id'],
    response: obj({
      summary: obj({ total: int, discovered: int, completed: int }),
      items: arr(obj(codexItem)),
    }),
    errors: [E.VALIDATION_ERROR, E.REGION_NOT_FOUND],
  },
  getCodex: {
    summary: '특산물 상세. 미발견이면 소개와 출처를 숨깁니다',
    response: obj({
      ...codexItem,
      description: nullable(str),
      source: nullable(str),
      completed_at: nullable(time),
      unlocks_region: nullable(regionRef),
      products: arr(
        obj({
          id: int,
          name: str,
          status: productStatus,
          image_url: nullable(str),
        }),
      ),
    }),
    errors: [E.VALIDATION_ERROR, E.SPECIALTY_NOT_FOUND],
  },
  listProducts: {
    summary: '지역 상품 목록. ACTIVE 가 먼저 옵니다',
    query: ['region_id', 'specialty_id'],
    response: obj({ items: arr(obj(productItem)) }),
    errors: [E.VALIDATION_ERROR, E.REGION_NOT_FOUND, E.SPECIALTY_NOT_FOUND],
  },
  getProduct: {
    summary: '상품 상세와 판매처 링크',
    response: obj({
      ...productItem,
      description: nullable(str),
      external_url: nullable(str),
      link_available: bool,
      updated_at: time,
    }),
    errors: [E.VALIDATION_ERROR, E.PRODUCT_NOT_FOUND],
  },
  getOperation: {
    summary: '처리 결과 조회. 응답을 받지 못했을 때 씁니다',
    response: obj({
      key: str,
      path: str,
      status_code: int,
      response: { type: 'object' },
      created_at: time,
    }),
    errors: [E.OPERATION_NOT_FOUND],
  },
  resetProgress: {
    summary: '체험 기록 초기화. 유저를 삭제하며 이후 토큰은 무효입니다',
    idempotent: true,
    body: obj({ confirmation: { ...str, enum: ['RESET'] } }),
    response: obj({ deleted: bool, deleted_at: time }),
    errors: [E.VALIDATION_ERROR, E.CONFIRMATION_MISMATCH],
  },
} satisfies Record<string, EndpointDoc>;

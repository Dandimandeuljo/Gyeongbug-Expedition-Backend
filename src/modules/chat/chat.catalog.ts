export type Taste =
  | 'sweet'
  | 'crisp'
  | 'sour'
  | 'salty'
  | 'savory'
  | 'spicy'
  | 'chewy'
  | 'healthy'
  | 'gift'
  | 'snack'
  | 'fruit'
  | 'seafood';

export interface CatalogShopEntry {
  title: string;
  /** 시연 상점의 최소 금액. 프런트엔드 상점의 1KG 옵션과 같은 값입니다. */
  fromPrice: number;
}

export interface CatalogItem {
  /** region_product.id */
  id: number;
  name: string;
  region: string;
  tastes: Taste[];
  /** 메시지에서 이 특산물을 가리키는 말 */
  aliases: string[];
  shop?: CatalogShopEntry;
}

/** 취향 추천에 쓰는 특산물 분류입니다. 가격은 specialty_price 에서만 읽습니다. */
export const CATALOG: CatalogItem[] = [
  {
    id: 1,
    name: '사과',
    region: '청송',
    tastes: ['sweet', 'crisp', 'fruit', 'gift'],
    aliases: ['사과', '청송'],
    shop: { title: '햇살 과수원 사과', fromPrice: 18000 },
  },
  {
    id: 2,
    name: '간고등어',
    region: '안동',
    tastes: ['salty', 'savory', 'seafood'],
    aliases: ['고등어', '안동'],
  },
  {
    id: 3,
    name: '풍기인삼',
    region: '영주',
    tastes: ['healthy', 'gift'],
    aliases: ['인삼', '영주', '풍기'],
  },
  {
    id: 4,
    name: '오미자',
    region: '문경',
    tastes: ['sour', 'healthy', 'fruit'],
    aliases: ['오미자', '문경'],
  },
  {
    id: 5,
    name: '곶감',
    region: '상주',
    tastes: ['sweet', 'chewy', 'fruit', 'gift'],
    aliases: ['곶감', '상주'],
  },
  {
    id: 6,
    name: '참외',
    region: '성주',
    tastes: ['sweet', 'crisp', 'fruit'],
    aliases: ['참외', '성주'],
  },
  {
    id: 7,
    name: '마늘',
    region: '의성',
    tastes: ['spicy', 'healthy', 'savory'],
    aliases: ['마늘', '의성'],
  },
  {
    id: 8,
    name: '과메기',
    region: '포항',
    tastes: ['savory', 'chewy', 'seafood', 'snack'],
    aliases: ['과메기', '포항'],
  },
];

export const TASTE_WORDS: Record<Taste, string[]> = {
  sweet: ['달콤', '달달', '단맛', '단 ', '달아', '단거', '단것'],
  crisp: ['아삭'],
  sour: ['새콤', '상큼', '신맛'],
  salty: ['짭짤', '짠맛', '짭조름'],
  savory: ['고소', '담백'],
  spicy: ['알싸', '매콤', '매운'],
  chewy: ['쫀득', '쫄깃'],
  healthy: ['건강', '면역', '보양', '몸에 좋'],
  gift: ['선물'],
  snack: ['안주'],
  fruit: ['과일'],
  seafood: ['해산물', '생선', '수산물', '바다'],
};

export const TASTE_ADJECTIVE: Partial<Record<Taste, string>> = {
  sweet: '달콤한',
  crisp: '아삭한',
  sour: '새콤한',
  salty: '짭짤한',
  savory: '고소한',
  spicy: '알싸한',
  chewy: '쫀득한',
  healthy: '건강한',
};

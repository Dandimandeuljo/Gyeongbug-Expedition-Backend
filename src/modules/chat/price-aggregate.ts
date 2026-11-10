export interface RetailRow {
  exmn_ymd?: string;
  se_nm?: string;
  sgg_nm?: string;
  vrty_nm?: string;
  grd_nm?: string;
  unit?: string;
  unit_sz?: string;
  exmn_dd_prc?: string;
  yy1_bfr_prc?: string;
}

export interface AuctionRow {
  plor_nm?: string;
  qty?: string;
  unit_qty?: string;
  unit_nm?: string;
  scsbd_prc?: string;
}

export interface CollectedPrice {
  kind: 'RETAIL' | 'NATIONAL' | 'AUCTION';
  area: string;
  label: string;
  unit: string;
  price: number;
  yearAgoPrice: number | null;
  surveyDate: string;
}

const RETAIL_AREAS = ['안동', '포항', '대구'];
const GRADE_ORDER = ['상품', '-'];
const MIN_AUCTION_ROWS = 5;

export function toIsoDate(ymd: string): string {
  return ymd.includes('-')
    ? ymd
    : `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function gradeRank(grade: string | undefined): number {
  const index = GRADE_ORDER.indexOf(grade ?? '');
  return index === -1 ? GRADE_ORDER.length : index;
}

function bestGrade<T extends { grd_nm?: string }>(rows: T[]): T[] {
  const best = Math.min(...rows.map((row) => gradeRank(row.grd_nm)));
  const picked = rows.filter((row) => gradeRank(row.grd_nm) === best);
  const grade = picked[0]?.grd_nm;
  return picked.filter((row) => row.grd_nm === grade);
}

function unitLabel(row: RetailRow): string {
  return `${row.unit_sz ?? ''}${row.unit ?? ''}`;
}

/** 안동·포항·대구의 품종별 최신 소매가를 시장 평균으로 만듭니다. */
export function aggregateRetail(
  rows: RetailRow[],
  variety: string | null,
): CollectedPrice[] {
  const result: CollectedPrice[] = [];
  const usable = rows.filter(
    (row) =>
      row.se_nm === '소매' &&
      Number(row.exmn_dd_prc) > 0 &&
      (!variety || row.vrty_nm === variety),
  );
  for (const area of RETAIL_AREAS) {
    const inArea = usable.filter((row) => row.sgg_nm === area);
    if (!inArea.length) {
      continue;
    }
    const latest = inArea.reduce(
      (max, row) => ((row.exmn_ymd ?? '') > max ? (row.exmn_ymd ?? '') : max),
      '',
    );
    const today = bestGrade(inArea.filter((row) => row.exmn_ymd === latest));
    const unit = unitLabel(today[0]);
    const sameUnit = today.filter((row) => unitLabel(row) === unit);
    const total = sameUnit.reduce((sum, r) => sum + Number(r.exmn_dd_prc), 0);
    result.push({
      kind: 'RETAIL',
      area,
      label: sameUnit[0].vrty_nm ?? '',
      unit,
      price: Math.round(total / sameUnit.length),
      yearAgoPrice: null,
      surveyDate: toIsoDate(latest),
    });
  }
  return result;
}

/** 전국 소매 평균과 1년 전 값을 고릅니다. */
export function pickNational(
  rows: RetailRow[],
  variety: string | null,
): CollectedPrice | null {
  const usable = rows.filter(
    (row) =>
      row.se_nm === '소매' &&
      Number(row.exmn_dd_prc) > 0 &&
      (!variety || row.vrty_nm === variety),
  );
  if (!usable.length) {
    return null;
  }
  const row = bestGrade(usable)[0];
  const yearAgo = Number(row.yy1_bfr_prc);
  return {
    kind: 'NATIONAL',
    area: '전국',
    label: row.vrty_nm ?? '',
    unit: unitLabel(row),
    price: Number(row.exmn_dd_prc),
    yearAgoPrice: yearAgo > 0 ? yearAgo : null,
    surveyDate: toIsoDate(row.exmn_ymd ?? ''),
  };
}

/** `경상북도 청송군`, `경북 청송군 청송읍` 을 `청송군` 으로 맞춥니다. 경북이 아니면 null 입니다. */
export function gyeongbukCounty(origin: string | undefined): string | null {
  const match = /^\s*(?:경상북도|경북)\s+(\S+?[시군])(?:\s|$)/.exec(
    origin ?? '',
  );
  return match ? match[1] : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * 경북 시·군별 kg당 가중평균 경매가입니다.
 * 포장 크기가 섞여 극단값이 생기므로 중앙값의 1/3~3배 밖의 거래와 표본이 적은 시·군은 뺍니다.
 */
export function aggregateAuction(
  rows: AuctionRow[],
  surveyDate: string,
): CollectedPrice[] {
  const byCounty = new Map<string, { perKg: number; weight: number }[]>();
  for (const row of rows) {
    const county = gyeongbukCounty(row.plor_nm);
    const qty = Number(row.qty);
    const size = Number(row.unit_qty);
    const price = Number(row.scsbd_prc);
    if (
      !county ||
      row.unit_nm !== 'kg' ||
      !(qty > 0 && size > 0 && price > 0)
    ) {
      continue;
    }
    const list = byCounty.get(county) ?? [];
    list.push({ perKg: price / size, weight: qty * size });
    byCounty.set(county, list);
  }
  const result: CollectedPrice[] = [];
  for (const [county, deals] of byCounty) {
    if (deals.length < MIN_AUCTION_ROWS) {
      continue;
    }
    const mid = median(deals.map((deal) => deal.perKg));
    const kept = deals.filter(
      (deal) => deal.perKg >= mid / 3 && deal.perKg <= mid * 3,
    );
    const weight = kept.reduce((sum, deal) => sum + deal.weight, 0);
    const money = kept.reduce((sum, d) => sum + d.perKg * d.weight, 0);
    result.push({
      kind: 'AUCTION',
      area: county,
      label: '도매 경매',
      unit: 'kg',
      price: Math.round(money / weight),
      yearAgoPrice: null,
      surveyDate,
    });
  }
  return result;
}

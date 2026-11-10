import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SpecialtyPrice } from '../../database/entities';
import {
  aggregateAuction,
  aggregateRetail,
  AuctionRow,
  CollectedPrice,
  pickNational,
  RetailRow,
} from './price-aggregate';

const BASE = 'https://apis.data.go.kr/B552845';
const TIMEOUT_MS = 30000;
const RETAIL_LOOKBACK_DAYS = 21;
const AUCTION_LOOKBACK_DAYS = 5;
const PAGE_SIZE = 1000;
const MAX_PAGES = 30;

const RETAIL_ITEMS = [
  { id: 1, category: '400', item: '411', variety: '후지' },
  { id: 2, category: '600', item: '611', variety: '국산(염장)' },
  { id: 6, category: '200', item: '222', variety: null },
  { id: 7, category: '200', item: '258', variety: '깐마늘(국산)' },
];
const AUCTION_ITEMS = [
  { id: 1, large: '06', middle: '01' },
  { id: 5, large: '06', middle: '07' },
];

function seoulDate(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
    date,
  );
}

/** 공공데이터 시세를 하루 한 번 모읍니다. 실패하면 이전 값을 그대로 둡니다. */
@Injectable()
export class PriceCollectorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PriceCollectorService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get key(): string | undefined {
    return this.config.get<string>('DATA_GO_KR_SERVICE_KEY');
  }

  onApplicationBootstrap(): void {
    if (!this.key) {
      return;
    }
    void this.dataSource.manager.count(SpecialtyPrice).then(
      (count) => (count === 0 ? this.collect() : undefined),
      () => undefined,
    );
  }

  @Cron('30 6 * * *', { timeZone: 'Asia/Seoul', name: 'collect-prices' })
  async collect(): Promise<void> {
    if (!this.key || this.running) {
      return;
    }
    this.running = true;
    try {
      for (const target of RETAIL_ITEMS) {
        await this.collectRetail(target);
      }
      for (const target of AUCTION_ITEMS) {
        await this.collectAuction(target);
      }
      this.logger.log('시세 수집을 마쳤습니다');
    } catch (error) {
      this.logger.warn(
        `시세 수집 실패: ${error instanceof Error ? error.message : 'UNKNOWN'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async collectRetail(target: (typeof RETAIL_ITEMS)[number]) {
    const conditions: [string, string][] = [
      ['cond[ctgry_cd::EQ]', target.category],
      ['cond[item_cd::EQ]', target.item],
    ];
    const rows = await this.fetchAll<RetailRow>('/perDay/price', [
      ...conditions,
      [
        'cond[exmn_ymd::GTE]',
        seoulDate(RETAIL_LOOKBACK_DAYS).replace(/-/g, ''),
      ],
      ['cond[exmn_ymd::LTE]', seoulDate(0).replace(/-/g, '')],
    ]);
    await this.replace(
      target.id,
      'RETAIL',
      aggregateRetail(rows, target.variety),
    );

    const recent = await this.fetchAll<RetailRow>('/recent/price', conditions);
    const national = pickNational(recent, target.variety);
    await this.replace(target.id, 'NATIONAL', national ? [national] : []);
  }

  private async collectAuction(target: (typeof AUCTION_ITEMS)[number]) {
    for (let back = 1; back <= AUCTION_LOOKBACK_DAYS; back += 1) {
      const day = seoulDate(back);
      const rows = await this.fetchAll<AuctionRow>('/katRealTime2/trades2', [
        ['cond[trd_clcln_ymd::EQ]', day],
        ['cond[gds_lclsf_cd::EQ]', target.large],
        ['cond[gds_mclsf_cd::EQ]', target.middle],
        ['selectable', 'plor_nm,qty,unit_qty,unit_nm,scsbd_prc'],
      ]);
      if (rows.length) {
        await this.replace(target.id, 'AUCTION', aggregateAuction(rows, day));
        return;
      }
    }
  }

  /** 새 값이 있을 때만 교체해, 일시적인 빈 응답으로 기존 시세를 잃지 않습니다. */
  private async replace(
    regionProductId: number,
    kind: CollectedPrice['kind'],
    prices: CollectedPrice[],
  ): Promise<void> {
    if (!prices.length) {
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(SpecialtyPrice, { regionProductId, kind });
      await manager.insert(
        SpecialtyPrice,
        prices.map((price) => ({ ...price, regionProductId })),
      );
    });
  }

  private async fetchAll<T>(
    path: string,
    conditions: [string, string][],
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { items, total } = await this.fetchPage<T>(path, conditions, page);
      rows.push(...items);
      if (!items.length || rows.length >= total) {
        break;
      }
    }
    return rows;
  }

  private async fetchPage<T>(
    path: string,
    conditions: [string, string][],
    page: number,
  ): Promise<{ items: T[]; total: number }> {
    const query = new URLSearchParams([
      ['pageNo', String(page)],
      ['numOfRows', String(PAGE_SIZE)],
      ['returnType', 'JSON'],
      ...conditions,
    ]);
    const key = this.key ?? '';
    const encoded = key.includes('%') ? key : encodeURIComponent(key);
    const response = await fetch(
      `${BASE}${path}?serviceKey=${encoded}&${query.toString()}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    // 주소에 인증키가 있으므로 오류 메시지에는 경로와 상태만 남깁니다.
    if (!response.ok) {
      throw new Error(`${path} HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      response?: {
        body?: { totalCount?: number | string; items?: { item?: T | T[] } };
      };
    };
    const body = data.response?.body;
    const item = body?.items?.item;
    return {
      items: Array.isArray(item) ? item : item ? [item] : [],
      total: Number(body?.totalCount ?? 0),
    };
  }
}

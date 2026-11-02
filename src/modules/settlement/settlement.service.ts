import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { dbNow } from '../../common/time/db-clock';
import {
  Equipment,
  EquipmentUpgrade,
  IdleReward,
  Logbook,
  Region,
  RegionProduct,
  User,
  UserRegionUnlock,
} from '../../database/entities';
import { computeSettlement } from './compute-settlement';
import type {
  Rng,
  SettlementInput,
  SettlementResult,
} from './compute-settlement';
import {
  CLAIM_MIN_SECONDS,
  PIECE_SUCCESS_PERCENT,
} from './game-rules.constants';

export const SETTLEMENT_RNG = 'SETTLEMENT_RNG';

export interface PlayerState {
  user: User;
  idle: IdleReward;
  equipment: Equipment;
  statRatio: number;
  region: Region;
  product: RegionProduct;
  logbook: Logbook;
}

export interface Settlement extends PlayerState {
  now: Date;
  result: SettlementResult;
  unlockedRegions: { id: number; name: string }[];
  settled: ReturnType<typeof settledView>;
}

function settledView(
  state: PlayerState,
  result: SettlementResult,
  unlockedRegions: { id: number; name: string }[],
) {
  return {
    elapsed_seconds: result.elapsedSeconds,
    capped: result.capped,
    gold: result.goldGain,
    exp: result.expGain,
    pieces: {
      region_id: state.region.id,
      specialty_id: state.product.id,
      name: state.product.name,
      judgments: result.judgments,
      gained: result.piecesGain,
      total: result.newPieces,
      carry_seconds: result.newCarrySeconds,
      consecutive_fails: result.newConsecutiveFails,
    },
    unlocked_regions: unlockedRegions,
  };
}

function elapsedSeconds(now: Date, from: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 1000);
}

function toInput(state: PlayerState, elapsed: number): SettlementInput {
  return {
    elapsedSeconds: elapsed,
    level: state.user.level,
    exp: state.user.exp,
    gold: state.user.gold,
    goldRemainder: state.user.goldRemainder,
    expRemainder: state.user.expRemainder,
    goldPerMinute: state.region.goldPerMinute,
    expPerMinute: state.region.expPerMinute,
    equipmentStage: state.equipment.curUpgrade,
    equipmentStatRatio: state.statRatio,
    pieces: state.logbook.curCollect,
    carrySeconds: state.logbook.carrySeconds,
    consecutiveFails: state.logbook.consecutiveFails,
    requiredPieces: state.product.requiredPieces,
  };
}

@Injectable()
export class SettlementService {
  constructor(@Inject(SETTLEMENT_RNG) private readonly rng: Rng) {}

  /** 유저의 현재 상태를 읽습니다. lock 이면 트랜잭션 안에서 행을 잠급니다. */
  async loadState(
    manager: EntityManager,
    userId: number,
    lock: boolean,
  ): Promise<PlayerState> {
    const lockOption = lock
      ? { lock: { mode: 'pessimistic_write' as const } }
      : {};
    const user = await manager.findOne(User, {
      where: { id: userId },
      ...lockOption,
    });
    if (!user) {
      throw new GameError(ErrorCode.UNAUTHORIZED);
    }
    const idle = await manager.findOneOrFail(IdleReward, {
      where: { userId },
      ...lockOption,
    });
    const equipment = await manager.findOneOrFail(Equipment, {
      where: { userId },
      ...lockOption,
    });
    const ratioRows: { ratio: number }[] = await manager.query(
      `SELECT COALESCE(sum(s.ratio), 0)::int AS ratio
         FROM equipment_stat_set ss
         JOIN equipment_stat s ON s.id = ss.equipment_stat_id AND s.stat = 'GOLD_BONUS'
        WHERE ss.equipment_id = $1`,
      [equipment.id],
    );
    const region = await manager.findOneByOrFail(Region, {
      id: user.curRegionId,
    });
    const product = await manager.findOneByOrFail(RegionProduct, {
      regionId: region.id,
    });
    const logbook = await this.ensureLogbook(manager, userId, product, lock);
    return {
      user,
      idle,
      equipment,
      statRatio: ratioRows[0].ratio,
      region,
      product,
      logbook,
    };
  }

  /** 해당 지역의 도감 행을 돌려줍니다. 없으면 잠금 대상일 때 만듭니다. */
  async ensureLogbook(
    manager: EntityManager,
    userId: number,
    product: RegionProduct,
    lock: boolean,
  ): Promise<Logbook> {
    const where = { userId, regionId: product.regionId };
    const found = await manager.findOne(Logbook, {
      where,
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (found) {
      return found;
    }
    const fresh = manager.create(Logbook, {
      ...where,
      regionProductId: product.id,
    });
    return lock
      ? manager.save(fresh)
      : {
          ...fresh,
          curCollect: 0,
          carrySeconds: 0,
          consecutiveFails: 0,
          completedAt: null,
        };
  }

  /** 저장 없이 지금 정산하면 받을 양을 계산합니다. 추첨 결과는 쓰지 않습니다. */
  async preview(manager: EntityManager, userId: number) {
    const state = await this.loadState(manager, userId, false);
    const now = await dbNow(manager);
    const elapsed = elapsedSeconds(now, state.idle.recentReceive);
    const result = computeSettlement(
      toInput(state, elapsed),
      () => PIECE_SUCCESS_PERCENT,
    );
    return { state, now, result, rawElapsed: elapsed };
  }

  /**
   * GAME_RULES 6절의 정산입니다. 마지막 정산 시각과 상태 버전은 여기서만 갱신합니다.
   * 호출자의 트랜잭션 안에서 실행되며, 뒤이은 검사가 실패하면 함께 롤백됩니다.
   */
  async settle(
    manager: EntityManager,
    userId: number,
    options: { enforceClaimMinimum?: boolean } = {},
  ): Promise<Settlement> {
    const state = await this.loadState(manager, userId, true);
    const now = await dbNow(manager);
    const elapsed = elapsedSeconds(now, state.idle.recentReceive);
    if (options.enforceClaimMinimum && elapsed < CLAIM_MIN_SECONDS) {
      throw new GameError(ErrorCode.CLAIM_TOO_EARLY, {
        seconds_remaining: CLAIM_MIN_SECONDS - Math.max(0, elapsed),
      });
    }

    const result = computeSettlement(toInput(state, elapsed), this.rng);

    const { user, idle, logbook, region, product } = state;
    user.gold = result.newGold;
    user.exp = result.newExp;
    user.level = result.newLevel;
    user.goldRemainder = result.newGoldRemainder;
    user.expRemainder = result.newExpRemainder;
    user.stateVersion += 1;
    logbook.curCollect = result.newPieces;
    logbook.carrySeconds = result.newCarrySeconds;
    logbook.consecutiveFails = result.newConsecutiveFails;
    if (result.reachedRequired && !logbook.completedAt) {
      logbook.completedAt = now;
    }
    idle.recentReceive = now;

    await manager.save(user);
    await manager.save(logbook);
    await manager.save(idle);

    const unlockedRegions = await this.recordUnlock(
      manager,
      userId,
      region,
      product,
      logbook,
      now,
    );

    return {
      ...state,
      now,
      result,
      unlockedRegions,
      settled: settledView(state, result, unlockedRegions),
    };
  }

  /** 다음 단계의 비용과 요구 레벨. 최고 단계면 null 입니다. */
  nextUpgrade(
    manager: EntityManager,
    equipment: Equipment,
  ): Promise<EquipmentUpgrade | null> {
    return manager.findOneBy(EquipmentUpgrade, {
      upgrade: equipment.curUpgrade + 1,
    });
  }

  private async recordUnlock(
    manager: EntityManager,
    userId: number,
    region: Region,
    product: RegionProduct,
    logbook: Logbook,
    now: Date,
  ): Promise<{ id: number; name: string }[]> {
    if (logbook.curCollect < product.requiredPieces) {
      return [];
    }
    const next = await manager
      .createQueryBuilder(Region, 'r')
      .where('r.sortOrder > :order', { order: region.sortOrder })
      .orderBy('r.sortOrder', 'ASC')
      .getOne();
    if (!next?.isActive) {
      return [];
    }
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(UserRegionUnlock)
      .values({ userId, regionId: next.id, unlockedAt: now })
      .orIgnore()
      .returning('region_id')
      .execute();
    const rows = inserted.raw as unknown[];
    return rows.length > 0 ? [{ id: next.id, name: next.name }] : [];
  }
}

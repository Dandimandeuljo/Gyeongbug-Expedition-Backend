import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CurrentUser, Idempotent, OperationCtx } from '../../common/decorators';
import type { AuthUser, OperationContext } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import {
  progressView,
  regionCode,
  regionRef,
  regionStatus,
} from '../../common/views';
import {
  Logbook,
  Region,
  RegionProduct,
  User,
  UserRegionUnlock,
} from '../../database/entities';
import { OperationService } from '../operation/operation.service';
import { SettlementService } from '../settlement/settlement.service';
import { MoveRegionDto } from './dto/move-region.dto';

@Controller('regions')
export class RegionController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settlement: SettlementService,
    private readonly operations: OperationService,
  ) {}

  @ApiEndpoint(DOCS.listRegions)
  @Get()
  async list(@CurrentUser() auth: AuthUser) {
    const manager = this.dataSource.manager;
    const user = await manager.findOneByOrFail(User, { id: auth.id });
    // 직전 지역은 비활성 지역까지 포함한 진행 순서에서 찾습니다.
    const allRegions = await manager.find(Region, {
      order: { sortOrder: 'ASC' },
    });
    const regions = allRegions.filter((region) => region.isActive);
    const products = await manager.find(RegionProduct);
    const logbooks = await manager.findBy(Logbook, { userId: auth.id });
    const unlocks = await manager.findBy(UserRegionUnlock, { userId: auth.id });
    const productOf = new Map(products.map((p) => [p.regionId, p]));
    const piecesOf = new Map(logbooks.map((l) => [l.regionId, l.curCollect]));
    const unlockOf = new Map(unlocks.map((u) => [u.regionId, u.unlockedAt]));
    const unlockedIds = new Set(unlockOf.keys());

    return {
      regions: regions.map((region) => {
        const product = productOf.get(region.id);
        const previous = allRegions[allRegions.indexOf(region) - 1];
        const previousProduct = previous && productOf.get(previous.id);
        return {
          id: region.id,
          code: regionCode(region),
          name: region.name,
          sort_order: region.sortOrder,
          gold_per_minute: region.goldPerMinute,
          exp_per_minute: region.expPerMinute,
          description: region.description,
          specialty: product && {
            id: product.id,
            name: product.name,
            pieces: piecesOf.get(region.id) ?? 0,
            required_pieces: product.requiredPieces,
          },
          status: regionStatus(region.id, user.curRegionId, unlockedIds),
          unlocked_at: unlockOf.get(region.id) ?? null,
          unlock:
            previous && previousProduct
              ? {
                  region_id: previous.id,
                  region_name: previous.name,
                  specialty_name: previousProduct.name,
                  required_pieces: previousProduct.requiredPieces,
                  current_pieces: piecesOf.get(previous.id) ?? 0,
                }
              : null,
        };
      }),
    };
  }

  @ApiEndpoint(DOCS.moveRegion)
  @Post('move')
  @HttpCode(200)
  @Idempotent()
  move(
    @CurrentUser() auth: AuthUser,
    @OperationCtx() operation: OperationContext,
    @Body() body: MoveRegionDto,
  ) {
    return this.operations.execute(operation, async (manager) => {
      const target = await manager.findOneBy(Region, {
        id: body.target_region_id,
        isActive: true,
      });
      if (!target) {
        throw new GameError(ErrorCode.REGION_NOT_FOUND);
      }
      const before = await manager.findOneByOrFail(User, { id: auth.id });
      if (before.curRegionId === target.id) {
        throw new GameError(ErrorCode.ALREADY_IN_REGION);
      }

      // 잠긴 지역은 추첨 전에 거절합니다. 정산 뒤에 거절하면 롤백되므로
      // 새 키로 반복해 20개가 나올 때까지 다시 뽑을 수 있고, 버려질 결과도 드러납니다.
      const unlocked = await manager.existsBy(UserRegionUnlock, {
        userId: auth.id,
        regionId: target.id,
      });
      if (!unlocked) {
        throw await this.lockedError(manager, target, auth.id);
      }

      const settled = await this.settlement.settle(manager, auth.id);

      const product = await manager.findOneByOrFail(RegionProduct, {
        regionId: target.id,
      });
      await this.settlement.ensureLogbook(manager, auth.id, product, true);
      const player = settled.user;
      player.curRegionId = target.id;
      await manager.save(player);

      return {
        ...progressView(player),
        cur_region: regionRef(target),
        previous_region: regionRef(settled.region),
        settled: settled.settled,
        state_version: player.stateVersion,
        started_at: settled.now,
      };
    });
  }

  /** 트랜잭션이 연결을 쥐고 있으므로 같은 manager 로 읽어야 풀이 고갈되지 않습니다. */
  private async lockedError(
    manager: EntityManager,
    target: Region,
    userId: number,
  ): Promise<GameError> {
    const previous = await manager
      .createQueryBuilder(Region, 'r')
      .where('r.sortOrder < :order', { order: target.sortOrder })
      .orderBy('r.sortOrder', 'DESC')
      .getOne();
    if (!previous) {
      return new GameError(ErrorCode.REGION_LOCKED);
    }
    const product = await manager.findOneByOrFail(RegionProduct, {
      regionId: previous.id,
    });
    const logbook = await manager.findOneBy(Logbook, {
      userId,
      regionId: previous.id,
    });
    return new GameError(ErrorCode.REGION_LOCKED, {
      unlock_region: { id: previous.id, name: previous.name },
      required_pieces: product.requiredPieces,
      current_pieces: logbook?.curCollect ?? 0,
    });
  }
}

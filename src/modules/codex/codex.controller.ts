import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import {
  collectState,
  imageUrl,
  regionRef,
  regionStatus,
  SILHOUETTE_IMG_PATH,
} from '../../common/views';
import {
  Logbook,
  Region,
  RegionProduct,
  ShopProduct,
  User,
  UserRegionUnlock,
} from '../../database/entities';
import { CodexQueryDto } from './dto/codex-query.dto';

@Controller('codex')
export class CodexController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @ApiEndpoint(DOCS.listCodex)
  @Get()
  async list(@CurrentUser() auth: AuthUser, @Query() query: CodexQueryDto) {
    const context = await this.loadContext(auth.id);
    if (
      query.region_id !== undefined &&
      !context.regions.some((region) => region.id === query.region_id)
    ) {
      throw new GameError(ErrorCode.REGION_NOT_FOUND);
    }
    const regions = context.regions.filter(
      (region) =>
        query.region_id === undefined || region.id === query.region_id,
    );
    const items = regions.flatMap((region) => {
      const product = context.products.find((p) => p.regionId === region.id);
      return product ? [this.itemView(product, region, context)] : [];
    });
    return {
      summary: {
        total: items.length,
        discovered: items.filter((item) => item.state !== 'UNDISCOVERED')
          .length,
        completed: items.filter((item) => item.state === 'COMPLETED').length,
      },
      items,
    };
  }

  @ApiEndpoint(DOCS.getCodex)
  @Get(':specialty_id')
  async detail(
    @CurrentUser() auth: AuthUser,
    @Param('specialty_id', ParseIntPipe) specialtyId: number,
  ) {
    const context = await this.loadContext(auth.id);
    const product = context.products.find((p) => p.id === specialtyId);
    const index = context.regions.findIndex(
      (region) => region.id === product?.regionId,
    );
    if (!product || index < 0) {
      throw new GameError(ErrorCode.SPECIALTY_NOT_FOUND);
    }
    const region = context.regions[index];
    const item = this.itemView(product, region, context);
    const discovered = item.state !== 'UNDISCOVERED';
    const logbook = context.logbooks.find((l) => l.regionId === region.id);
    const next = context.regions[index + 1];
    const products = await this.dataSource.manager.find(ShopProduct, {
      where: { regionProductId: product.id },
      order: { id: 'ASC' },
    });
    return {
      ...item,
      description: discovered ? product.description : null,
      source: discovered ? product.detailLink : null,
      completed_at: logbook?.completedAt ?? null,
      unlocks_region: next ? regionRef(next) : null,
      products: products.map((shop) => ({
        id: shop.id,
        name: shop.name,
        status: shop.status,
        image_url: imageUrl(this.config, shop.imgPath),
      })),
    };
  }

  private itemView(
    product: RegionProduct,
    region: Region,
    context: Awaited<ReturnType<CodexController['loadContext']>>,
  ) {
    const pieces =
      context.logbooks.find((l) => l.regionId === region.id)?.curCollect ?? 0;
    const state = collectState(pieces, product.requiredPieces);
    return {
      id: product.id,
      name: product.name,
      region: {
        ...regionRef(region),
        status: regionStatus(
          region.id,
          context.user.curRegionId,
          context.unlockedIds,
        ),
      },
      state,
      pieces,
      required_pieces: product.requiredPieces,
      image_url: imageUrl(
        this.config,
        state === 'UNDISCOVERED' ? SILHOUETTE_IMG_PATH : product.imgPath,
      ),
    };
  }

  private async loadContext(userId: number) {
    const manager = this.dataSource.manager;
    const user = await manager.findOneByOrFail(User, { id: userId });
    const regions = await manager.find(Region, {
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    const products = await manager.find(RegionProduct);
    const logbooks = await manager.findBy(Logbook, { userId });
    const unlocks = await manager.findBy(UserRegionUnlock, { userId });
    return {
      user,
      regions,
      products,
      logbooks,
      unlockedIds: new Set(unlocks.map((unlock) => unlock.regionId)),
    };
  }
}

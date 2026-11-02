import {
  Controller,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { ApiEndpoint, DOCS } from '../../common/api-docs';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { imageUrl, regionRef } from '../../common/views';
import { Region, RegionProduct, ShopProduct } from '../../database/entities';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  region_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  specialty_id?: number;
}

@Controller('products')
export class ProductController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @ApiEndpoint(DOCS.listProducts)
  @Get()
  async list(@Query() query: ProductQueryDto) {
    const manager = this.dataSource.manager;
    const regions = await manager.findBy(Region, { isActive: true });
    const regionOf = new Map(regions.map((region) => [region.id, region]));
    if (query.region_id !== undefined && !regionOf.has(query.region_id)) {
      throw new GameError(ErrorCode.REGION_NOT_FOUND);
    }
    if (query.specialty_id !== undefined) {
      const specialty = await manager.findOneBy(RegionProduct, {
        id: query.specialty_id,
      });
      if (!specialty || !regionOf.has(specialty.regionId)) {
        throw new GameError(ErrorCode.SPECIALTY_NOT_FOUND);
      }
    }
    const products = await manager.find(ShopProduct, {
      where: {
        ...(query.region_id !== undefined && { regionId: query.region_id }),
        ...(query.specialty_id !== undefined && {
          regionProductId: query.specialty_id,
        }),
      },
      order: { status: 'ASC', id: 'ASC' }, // ACTIVE 가 PREPARING 보다 먼저 옵니다.
    });
    return {
      items: products
        .filter((product) => regionOf.has(product.regionId))
        .map((product) =>
          this.summary(product, regionOf.get(product.regionId) as Region),
        ),
    };
  }

  @ApiEndpoint(DOCS.getProduct)
  @Get(':product_id')
  async detail(@Param('product_id', ParseIntPipe) productId: number) {
    const manager = this.dataSource.manager;
    const product = await manager.findOneBy(ShopProduct, { id: productId });
    const region =
      product &&
      (await manager.findOneBy(Region, {
        id: product.regionId,
        isActive: true,
      }));
    if (!product || !region) {
      throw new GameError(ErrorCode.PRODUCT_NOT_FOUND);
    }
    const externalUrl = product.status === 'ACTIVE' ? product.detailLink : null;
    return {
      ...this.summary(product, region),
      description: product.description,
      external_url: externalUrl,
      link_available: externalUrl !== null,
      updated_at: product.updatedAt,
    };
  }

  private summary(product: ShopProduct, region: Region) {
    return {
      id: product.id,
      name: product.name,
      image_url: imageUrl(this.config, product.imgPath),
      region: regionRef(region),
      specialty_id: product.regionProductId,
      seller_name: product.sellerName,
      price: product.price,
      status: product.status,
    };
  }
}

@Module({ controllers: [ProductController] })
export class ProductModule {}

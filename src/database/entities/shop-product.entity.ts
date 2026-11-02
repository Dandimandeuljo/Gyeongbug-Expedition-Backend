import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RegionProduct } from './region-product.entity';
import { Region } from './region.entity';

@Entity('shop_product')
@Index('ix_shop_product_region_status', ['regionId', 'status'])
@Index('ix_shop_product_region_product', ['regionProductId'])
@Check('ck_shop_product_price_nonneg', '"price" >= 0')
@Check(
  'ck_shop_product_detail_link_https',
  `"detail_link" ~ '^https://[^/\\s]+'`,
)
@Check('ck_shop_product_status', `"status" IN ('ACTIVE', 'PREPARING')`)
@Check(
  'ck_shop_product_active_link',
  `"status" = 'PREPARING' OR "detail_link" IS NOT NULL`,
)
export class ShopProduct {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id!: number;

  @Column({ type: 'int' })
  regionId!: number;

  @ManyToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ type: 'int', nullable: true })
  regionProductId!: number | null;

  @ManyToOne(() => RegionProduct, { nullable: true })
  @JoinColumn({ name: 'region_product_id' })
  regionProduct?: RegionProduct | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imgPath!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sellerName!: string | null;

  @Column({ type: 'int', nullable: true })
  price!: number | null;

  /** 외부 판매처. API 의 external_url 입니다. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  detailLink!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PREPARING' })
  status!: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

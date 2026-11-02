import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { Region } from './region.entity';

/** 도감 특산물. 지역당 1개이며 판매 상품은 ShopProduct 입니다. */
@Entity('region_product')
@Check('ck_region_product_required_pieces_pos', '"required_pieces" > 0')
export class RegionProduct {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'int' })
  regionId!: number;

  @OneToOne(() => Region, { nullable: false })
  @JoinColumn({ name: 'region_id' })
  region?: Region;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imgPath!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  originArea!: string | null;

  /** 소개 출처. API 의 source 이며 판매처 링크가 아닙니다. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  detailLink!: string | null;

  @Column({ type: 'int', default: 20 })
  requiredPieces!: number;
}

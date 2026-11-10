import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RegionProduct } from './region-product.entity';

/** 공공데이터에서 하루 한 번 모아 둔 특산물 시세입니다. 챗봇은 이 표의 값만 답합니다. */
@Entity('specialty_price')
@Check('ck_specialty_price_kind', `"kind" IN ('RETAIL', 'NATIONAL', 'AUCTION')`)
@Check('ck_specialty_price_positive', '"price" > 0')
@Index('ux_specialty_price_row', ['regionProductId', 'kind', 'area', 'label'], {
  unique: true,
})
export class SpecialtyPrice {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' })
  id!: number;

  @Column({ type: 'int' })
  regionProductId!: number;

  @ManyToOne(() => RegionProduct, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'region_product_id',
    foreignKeyConstraintName: 'fk_specialty_price_region_product',
  })
  regionProduct?: RegionProduct;

  /** RETAIL 지역 소매가, NATIONAL 전국 평균과 1년 전 값, AUCTION 경북 산지 도매 경매가 */
  @Column({ type: 'varchar', length: 20 })
  kind!: string;

  @Column({ type: 'varchar', length: 30 })
  area!: string;

  @Column({ type: 'varchar', length: 50 })
  label!: string;

  @Column({ type: 'varchar', length: 20 })
  unit!: string;

  @Column({ type: 'int' })
  price!: number;

  @Column({ type: 'int', nullable: true })
  yearAgoPrice!: number | null;

  @Column({ type: 'date' })
  surveyDate!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  collectedAt!: Date;
}

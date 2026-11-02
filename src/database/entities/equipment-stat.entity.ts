import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('equipment_stat')
@Check('ck_equipment_stat_stat', `"stat" IN ('GOLD_BONUS')`)
export class EquipmentStat {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 30 })
  stat!: string;

  /** 강화 단계당 가산 %p */
  @Column({ type: 'int' })
  ratio!: number;
}

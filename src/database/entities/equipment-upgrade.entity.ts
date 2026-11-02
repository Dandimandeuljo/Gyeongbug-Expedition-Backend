import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('equipment_upgrade')
@Check('ck_equipment_upgrade_target', '"upgrade" BETWEEN 2 AND 5')
@Check('ck_equipment_upgrade_cost_pos', '"cost" > 0')
@Check('ck_equipment_upgrade_level', '"required_level" BETWEEN 1 AND 20')
export class EquipmentUpgrade {
  /** 목표 단계 */
  @PrimaryColumn({ type: 'int' })
  upgrade!: number;

  @Column({ type: 'int' })
  cost!: number;

  @Column({ type: 'int' })
  requiredLevel!: number;
}

import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { EquipmentStat } from './equipment-stat.entity';
import { Equipment } from './equipment.entity';

@Entity('equipment_stat_set')
export class EquipmentStatSet {
  @PrimaryColumn({ type: 'int' })
  equipmentId!: number;

  @ManyToOne(() => Equipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipment_id' })
  equipment?: Equipment;

  @PrimaryColumn({ type: 'int' })
  equipmentStatId!: number;

  @ManyToOne(() => EquipmentStat)
  @JoinColumn({ name: 'equipment_stat_id' })
  equipmentStat?: EquipmentStat;
}

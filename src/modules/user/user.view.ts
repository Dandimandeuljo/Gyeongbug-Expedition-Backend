import type { Equipment, EquipmentUpgrade } from '../../database/entities';

export function equipmentView(
  equipment: Equipment,
  statRatio: number,
  next: EquipmentUpgrade | null,
) {
  return {
    stage: equipment.curUpgrade,
    gold_bonus_percent: statRatio * (equipment.curUpgrade - 1),
    next_upgrade_cost: next?.cost ?? null,
    next_required_level: next?.requiredLevel ?? null,
  };
}

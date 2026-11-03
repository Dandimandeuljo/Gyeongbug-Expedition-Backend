import type { Equipment, EquipmentUpgrade } from '../../database/entities';

export type UpgradeBlocker = 'MAX_STAGE' | 'GOLD' | 'LEVEL';

/** 미리보기와 실제 정산 결과에 같은 강화 조건을 적용합니다. */
export function upgradeBlockers(
  equipment: Pick<Equipment, 'curUpgrade' | 'maxUpgrade'>,
  next: Pick<EquipmentUpgrade, 'cost' | 'requiredLevel'> | null,
  player: { gold: number; level: number },
): UpgradeBlocker[] {
  if (equipment.curUpgrade >= equipment.maxUpgrade || !next) {
    return ['MAX_STAGE'];
  }

  const blockers: UpgradeBlocker[] = [];
  if (player.gold < next.cost) {
    blockers.push('GOLD');
  }
  if (player.level < next.requiredLevel) {
    blockers.push('LEVEL');
  }
  return blockers;
}

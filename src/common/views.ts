import type { ConfigService } from '@nestjs/config';
import type { Region, User } from '../database/entities';
import {
  expToNextLevel,
  levelExp,
  levelExpRequired,
} from '../modules/settlement/level';

/** 미발견 특산물에 쓰는 공용 실루엣 파일. STATIC_ROOT 기준 상대 경로입니다. */
export const SILHOUETTE_IMG_PATH = 'silhouette.png';

export function regionCode(region: Pick<Region, 'sortOrder'>): string {
  return `R${String(region.sortOrder).padStart(2, '0')}`;
}

export function regionRef(region: Region) {
  return { id: region.id, code: regionCode(region), name: region.name };
}

export function progressView(user: User) {
  return {
    gold: user.gold,
    level: user.level,
    exp: user.exp,
    exp_to_next_level: expToNextLevel(user.exp),
    level_exp: levelExp(user.exp),
    level_exp_required: levelExpRequired(user.exp),
  };
}

export function imageUrl(
  config: ConfigService,
  path: string | null,
): string | null {
  if (!path) {
    return null;
  }
  const base = config.getOrThrow<string>('PUBLIC_BASE_URL');
  return `${base.replace(/\/$/, '')}/static/${path}`;
}

export type RegionStatus = 'CURRENT' | 'UNLOCKED' | 'LOCKED';

export function regionStatus(
  regionId: number,
  curRegionId: number,
  unlockedRegionIds: ReadonlySet<number>,
): RegionStatus {
  if (regionId === curRegionId) {
    return 'CURRENT';
  }
  return unlockedRegionIds.has(regionId) ? 'UNLOCKED' : 'LOCKED';
}

/** 비활성 지역은 이동할 수 없으므로, 현재 지역이 아니면 해금 기록이 있어도 LOCKED 로 보여 줍니다. */
export function visibleRegionStatus(
  region: Pick<Region, 'id' | 'isActive'>,
  curRegionId: number,
  unlockedRegionIds: ReadonlySet<number>,
): RegionStatus {
  if (!region.isActive && region.id !== curRegionId) {
    return 'LOCKED';
  }
  return regionStatus(region.id, curRegionId, unlockedRegionIds);
}

export type CollectState = 'UNDISCOVERED' | 'COLLECTING' | 'COMPLETED';

export function collectState(pieces: number, required: number): CollectState {
  if (pieces <= 0) {
    return 'UNDISCOVERED';
  }
  return pieces >= required ? 'COMPLETED' : 'COLLECTING';
}

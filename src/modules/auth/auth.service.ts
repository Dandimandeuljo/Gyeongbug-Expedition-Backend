import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GameError } from '../../common/errors/game-error';
import { dbNow } from '../../common/time/db-clock';
import {
  Equipment,
  EquipmentStat,
  EquipmentStatSet,
  IdleReward,
  Logbook,
  Region,
  RegionProduct,
  User,
  UserRegionUnlock,
} from '../../database/entities';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly users: UserService,
  ) {}

  async createUser(name: string) {
    let userId: number;
    try {
      userId = await this.dataSource.transaction(async (manager) => {
        const now = await dbNow(manager);
        const region = await manager
          .createQueryBuilder(Region, 'r')
          .orderBy('r.sortOrder', 'ASC')
          .getOneOrFail();
        const product = await manager.findOneByOrFail(RegionProduct, {
          regionId: region.id,
        });
        const stat = await manager.findOneByOrFail(EquipmentStat, {
          stat: 'GOLD_BONUS',
        });
        const user = await manager.save(
          manager.create(User, { name, curRegionId: region.id }),
        );
        await manager.insert(IdleReward, {
          userId: user.id,
          recentReceive: now,
        });
        const equipment = await manager.save(
          manager.create(Equipment, { userId: user.id }),
        );
        await manager.insert(EquipmentStatSet, {
          equipmentId: equipment.id,
          equipmentStatId: stat.id,
        });
        await manager.insert(UserRegionUnlock, {
          userId: user.id,
          regionId: region.id,
          unlockedAt: now,
        });
        await manager.insert(Logbook, {
          userId: user.id,
          regionId: region.id,
          regionProductId: product.id,
        });
        return user.id;
      });
    } catch (error) {
      const driverError = (
        error as QueryFailedError<Error & { constraint?: string }>
      ).driverError;
      if (
        error instanceof QueryFailedError &&
        driverError?.constraint === 'ux_users_name_lower'
      ) {
        throw new GameError(ErrorCode.NAME_DUPLICATED);
      }
      throw error;
    }
    return {
      jwt: await this.sign(userId),
      user: await this.users.view(userId),
    };
  }

  async refresh(userId: number) {
    return { jwt: await this.sign(userId) };
  }

  private sign(userId: number): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }
}

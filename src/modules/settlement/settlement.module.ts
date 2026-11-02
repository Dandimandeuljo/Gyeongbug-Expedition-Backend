import { Global, Module } from '@nestjs/common';
import { cryptoRng } from './rng';
import { SETTLEMENT_RNG, SettlementService } from './settlement.service';

@Global()
@Module({
  providers: [
    { provide: SETTLEMENT_RNG, useValue: cryptoRng },
    SettlementService,
  ],
  exports: [SettlementService],
})
export class SettlementModule {}

import { Module } from '@nestjs/common';

import { ChargesController } from './charges.controller';
import { ChargesService } from './charges.service';
import { FakePaymentProvider } from './fake-payment-provider';
import { InMemoryChargeRepository } from './in-memory-charge.repository';

@Module({
  controllers: [ChargesController],
  providers: [ChargesService, InMemoryChargeRepository, FakePaymentProvider],
})
export class ChargesModule {}

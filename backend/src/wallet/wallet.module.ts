import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Wallet } from './wallet.entity.js';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';

@Module({
  imports: [MikroOrmModule.forFeature([Wallet])],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

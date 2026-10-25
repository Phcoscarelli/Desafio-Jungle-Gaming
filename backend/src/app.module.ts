import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Wallet } from "./wallet/wallet.entity.js";
import { WalletLedgerEntry } from "./ledger/wallet-ledger-entry.entity.js";
import { WagerTransaction } from "./wager/wager-transaction.entity.js";
import { WalletModule } from "./wallet/wallet.module.js";
import { WagerModule } from "./wager/wager.module.js";
import { MessagingModule } from "./messaging/messaging.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        host: config.get<string>("DATABASE_HOST") ?? "localhost",
        port: Number(config.get<string>("DATABASE_PORT") ?? 5433),
        user: config.get<string>("DATABASE_USER") ?? "jungle",
        password: config.get<string>("DATABASE_PASSWORD") ?? "jungle_dev",
        dbName: config.get<string>("DATABASE_NAME") ?? "jungle_challenge",
        entities: [Wallet, WalletLedgerEntry, WagerTransaction],
      }),
    }),
    WalletModule,
    WagerModule,
    MessagingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

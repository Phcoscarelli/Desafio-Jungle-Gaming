import 'reflect-metadata';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { Wallet } from './src/wallet/wallet.entity.js';
import { WalletLedgerEntry } from './src/ledger/wallet-ledger-entry.entity.js';
import { WagerTransaction } from './src/wager/wager-transaction.entity.js';

export default defineConfig({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5433),
  user: process.env.DATABASE_USER ?? 'jungle',
  password: process.env.DATABASE_PASSWORD ?? 'jungle_dev',
  dbName: process.env.DATABASE_NAME ?? 'jungle_challenge',

  entities: [Wallet, WalletLedgerEntry, WagerTransaction],

  extensions: [Migrator],

  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    emit: 'ts',
  },
  
});
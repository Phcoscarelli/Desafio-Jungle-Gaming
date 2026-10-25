import { Migration } from '@mikro-orm/migrations';

export class Migration20261024140051_initial_financial_schema extends Migration {

  override name = 'Migration20261024140051_initial_financial_schema';


  override up(): void {
    this.addSql(`
      create table "wallets" (
        "id" uuid not null primary key,
        "player_id" varchar(255) not null,
        "currency" varchar(3) not null,
        "balance" numeric(20,2) not null,
        "version" integer not null default 1,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "wallet_balance_nonnegative" check ("balance" >= 0),
        constraint "wallet_version_positive" check ("version" >= 1),
        constraint "wallet_player_currency_unique" unique ("player_id", "currency")
      );
    `);

    this.addSql(`
      create table "wager_transactions" (
        "id" uuid not null primary key,
        "provider" varchar(255) not null,
        "external_transaction_id" varchar(255) not null,
        "player_id" varchar(255) not null,
        "currency" varchar(3) not null,
        "type" varchar(255) not null,
        "status" varchar(255) not null default 'PENDING',
        "amount" numeric(20,2) not null,
        "original_transaction_id" varchar(255),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "wager_amount_positive" check ("amount" > 0),
        constraint "wager_provider_external_unique"
          unique ("provider", "external_transaction_id")
      );
    `);

    this.addSql(`
      create table "wallet_ledger_entries" (
        "id" uuid not null primary key,
        "wallet_id" uuid not null,
        "transaction_id" uuid not null,
        "direction" varchar(255) not null,
        "amount" numeric(20,2) not null,
        "currency" varchar(3) not null,
        "balance_before" numeric(20,2) not null,
        "balance_after" numeric(20,2) not null,
        "created_at" timestamptz not null,
        constraint "ledger_amount_positive" check ("amount" > 0),
        constraint "ledger_balances_nonnegative"
          check ("balance_before" >= 0 and "balance_after" >= 0),
        constraint "ledger_wallet_fk"
          foreign key ("wallet_id") references "wallets" ("id"),
        constraint "ledger_transaction_fk"
          foreign key ("transaction_id") references "wager_transactions" ("id"),
        constraint "ledger_wallet_transaction_unique"
          unique ("wallet_id", "transaction_id")
      );
    `);

    this.addSql(`
      create function prevent_ledger_mutation()
      returns trigger as $$
      begin
        raise exception 'Ledger entries are immutable';
      end;
      $$ language plpgsql;
    `);

    this.addSql(`
      create trigger ledger_immutable_trigger
      before update or delete on "wallet_ledger_entries"
      for each row execute function prevent_ledger_mutation();
    `);
  }

  override down(): void {
    this.addSql(`drop table if exists "wallet_ledger_entries";`);
    this.addSql(`drop function if exists prevent_ledger_mutation();`);
    this.addSql(`drop table if exists "wager_transactions";`);
    this.addSql(`drop table if exists "wallets";`);
  }
}

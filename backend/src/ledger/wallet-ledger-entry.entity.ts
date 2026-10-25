import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/legacy";

export enum LedgerDirection {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

@Entity({ tableName: "wallet_ledger_entries" })
@Unique({ properties: ["walletId", "transactionId"] })
export class WalletLedgerEntry {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  walletId!: string;

  @Property({ type: "uuid" })
  transactionId!: string;

  @Property({ type: "string" })
  direction!: LedgerDirection;

  @Property({ type: "decimal", precision: 20, scale: 2 })
  amount!: string;

  @Property({ type: "string", length: 3 })
  currency!: string;

  @Property({ type: "decimal", precision: 20, scale: 2 })
  balanceBefore!: string;

  @Property({ type: "decimal", precision: 20, scale: 2 })
  balanceAfter!: string;

  @Property({ type: "datetime", onCreate: () => new Date() })
  createdAt: Date = new Date();
}

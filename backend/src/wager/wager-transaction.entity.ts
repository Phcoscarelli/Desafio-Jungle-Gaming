import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

export enum WagerTransactionType {
  BET = 'BET',
  WIN = 'WIN',
  ROLLBACK = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

@Entity({ tableName: 'wager_transactions' })
@Unique({ properties: ['provider', 'externalTransactionId'] })
export class WagerTransaction {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'string' })
  provider!: string;

  @Property({ type: 'string' })
  externalTransactionId!: string;

  @Property({ type: 'string' })
  playerId!: string;

  @Property({ type: 'string', length: 3 })
  currency!: string;

  @Property({ type: 'string' })
  type!: WagerTransactionType;

  @Property({ type: 'string' })
  status: WagerTransactionStatus = WagerTransactionStatus.PENDING;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  amount!: string;

  @Property({ type: 'string', nullable: true })
  originalTransactionId?: string;

  @Property({ type: 'datetime', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({
    type: 'datetime',
    onCreate: () => new Date(),
    onUpdate: () => new Date(),
  })
  updatedAt: Date = new Date();
}
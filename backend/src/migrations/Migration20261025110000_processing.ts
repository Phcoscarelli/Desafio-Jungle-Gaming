import { Migration } from '@mikro-orm/migrations';
export class Migration20261025110000_processing extends Migration {
 override up():void {
  this.addSql(`alter table wager_transactions add column wallet_id uuid, add column round_id varchar(255), add column game_id varchar(255), add column idempotency_key varchar(255), add column payload_hash varchar(64), add column reference_transaction_id uuid, add column failure_code varchar(80), add column processed_at timestamptz, add column result_balance numeric(20,2), add column attempts integer not null default 0, add column next_attempt_at timestamptz;`);
  this.addSql(`alter table wager_transactions add constraint wager_wallet_fk foreign key (wallet_id) references wallets(id);`);
  this.addSql(`create unique index wager_idempotency_unique on wager_transactions(idempotency_key) where idempotency_key is not null;`);
  this.addSql(`create unique index wager_single_reversal on wager_transactions(reference_transaction_id,type) where reference_transaction_id is not null and status='PROCESSED' and type in ('REFUND','ROLLBACK');`);
  this.addSql(`create index wager_pending_reference_idx on wager_transactions(next_attempt_at) where status='PENDING_REFERENCE';`);
  this.addSql(`create table inbox_messages (consumer_name varchar(100) not null, message_id varchar(255) not null, payload_hash varchar(64) not null, received_at timestamptz not null, processed_at timestamptz, primary key(consumer_name,message_id));`);
  this.addSql(`create table outbox_messages (id uuid primary key,aggregate_id uuid not null,event_type varchar(100) not null,payload jsonb not null,occurred_at timestamptz not null,attempts integer not null default 0,next_attempt_at timestamptz,published_at timestamptz);`);
  this.addSql(`create index outbox_due_idx on outbox_messages(next_attempt_at,occurred_at) where published_at is null;`);
 }
 override down():void {
  this.addSql('drop table outbox_messages;');
  this.addSql('drop table inbox_messages;');
  this.addSql('drop index wager_pending_reference_idx;');
  this.addSql('drop index wager_single_reversal;');
  this.addSql('drop index wager_idempotency_unique;');
  this.addSql('alter table wager_transactions drop constraint wager_wallet_fk;');
  this.addSql('alter table wager_transactions drop column wallet_id,drop column round_id,drop column game_id,drop column idempotency_key,drop column payload_hash,drop column reference_transaction_id,drop column failure_code,drop column processed_at,drop column result_balance,drop column attempts,drop column next_attempt_at;');
 }
}

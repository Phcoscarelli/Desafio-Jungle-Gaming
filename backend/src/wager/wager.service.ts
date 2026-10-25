import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { hash } from '../common/hash.js';
import { cents, decimal, money, type MoneyDto } from '../common/money.js';
import { one, rows } from '../common/database.js';
export type Kind='BET'|'WIN'|'LOSS'|'REFUND'|'ROLLBACK';
export interface WagerInput { providerId:string; externalTransactionId:string; playerId:string; walletId:string; roundId:string; gameId:string; kind:Kind; money:MoneyDto; referenceExternalTransactionId?:string }
interface WalletRow {id:string;player_id:string;currency:string;balance:string;version:number}
interface TxRow {id:string;provider:string;external_transaction_id:string;idempotency_key:string;payload_hash:string;wallet_id:string;player_id:string;round_id:string;game_id:string;type:Kind;status:string;amount:string;currency:string;original_transaction_id:string|null;failure_code:string|null;result_balance:string|null;reference_transaction_id:string|null;attempts:number}
function response(t:TxRow, replay:boolean) {return {transactionId:t.id,status:t.status,balance:t.result_balance===null?null:{amount:t.result_balance,currency:t.currency},failureCode:t.failure_code??undefined,idempotentReplay:replay};}
function validate(input:WagerInput,key:string) {
 if(!input || typeof input!=='object') throw new BadRequestException('Invalid payload');
 for(const field of ['providerId','externalTransactionId','playerId','walletId','roundId','gameId'] as const) if(typeof input[field]!=='string'||!input[field].trim()) throw new BadRequestException(`${field} required`);
 if(!['BET','WIN','LOSS','REFUND','ROLLBACK'].includes(input.kind)) throw new BadRequestException('Invalid kind');
 if(typeof key!=='string'||!key.trim()) throw new BadRequestException('Idempotency-Key header required');
 money(input.money);
 if(['REFUND','ROLLBACK'].includes(input.kind) && !input.referenceExternalTransactionId) throw new BadRequestException('Reference required');
 if(input.kind==='BET' && input.referenceExternalTransactionId) throw new BadRequestException('BET cannot reference another transaction');
}
@Injectable()
export class WagerService {
 constructor(private readonly em:EntityManager) {}
 async submit(input:WagerInput,key:string, messageId?:string) {
  validate(input,key);
  const digest=hash(input);
  // Unique constraints handle retries across multiple instances, not in-memory state.
  return this.em.transactional(async tx=>{
   // A wallet row lock serializes operations only for this wallet.
   const wallet=await one<WalletRow>(tx,'select * from wallets where id=? for update',[input.walletId]);
   if(!wallet) throw new NotFoundException('Wallet not found');
   if(wallet.player_id!==input.playerId||wallet.currency!==input.money.currency) throw new ConflictException('Wallet/player/currency mismatch');
   const existing=await one<TxRow>(tx,'select * from wager_transactions where idempotency_key=? or (provider=? and external_transaction_id=?) for update',[key,input.providerId,input.externalTransactionId]);
   if(existing){if(existing.payload_hash!==digest||existing.idempotency_key!==key) throw new ConflictException('Idempotency key or external ID reused with different payload');if(messageId) await this.inbox(tx,messageId,digest);return response(existing,true);}
   const id=randomUUID();
   const inserted=await one<TxRow>(tx,`insert into wager_transactions (id,provider,external_transaction_id,player_id,currency,type,status,amount,original_transaction_id,created_at,updated_at,wallet_id,round_id,game_id,idempotency_key,payload_hash,attempts) values (?,?,?,?,?,?,'PENDING',?,?,now(),now(),?,?,?,?,?,0) returning *`,[id,input.providerId,input.externalTransactionId,input.playerId,input.money.currency,input.kind,input.money.amount,input.referenceExternalTransactionId??null,input.walletId,input.roundId,input.gameId,key,digest]);
   if(!inserted) throw new Error('Insert failed');
   if(messageId) await this.inbox(tx,messageId,digest);
   const result=await this.apply(tx,inserted,wallet);
   return response(result,false);
  });
 }
 private async inbox(tx:EntityManager,messageId:string,digest:string){
  const previous=await one<{payload_hash:string}>(tx,`select payload_hash from inbox_messages where consumer_name='wager-consumer' and message_id=?`,[messageId]);
  if(previous && previous.payload_hash!==digest)throw new ConflictException('Inbox ID reused with different payload');
  if(!previous)await rows(tx,`insert into inbox_messages(consumer_name,message_id,payload_hash,received_at,processed_at) values('wager-consumer',?,?,now(),now()) on conflict do nothing`,[messageId,digest]);
 }
 private async event(tx:EntityManager, t:TxRow, name:string, data:Record<string,unknown>) {
  await rows(tx,`insert into outbox_messages (id,aggregate_id,event_type,payload,occurred_at,attempts) values (?,?,?,?::jsonb,now(),0)`,[randomUUID(),t.wallet_id,name,JSON.stringify({eventType:name,transactionId:t.id,walletId:t.wallet_id,providerId:t.provider,data})]);
 }
 private async apply(tx:EntityManager,t:TxRow,w:WalletRow):Promise<TxRow> {
  let direction:'DEBIT'|'CREDIT'|null=null;
  let reference:TxRow|undefined;
  if(t.type==='BET') direction='DEBIT';
  if(t.type==='WIN') direction='CREDIT';
  if(t.type==='REFUND'||t.type==='ROLLBACK') {
   reference=await one<TxRow>(tx,`select * from wager_transactions where provider=? and external_transaction_id=?`,[t.provider,t.original_transaction_id]);
   if(!reference || reference.status==='PENDING' || reference.status==='PENDING_REFERENCE') {
    const updated=await one<TxRow>(tx,`update wager_transactions set status='PENDING_REFERENCE',attempts=attempts+1,next_attempt_at=now()+interval '10 seconds',updated_at=now() where id=? returning *`,[t.id]);
    await this.event(tx,t,'WagerTransactionPendingReference',{});
    return updated!;
   }
   if(reference.status!=='PROCESSED') return this.reject(tx,t,'REFERENCE_NOT_PROCESSED',w.balance);
   if(reference.wallet_id!==t.wallet_id||reference.player_id!==t.player_id||reference.round_id!==t.round_id||reference.currency!==t.currency) return this.reject(tx,t,'REFERENCE_MISMATCH',w.balance);
   if(t.type==='REFUND' && reference.type!=='BET') return this.reject(tx,t,'INVALID_REFERENCE_KIND',w.balance);
   if(t.type==='ROLLBACK' && !['BET','WIN','REFUND'].includes(reference.type)) return this.reject(tx,t,'INVALID_REFERENCE_KIND',w.balance);
   if(cents(t.amount)!==cents(reference.amount)) return this.reject(tx,t,'AMOUNT_MISMATCH',w.balance);
   const reversed=await one<{id:string}>(tx,`select id from wager_transactions where reference_transaction_id=? and type=? and status='PROCESSED' limit 1`,[reference.id,t.type]);
   if(reversed) return this.reject(tx,t,'ALREADY_REVERSED',w.balance);
   direction=t.type==='REFUND'?'CREDIT':reference.type==='BET'?'CREDIT':'DEBIT';
  }
  const current=cents(w.balance,true);
  const amount=cents(t.amount);
  const next=direction==='CREDIT'?current+amount:direction==='DEBIT'?current-amount:current;
  if(next<0n) return this.reject(tx,t,t.type==='BET'?'INSUFFICIENT_FUNDS':'REVERSAL_INSUFFICIENT_FUNDS',w.balance);
  if(direction) {
   await rows(tx,`update wallets set balance=?,version=version+1,updated_at=now() where id=?`,[decimal(next),w.id]);
   await rows(tx,`insert into wallet_ledger_entries (id,wallet_id,transaction_id,direction,amount,currency,balance_before,balance_after,created_at) values (?,?,?,?,?,?,?,?,now())`,[randomUUID(),w.id,t.id,direction,t.amount,t.currency,w.balance,decimal(next)]);
  }
  const updated=await one<TxRow>(tx,`update wager_transactions set status='PROCESSED',reference_transaction_id=?,result_balance=?,processed_at=now(),updated_at=now() where id=? returning *`,[reference?.id??null,decimal(next),t.id]);
  await this.event(tx,t,'WagerTransactionProcessed',{status:'PROCESSED'});
  if(direction) await this.event(tx,t,'WalletBalanceChanged',{direction,amount:t.amount,currency:t.currency,balanceBefore:w.balance,balanceAfter:decimal(next)});
  return updated!;
 }
 private async reject(tx:EntityManager,t:TxRow,code:string,balance:string):Promise<TxRow>{
  const updated=await one<TxRow>(tx,`update wager_transactions set status='REJECTED',failure_code=?,result_balance=?,processed_at=now(),updated_at=now() where id=? returning *`,[code,balance,t.id]);
  await this.event(tx,t,'WagerTransactionRejected',{failureCode:code});
  return updated!;
 }
 async retryPending() {
  const due=await rows<{id:string}>(this.em,`select id from wager_transactions where status='PENDING_REFERENCE' and next_attempt_at<=now() order by next_attempt_at limit 20`);
  for(const item of due) await this.em.transactional(async tx=>{
   const peek=await one<TxRow>(tx,'select * from wager_transactions where id=?',[item.id]);
   if(!peek||peek.status!=='PENDING_REFERENCE')return;
   const w=await one<WalletRow>(tx,'select * from wallets where id=? for update',[peek.wallet_id]);if(!w)return;
   const t=await one<TxRow>(tx,'select * from wager_transactions where id=? for update',[item.id]);
   if(!t||t.status!=='PENDING_REFERENCE')return;
   if(t.attempts>=12){await this.reject(tx,t,'REFERENCE_NOT_FOUND',w.balance);return;}
   await this.apply(tx,t,w);
  });
 }
 async findById(id:string){const t=await one<TxRow>(this.em,'select * from wager_transactions where id=?',[id]);if(!t)throw new NotFoundException('Transaction not found');return {...response(t,false),kind:t.type,providerId:t.provider,externalTransactionId:t.external_transaction_id};}
 async findByProvider(provider:string,external:string){const t=await one<TxRow>(this.em,'select * from wager_transactions where provider=? and external_transaction_id=?',[provider,external]);if(!t)throw new NotFoundException('Transaction not found');return {...response(t,false),kind:t.type};}
}

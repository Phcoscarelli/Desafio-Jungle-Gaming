import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { cents, decimal, money, type MoneyDto } from '../common/money.js';
import { one, rows } from '../common/database.js';

interface WalletRow { id: string; player_id: string; currency: string; balance: string; version: number }
export interface LedgerRow { id: string; transaction_id: string; direction: string; amount: string; balance_before: string; balance_after: string; created_at: string }
export interface CreateWalletInput { playerId: string; initialBalance?: MoneyDto; currency?: string }
export function walletView(w: WalletRow) { return { id: w.id, playerId: w.player_id, balance: {amount: w.balance, currency: w.currency}, version: w.version }; }

@Injectable()
export class WalletService {
 constructor(private readonly em: EntityManager) {}
 async createWallet(input: CreateWalletInput) {
  if (typeof input?.playerId !== 'string' || !input.playerId.trim()) throw new BadRequestException('playerId is required');
  const initial = input.initialBalance ? money(input.initialBalance, true) : money({amount:'0.00',currency:input.currency ?? 'BRL'},true);
  const id=randomUUID();
  try {
   return await this.em.transactional(async tx => {
    const wallet = await one<WalletRow>(tx, `insert into wallets (id,player_id,currency,balance,version,created_at,updated_at) values (?,?,?, ?,1,now(),now()) returning *`, [id,input.playerId,initial.currency,initial.amount]);
    if (!wallet) throw new Error('Could not create wallet');
    if(cents(initial.amount,true)>0n) {
     const tid=randomUUID();
     await rows(tx, `insert into wager_transactions (id,provider,external_transaction_id,player_id,currency,type,status,amount,created_at,updated_at,wallet_id,round_id,game_id,idempotency_key,payload_hash,processed_at,result_balance) values (?,?,?,?,?,'OPENING','PROCESSED',?,now(),now(),?,'opening','opening',?,?,now(),?)`, [tid,'internal',`opening:${id}`,input.playerId,initial.currency,initial.amount,id,`opening:${id}`,`opening:${id}`,initial.amount]);
     await rows(tx, `insert into wallet_ledger_entries (id,wallet_id,transaction_id,direction,amount,currency,balance_before,balance_after,created_at) values (?,?,?,'CREDIT',?,?,0,?,now())`,[randomUUID(),id,tid,initial.amount,initial.currency,initial.amount]);
    }
    return walletView(wallet);
   });
  } catch (e) { if((e as {code?:string}).code==='23505') throw new ConflictException('Wallet already exists'); throw e; }
 }
 async findById(id:string) {const w=await one<WalletRow>(this.em,'select * from wallets where id=?',[id]);if(!w) throw new NotFoundException('Wallet not found');return walletView(w);}
 async findByPlayer(playerId:string,currency:string) {const w=await one<WalletRow>(this.em,'select * from wallets where player_id=? and currency=?',[playerId,currency]);if(!w) throw new NotFoundException('Wallet not found');return walletView(w);}
 async ledger(walletId:string,cursor?:string,limit=50) {
  await this.findById(walletId);
  const safeLimit=Math.min(Math.max(Number.isInteger(limit)?limit:50,1),100);
  const items=await rows<LedgerRow>(this.em,`select id,transaction_id,direction,amount,balance_before,balance_after,created_at from wallet_ledger_entries where wallet_id=? and (?::uuid is null or id < ?::uuid) order by id desc limit ?`,[walletId,cursor||null,cursor||null,safeLimit+1]);
  const page=items.slice(0,safeLimit);
  return { items:page, nextCursor:items.length>safeLimit ? page[page.length-1]?.id : null };
 }
 async reconcile(walletId:string) {
  const w=await one<WalletRow>(this.em,'select * from wallets where id=?',[walletId]);if(!w) throw new NotFoundException('Wallet not found');
  const entries=await rows<{direction:string;amount:string}>(this.em,'select direction,amount from wallet_ledger_entries where wallet_id=?',[walletId]);
  const sum=entries.reduce((v,e)=>v+(e.direction==='CREDIT'?1n:-1n)*cents(e.amount),0n);
  const stored=cents(w.balance,true); const diff=stored-sum;
  return {walletId,storedBalance:{amount:w.balance,currency:w.currency},calculatedBalance:{amount:decimal(sum),currency:w.currency},difference:{amount:decimal(diff),currency:w.currency},consistent:diff===0n,checkedEntries:entries.length};
 }
}

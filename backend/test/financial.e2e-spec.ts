import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';

describe('Financial API (requires docker compose and migrations)',()=>{
 let app:INestApplication;
 beforeAll(async()=>{process.env.SQS_ENABLED='false';const mod=await Test.createTestingModule({imports:[AppModule]}).compile();app=mod.createNestApplication();await app.init();},30000);
 afterAll(async()=>{await app?.close();});
 it('two simultaneous 80.00 bets on 100.00 leave 20.00 and one debit',async()=>{
  const playerId=randomUUID();
  const created=await request(app.getHttpServer()).post('/wallets').send({playerId,initialBalance:{amount:'100.00',currency:'BRL'}}).expect(201);
  const walletId=created.body.id as string;
  const makeBet=(externalTransactionId:string)=>request(app.getHttpServer()).post('/wagering/transactions').set('Idempotency-Key',externalTransactionId).send({providerId:'test-provider',externalTransactionId,playerId,walletId,roundId:'round-a',gameId:'game-a',kind:'BET',money:{amount:'80.00',currency:'BRL'}});
  const [a,b]=await Promise.all([makeBet(randomUUID()),makeBet(randomUUID())]);
  expect([a.body.status,b.body.status].sort()).toEqual(['PROCESSED','REJECTED']);
  const wallet=await request(app.getHttpServer()).get(`/wallets/${walletId}`).expect(200);
  expect(wallet.body.balance.amount).toBe('20.00');
  const ledger=await request(app.getHttpServer()).get(`/wallets/${walletId}/ledger`).expect(200);
  expect(ledger.body.items.filter((e:{direction:string})=>e.direction==='DEBIT')).toHaveLength(1);
  const reconcile=await request(app.getHttpServer()).post(`/wallets/${walletId}/reconciliation`).expect(201);
  expect(reconcile.body.consistent).toBe(true);
 });
 it('replays same key without duplicating balance changes',async()=>{
  const playerId=randomUUID();
  const created=await request(app.getHttpServer()).post('/wallets').send({playerId,initialBalance:{amount:'100.00',currency:'BRL'}}).expect(201);
  const key=randomUUID();const body={providerId:'test-provider',externalTransactionId:key,playerId,walletId:created.body.id,roundId:'round-b',gameId:'game-a',kind:'BET',money:{amount:'10.00',currency:'BRL'}};
  const first=await request(app.getHttpServer()).post('/wagering/transactions').set('Idempotency-Key',key).send(body).expect(201);
  const second=await request(app.getHttpServer()).post('/wagering/transactions').set('Idempotency-Key',key).send(body).expect(201);
  expect(first.body.transactionId).toBe(second.body.transactionId);
  expect(second.body.idempotentReplay).toBe(true);
  expect(second.body.balance.amount).toBe('90.00');
 });
});

# Distributed Wagering Processor

Implementação do desafio backend da Jungle Gaming usando NestJS, Bun, PostgreSQL, MikroORM e SQS (LocalStack).

## Executar no Windows (PowerShell)

```powershell
docker compose up -d
cd backend
Copy-Item .env.example .env
bun install
bun run db:migrate
bun run start:dev
```

Se você **já tem um `.env`**, não precisa substituí-lo: adicione somente `SQS_ENDPOINT=http://localhost:4566` e `SQS_ENABLED=true`.

**Importante:** use `bun run db:migrate` em um banco já inicializado: a migration antiga continua preservada e a nova adiciona as tabelas/colunas faltantes. Não execute `migration:fresh` ou `docker compose down -v`, pois esses comandos apagam dados.

## Exemplo rápido

```powershell
$wallet = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/wallets' -ContentType 'application/json' -Body '{"playerId":"player-demo","initialBalance":{"amount":"100.00","currency":"BRL"}}'
$wallet.id
$payload = @{ providerId='provider-a'; externalTransactionId='bet-001'; playerId='player-demo'; walletId=$wallet.id; roundId='round-1'; gameId='game-1'; kind='BET'; money=@{amount='25.00';currency='BRL'} } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/wagering/transactions' -Headers @{'Idempotency-Key'='provider-a:bet-001'} -ContentType 'application/json' -Body $payload
Invoke-RestMethod -Uri "http://localhost:3000/wallets/$($wallet.id)"
```

## Rotas

- `POST /wallets` — cria carteira e transação de abertura se houver saldo inicial.
- `GET /wallets/:walletId` — consulta carteira.
- `GET /wallets/:walletId/ledger?limit=50&cursor=...` — ledger paginado.
- `POST /wallets/:walletId/reconciliation` — confere saldo e lançamentos.
- `POST /wagering/transactions` — executa BET, WIN, LOSS, REFUND, ROLLBACK. Exige header `Idempotency-Key`.
- `GET /wagering/transactions/:id` — consulta por ID interno.
- `GET /providers/:providerId/wagering/transactions/:externalId` — consulta por ID externo.
- `POST /queue/transactions` — envia solicitação para a fila SQS.
- `GET /health/live`, `GET /health/ready` — saúde do processo e dependências.

## Testes

```powershell
cd backend
bun run test
bun run test:e2e
bun run typecheck
```

O teste e2e exige PostgreSQL iniciado e migrations aplicadas. Use IDs únicos; os testes não apagam dados.

## Observações

O serviço usa transações SQL do MikroORM, locks de linha por carteira e valores monetários em centavos (`bigint`) durante cálculos. Ledger é protegido contra UPDATE/DELETE por trigger PostgreSQL. A outbox é publicada por worker periódico e a inbox registra mensagens processadas. Veja `ARCHITECTURE.md` para decisões, limites e funcionalidades não finalizadas.

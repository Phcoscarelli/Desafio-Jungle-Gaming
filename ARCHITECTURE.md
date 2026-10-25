# Arquitetura e decisões

## Objetivo e escopo

Priorizei correção do saldo, idempotência, auditabilidade e uma implementação explicável em entrevista. A aplicação expõe endpoints HTTP síncronos e um caminho opcional de fila SQS. O código é uma implementação de desafio, não um sistema financeiro pronto para produção.

## Dinheiro

O contrato usa strings decimais com duas casas e moeda ISO de três letras. O módulo `money.ts` converte valores em centavos com `bigint`, sem ponto flutuante. PostgreSQL armazena `numeric(20,2)`. A moeda é validada contra a carteira.

## Concorrência

`EntityManager.transactional()` engloba operação, wallet, ledger e outbox. `SELECT ... FOR UPDATE` bloqueia **somente** a linha da wallet envolvida, inclusive entre instâncias diferentes. O lock serializa apostas concorrentes; uma segunda aposta de 80 sobre saldo 100 deve ser rejeitada depois que a primeira debita. O banco também aplica `CHECK(balance >= 0)`.

## Idempotência

Header `Idempotency-Key` obrigatório; índices únicos no banco para chave e `(provider,external_transaction_id)`. SHA-256 de JSON canônico com chaves ordenadas protege contra replay com payload diferente. O saldo retornado no replay é o saldo gravado no processamento original (`result_balance`).

## Ledger

Toda mudança de saldo gera uma linha imutável de ledger na mesma transação. A abertura positiva cria uma `OPENING` interna; `LOSS` não altera saldo. A trigger bloqueia alterações e exclusões de lançamentos. Reconciliação calcula o saldo somando créditos e débitos e não corrige divergências automaticamente.

## Reversões e referências fora de ordem

`REFUND` referencia apenas BET; `ROLLBACK` aceita BET/WIN/REFUND e aplica movimento inverso. Validam provider, carteira, jogador, moeda, rodada e valor. Índice parcial impede a mesma referência ser revertida duas vezes pelo mesmo tipo. Referências ausentes entram em `PENDING_REFERENCE` e worker tenta novamente; após 12 tentativas são rejeitadas com código estável.

## Mensageria

LocalStack fornece SQS FIFO e DLQ. O consumidor chama o mesmo `WagerService` da API. O registro da inbox ocorre dentro da transação de processamento. A publicação da outbox ocorre depois do commit e pode ser repetida; consumidores de eventos precisam deduplicar por ID. O worker executa a cada 3 segundos com backoff de publicação.

## Autenticação

Não foi implementada porque o enunciado informa que autenticação não pontua. Em produção, usaria Identity Provider OIDC externo e um guard nos endpoints financeiros; endpoints de health permaneceriam públicos. O canal SQS é considerado interno, mas o domínio valida provider e demais campos.

## Limitações conhecidas / próximos passos

- Não foi executada uma validação completa com Bun, PostgreSQL e LocalStack neste ambiente de geração. Rode `bun install`, migrations, `typecheck` e testes antes de entregar.
- Inbox não faz lock explícito da linha de mensagem antes do processamento; a idempotência financeira é garantida por constraints de transação, mas a semântica completa de inbox deve ser reforçada.
- Publicadores outbox concorrentes podem enviar o mesmo evento; consumidores precisam deduplicar. Falta leasing/`SKIP LOCKED` para reduzir publicações duplicadas.
- Worker de mensagens não estende visibilidade durante processamento prolongado; o limite de 30 segundos foi escolhido para o escopo do desafio.
- Logs JSON estruturados, métricas Prometheus, tracing distribuído, teste de três instâncias e cenários de falha de infraestrutura não foram finalizados.
- Entidades MikroORM são mapeamentos simples; o modelo de domínio com construtores privados/factories exigido como referência não foi implementado integralmente.

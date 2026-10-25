# Arquitetura e decisões técnicas

## Visão geral

O projeto é uma API para processar transações de apostas e manter o saldo das carteiras consistente. A implementação foi feita com NestJS, MikroORM e PostgreSQL, com uma opção de processamento assíncrono usando SQS via LocalStack.

As prioridades foram evitar débitos duplicados, impedir saldo negativo e manter um histórico das movimentações para conferência. É uma solução para o escopo do desafio, não um serviço pronto para produção.

## Organização do projeto

- **Wallet:** criação de carteiras e consulta de saldo.
- **Wager:** validação e processamento de BET, WIN, LOSS, REFUND e ROLLBACK.
- **Ledger:** registro das movimentações financeiras e reconciliação.
- **Messaging:** envio e consumo de mensagens pelo SQS, além dos registros de inbox e outbox.
- **Health:** endpoints para verificar a disponibilidade da aplicação e das dependências.

Os controllers recebem as requisições HTTP e os services concentram o processamento e as regras de negócio. O MikroORM é utilizado para acessar o PostgreSQL.

## Valores monetários

A API recebe valores como strings decimais, por exemplo `"20.00"`, para evitar erros de precisão com números de ponto flutuante. O módulo `money.ts` trabalha com centavos usando `bigint`, enquanto o banco armazena valores em colunas `numeric(20,2)`.

A moeda da transação também é conferida com a moeda da carteira.

## Consistência e concorrência

O processamento financeiro utiliza transações do banco de dados. Dessa forma, a atualização do saldo e o registro da movimentação precisam ser concluídos juntos.

Antes de alterar o saldo, o serviço usa `SELECT ... FOR UPDATE` para bloquear a linha da carteira durante a transação. Isso evita que duas apostas simultâneas leiam o mesmo saldo disponível e ambas sejam aprovadas indevidamente.

O banco também possui uma restrição para impedir saldos negativos.

## Idempotência

O endpoint de transações utiliza o header `Idempotency-Key`. A ideia é que, se a mesma requisição for enviada novamente, ela não gere outra movimentação financeira.

Além da chave, o sistema utiliza identificadores da transação externa e restrições de unicidade no PostgreSQL. Um hash do payload ajuda a identificar tentativas de reutilizar a mesma chave com dados diferentes.

Em uma repetição válida, a API devolve o resultado registrado no primeiro processamento.

## Ledger e reconciliação

As alterações de saldo geram lançamentos no ledger. Esse histórico permite conferir quais operações contribuíram para o saldo de uma carteira.

A reconciliação compara o saldo armazenado com o resultado das movimentações registradas. Caso exista uma diferença, ela é informada; o processo não altera automaticamente o saldo.

## Reversões e referências

`REFUND` e `ROLLBACK` usam a transação original como referência. O serviço verifica os dados relacionados antes de aplicar a movimentação inversa.

Quando uma referência ainda não existe, a operação pode ficar pendente para nova tentativa. Isso permite lidar com algumas situações em que as mensagens chegam fora de ordem.

## Processamento assíncrono

O projeto utiliza filas SQS FIFO disponibilizadas localmente pelo LocalStack. O consumidor encaminha as transações ao mesmo serviço responsável pelo processamento HTTP, evitando duplicar as regras financeiras.

A inbox registra mensagens recebidas e a outbox armazena eventos que precisam ser publicados após a transação. Como uma publicação pode ser repetida em situações de falha, consumidores desses eventos também devem tratar duplicações.

## Autenticação

A autenticação não foi implementada neste desafio, conforme o escopo informado no enunciado. Em uma aplicação real, os endpoints financeiros precisariam de autenticação e autorização, além de controles adicionais de acesso às filas e aos serviços internos.

## Validação realizada

O projeto foi executado localmente com Bun, PostgreSQL e LocalStack. Foram verificados manualmente os fluxos de criação de carteira, BET, WIN, ROLLBACK, idempotência, reconciliação e processamento por fila.

Também foram executados com sucesso:

- `bunx tsc --noEmit` — verificação de tipos.
- `bunx vitest run` — quatro testes unitários.
- `bunx vitest run --config vitest.config.e2e.ts` — dois testes de integração, incluindo apostas simultâneas e repetição de chave idempotente.

## Limitações e melhorias futuras

- Reforçar o controle de concorrência da inbox e da publicação da outbox quando houver múltiplos workers.
- Adicionar testes com múltiplas instâncias da aplicação e simulações de indisponibilidade de infraestrutura.
- Melhorar a observabilidade com logs estruturados, métricas e rastreamento de requisições.
- Tratar processos muito longos no consumidor SQS, incluindo renovação do tempo de visibilidade das mensagens.
- Evoluir o encapsulamento das entidades e regras de domínio.

Esses pontos não impedem a demonstração dos fluxos principais, mas seriam importantes antes de utilizar a solução em produção.

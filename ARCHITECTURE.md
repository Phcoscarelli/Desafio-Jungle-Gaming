<<<<<<< HEAD
Arquitetura e decisões técnicas
Visão geral
Este projeto implementa uma API para processar transações de apostas e manter o saldo das carteiras dos jogadores. O foco foi evitar movimentações duplicadas, impedir saldo negativo e manter um histórico que permita conferir os valores registrados.

A aplicação utiliza NestJS com TypeScript, Bun, PostgreSQL, MikroORM e SQS (simulado localmente pelo LocalStack). Existem duas formas de enviar uma transação: diretamente pela API HTTP ou por uma fila. Nos dois casos, o processamento financeiro é feito pelo mesmo serviço.

É uma implementação para o desafio técnico, não um sistema pronto para produção.
Valores monetários
Os valores chegam à API como strings decimais, por exemplo "20.00". No código, são convertidos para centavos usando bigint, evitando erros de precisão com números de ponto flutuante. No PostgreSQL, os valores são armazenados como numeric(20,2).

Cada carteira possui uma moeda, que precisa ser compatível com a moeda informada na transação.
Processamento e concorrência
As alterações de saldo acontecem dentro de transações do PostgreSQL. Antes de processar uma movimentação, o serviço usa SELECT ... FOR UPDATE para bloquear a linha da carteira envolvida.

Assim, duas operações sobre a mesma carteira não alteram o saldo ao mesmo tempo. O bloqueio fica restrito à carteira utilizada, sem impedir movimentações em outras carteiras. O banco também possui uma restrição para impedir saldos negativos.
Idempotência
As transações exigem o cabeçalho Idempotency-Key. O banco possui restrições de unicidade para essa chave e para a combinação de provedor e identificador externo da transação.

Se a mesma operação for recebida novamente com os mesmos dados, o serviço devolve o resultado já registrado, sem movimentar o saldo outra vez. Se a chave ou o identificador externo forem reutilizados com dados incompatíveis, a operação é recusada.
Ledger e reconciliação
Cada alteração de saldo cria um lançamento no ledger dentro da mesma transação do banco. O ledger registra o valor movimentado, a direção (CREDIT ou DEBIT) e os saldos anterior e posterior.

A abertura de uma carteira com saldo positivo gera um lançamento OPENING. A operação LOSS, por sua vez, não altera o saldo nesta implementação.
=======
# Arquitetura e decisões técnicas

## Visão geral

Este projeto implementa uma API para processar transações de apostas e manter o saldo das carteiras dos jogadores. O foco foi evitar movimentações duplicadas, impedir saldo negativo e manter um histórico que permita conferir os valores registrados.

A aplicação utiliza NestJS com TypeScript, Bun, PostgreSQL, MikroORM e SQS (simulado localmente pelo LocalStack). Existem duas formas de enviar uma transação: diretamente pela API HTTP ou por uma fila. Nos dois casos, o processamento financeiro é feito pelo mesmo serviço.

É uma implementação para o desafio técnico, não um sistema pronto para produção.

## Valores monetários

Os valores chegam à API como strings decimais, por exemplo `"20.00"`. No código, são convertidos para centavos usando `bigint`, evitando erros de precisão com números de ponto flutuante. No PostgreSQL, os valores são armazenados como `numeric(20,2)`.

Cada carteira possui uma moeda, que precisa ser compatível com a moeda informada na transação.

## Processamento e concorrência

As alterações de saldo acontecem dentro de transações do PostgreSQL. Antes de processar uma movimentação, o serviço usa `SELECT ... FOR UPDATE` para bloquear a linha da carteira envolvida.

Assim, duas operações sobre a mesma carteira não alteram o saldo ao mesmo tempo. O bloqueio fica restrito à carteira utilizada, sem impedir movimentações em outras carteiras. O banco também possui uma restrição para impedir saldos negativos.
>>>>>>> 66e3b1e (docs: update architecture and format source code)

Os lançamentos do ledger não podem ser editados ou excluídos. O endpoint de reconciliação soma créditos e débitos e compara o resultado com o saldo armazenado na carteira. Caso exista diferença, ela é informada, mas não corrigida automaticamente.
Estornos e operações fora de ordem
REFUND e ROLLBACK precisam indicar a transação original. O serviço confere a referência e valida informações como carteira, jogador, rodada, moeda e valor.

<<<<<<< HEAD
Quando a transação referenciada ainda não existe ou está pendente, a reversão fica com status PENDING_REFERENCE. O worker tenta processá-la novamente depois. Há um limite de tentativas, após o qual a operação pode ser rejeitada.
Mensageria: SQS, inbox e outbox
O LocalStack simula o SQS no ambiente local. A fila de entrada recebe as solicitações de transação e um consumidor as encaminha para o mesmo serviço utilizado pela API HTTP.

A inbox registra as mensagens processadas para ajudar a evitar processamento duplicado. A outbox armazena eventos relacionados às operações financeiras dentro da transação do banco; posteriormente, um worker publica esses eventos no SQS.

O worker também trata tentativas de publicação e operações pendentes. Como mensagens podem ser entregues novamente, o processamento precisa continuar seguro diante de repetições.
Autenticação
A autenticação não foi implementada neste escopo. Em um ambiente de produção, os endpoints financeiros precisariam de autenticação, autorização e controle de acesso apropriados.
Testes e validação local
A aplicação foi executada localmente com Bun, PostgreSQL e LocalStack. Foram verificados manualmente os seguintes cenários:
- Criação de carteira com saldo inicial.
- Processamento de BET e WIN.
- ROLLBACK de uma vitória.
=======
As transações exigem o cabeçalho `Idempotency-Key`. O banco possui restrições de unicidade para essa chave e para a combinação de provedor e identificador externo da transação.

Se a mesma operação for recebida novamente com os mesmos dados, o serviço devolve o resultado já registrado, sem movimentar o saldo outra vez. Se a chave ou o identificador externo forem reutilizados com dados incompatíveis, a operação é recusada.

## Ledger e reconciliação

Cada alteração de saldo cria um lançamento no ledger dentro da mesma transação do banco. O ledger registra o valor movimentado, a direção (`CREDIT` ou `DEBIT`) e os saldos anterior e posterior.

A abertura de uma carteira com saldo positivo gera um lançamento `OPENING`. A operação `LOSS`, por sua vez, não altera o saldo nesta implementação.

Os lançamentos do ledger não podem ser editados ou excluídos. O endpoint de reconciliação soma créditos e débitos e compara o resultado com o saldo armazenado na carteira. Caso exista diferença, ela é informada, mas não corrigida automaticamente.

## Estornos e operações fora de ordem

`REFUND` e `ROLLBACK` precisam indicar a transação original. O serviço confere a referência e valida informações como carteira, jogador, rodada, moeda e valor.

Quando a transação referenciada ainda não existe ou está pendente, a reversão fica com status `PENDING_REFERENCE`. O worker tenta processá-la novamente depois. Há um limite de tentativas, após o qual a operação pode ser rejeitada.

## Mensageria: SQS, inbox e outbox

O LocalStack simula o SQS no ambiente local. A fila de entrada recebe as solicitações de transação e um consumidor as encaminha para o mesmo serviço utilizado pela API HTTP.

A inbox registra as mensagens processadas para ajudar a evitar processamento duplicado. A outbox armazena eventos relacionados às operações financeiras dentro da transação do banco; posteriormente, um worker publica esses eventos no SQS.

O worker também trata tentativas de publicação e operações pendentes. Como mensagens podem ser entregues novamente, o processamento precisa continuar seguro diante de repetições.

## Autenticação

A autenticação não foi implementada neste escopo. Em um ambiente de produção, os endpoints financeiros precisariam de autenticação, autorização e controle de acesso apropriados.

## Testes e validação local

A aplicação foi executada localmente com Bun, PostgreSQL e LocalStack. Foram verificados manualmente os seguintes cenários:

- Criação de carteira com saldo inicial.
- Processamento de `BET` e `WIN`.
- `ROLLBACK` de uma vitória.
>>>>>>> 66e3b1e (docs: update architecture and format source code)
- Reenvio da mesma aposta, sem débito duplicado.
- Consulta de saldo e reconciliação do ledger.
- Envio de uma aposta para a fila SQS e processamento assíncrono pelo consumidor.
- Verificação de saúde do PostgreSQL e do SQS.
<<<<<<< HEAD
Os testes unitários de valores monetários e os testes de integração disponíveis também foram executados sem erros no ambiente local.
Limitações e melhorias futuras
- Ainda faltam testes mais abrangentes de concorrência entre múltiplas instâncias da aplicação.
- A inbox pode ser reforçada para tratar disputas entre consumidores simultâneos.
- Publicadores concorrentes da outbox podem tentar enviar o mesmo evento; seria útil implementar uma estratégia de reserva dos registros, como SKIP LOCKED.
- O consumidor não estende automaticamente o tempo de visibilidade de mensagens que demoram mais para processar.
- Observabilidade pode ser ampliada com métricas, logs estruturados e tracing.
- Os mapeamentos do MikroORM podem evoluir para um modelo de domínio mais encapsulado.
=======

Os testes unitários de valores monetários e os testes de integração disponíveis também foram executados sem erros no ambiente local.

## Limitações e melhorias futuras

- Ainda faltam testes mais abrangentes de concorrência entre múltiplas instâncias da aplicação.
- A inbox pode ser reforçada para tratar disputas entre consumidores simultâneos.
- Publicadores concorrentes da outbox podem tentar enviar o mesmo evento; seria útil implementar uma estratégia de reserva dos registros, como `SKIP LOCKED`.
- O consumidor não estende automaticamente o tempo de visibilidade de mensagens que demoram mais para processar.
- Observabilidade pode ser ampliada com métricas, logs estruturados e tracing.
- Os mapeamentos do MikroORM podem evoluir para um modelo de domínio mais encapsulado.

>>>>>>> 66e3b1e (docs: update architecture and format source code)
Esses pontos não impedem os fluxos básicos demonstrados, mas precisam ser considerados antes de utilizar a solução em produção.

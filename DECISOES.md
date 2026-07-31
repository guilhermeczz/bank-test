# Decisões Técnicas — Serviço de Cobranças

## 1. Estado atual do projeto

O projeto foi iniciado com NestJS e TypeScript. Até o momento, a implementação
está concentrada nas regras de domínio da cobrança.

Já existem:

- os métodos de pagamento `BOLETO` e `PIX`;
- os estados `PENDING`, `PAID`, `CANCELLED` e `EXPIRED`;
- instrumentos de pagamento diferentes para boleto e Pix;
- a entidade `Charge`;
- transições básicas de estado;
- validação do valor original em centavos;
- testes unitários das regras implementadas;
- configuração do TypeScript com `strict: true`.

A API HTTP, a persistência, o PSP falso, o webhook, a idempotência e as demais
regras do desafio ainda serão implementados.

## 2. Organização escolhida até agora

As primeiras regras foram colocadas em `src/domain`.

Escolhi essa separação para manter as regras financeiras atuais independentes de
NestJS, HTTP, banco de dados e provedor de pagamento. Com isso, consigo testar o
comportamento do domínio sem iniciar um servidor ou acessar serviços externos.

Essa é apenas a organização adotada nesta fase. A arquitetura final ainda não
está completamente definida e será ajustada conforme novas necessidades surgirem.

## 3. Entidade `Charge` e proteção de estado

`Charge` possui identidade porque cada cobrança precisa ser reconhecida pelo seu
próprio identificador, mesmo que duas cobranças tenham valores ou instrumentos
semelhantes.

O status é privado e não existem setters. Escolhi essa abordagem para impedir que
outras partes do sistema atribuam um estado sem respeitar as regras da entidade.
Uma cobrança nova sempre começa como `PENDING`, e esse estado inicial não pode ser
informado externamente.

As mudanças acontecem por métodos como `cancel()`, `markAsPaid()` e `expire()`.
Cada método verifica o estado atual antes de realizar a alteração. Quando uma
transição não é permitida, a entidade lança `ChargeStateError`.

| Instrumento | Estado atual | Operação | Resultado |
| --- | --- | --- | --- |
| Boleto ou Pix | `PENDING` | `cancel()` | `CANCELLED` |
| Boleto ou Pix | `PENDING` | `markAsPaid()` | `PAID` |
| Pix | `PENDING` | `expire()` | `EXPIRED` |
| Boleto ou Pix | `PAID` | `cancel()` ou `markAsPaid()` | Proibida |
| Boleto ou Pix | `CANCELLED` | `cancel()` ou `markAsPaid()` | Proibida |
| Pix | `EXPIRED` | `cancel()`, `markAsPaid()` ou `expire()` | Proibida |
| Boleto | Qualquer estado | `expire()` | Proibida |
| Pix | `PAID` ou `CANCELLED` | `expire()` | Proibida |

## 4. Diferença entre boleto e Pix

Os instrumentos formam uma união discriminada composta por
`BoletoPaymentInstrument`, `PixPaymentInstrument` e pelo tipo que reúne ambos,
`PaymentInstrument`.

O campo `type` diferencia as duas estruturas:

- boleto possui `nossoNumero`, `digitableLine` e `barcode`;
- Pix possui `txid`, `brCode` e `qrCode`.

O método de pagamento da cobrança é derivado diretamente do `type` do instrumento.
Não armazeno uma segunda informação para o método, pois isso poderia permitir uma
combinação inconsistente, como método Pix com instrumento de boleto.

Na implementação atual, somente Pix pode alcançar o estado `EXPIRED`. A união
poderá ser estendida no futuro, mas a inclusão de outro método exigirá uma nova
avaliação das regras relacionadas.

## 5. Valores monetários

Todos os valores são armazenados como números inteiros em centavos. Não utilizo
valores em reais com casas decimais porque a representação numérica do JavaScript
pode produzir imprecisões em alguns cálculos decimais.

Os limites atuais são:

- boleto: mínimo de `1_000` centavos, equivalente a R$ 10,00;
- Pix: mínimo de `1` centavo, equivalente a R$ 0,01;
- ambos: máximo de `100_000_000` centavos, equivalente a R$ 1.000.000,00.

Valores com parte decimal são rejeitados, e não arredondados. A função
`validateChargeAmount` concentra essas verificações antes que o valor seja
armazenado na entidade.

`ChargeValidationError` representa dados inválidos usados na criação da cobrança.
`ChargeStateError` representa tentativas inválidas de alterar o estado de uma
cobrança existente.

## 6. Uso de `readonly` e imutabilidade

Na entidade, identidade, instrumento e valor original não podem ser reatribuídos.
As propriedades internas dos instrumentos de boleto e Pix também são declaradas
como `readonly`.

Essa proteção é feita pelo sistema de tipos do TypeScript e ajuda a detectar
atribuições indevidas durante o desenvolvimento. Ela não equivale a um congelamento
profundo automático dos objetos em tempo de execução.

Nesta fase, optei por não adicionar mecanismos de imutabilidade mais complexos. A
proteção atual mantém o modelo simples e oferece segurança suficiente para as
regras implementadas até agora.

## 7. Estratégia de testes

Os testes atuais são unitários e exercitam o domínio isoladamente, sem servidor,
banco de dados ou serviço externo.

Já são testados:

- estado inicial;
- método de pagamento derivado do instrumento;
- getters da entidade;
- cancelamento;
- pagamento;
- expiração;
- operações proibidas;
- limites monetários mínimos;
- limites monetários máximos;
- valores negativos;
- valores com parte decimal.

Os cenários seguem o padrão preparação, execução e verificação. Primeiro preparo a
entidade e seus dados, depois executo a operação que está sendo testada e, por fim,
verifico o resultado ou o erro esperado.

## 8. Decisões ainda pendentes

As seguintes decisões ainda não foram concluídas:

- representação e validação de pagador;
- validação de CPF e CNPJ;
- tratamento de datas civis em `America/Sao_Paulo`;
- cálculo de multa e juros do boleto;
- tolerância e expiração temporal do Pix;
- divergência de pagamento;
- persistência in-memory;
- idempotência;
- PSP falso e comportamento em falhas;
- processamento de webhooks repetidos e fora de ordem;
- estrutura HTTP do NestJS;
- paginação e filtros;
- formato final dos erros HTTP.

Essas decisões serão avaliadas e documentadas conforme as respectivas partes forem
implementadas.

## 9. Limitações atuais

O código atual ainda não representa uma API utilizável. As instâncias de `Charge`
criadas durante os testes ainda não possuem persistência.

Nesta fase:

- ainda não há repositório;
- ainda não há recuperação de uma cobrança existente;
- ainda não há integração com PSP;
- ainda não existe processamento concorrente;
- ainda não há estratégia para reinício da aplicação.

Essas limitações fazem parte da construção incremental planejada. As funcionalidades
obrigatórias ainda não concluídas nesta etapa serão implementadas antes da entrega
final.

## 10. Uso de inteligência artificial

Ferramentas de inteligência artificial estão sendo utilizadas para auxiliar na
estruturação das etapas, sugerir implementações, gerar comentários pedagógicos,
sugerir casos de teste e revisar configurações e regras.

Todas as alterações são revisadas etapa por etapa. Meu objetivo é compreender o
código produzido e conseguir explicar e justificar cada decisão, e não delegar a
implementação completa do projeto à ferramenta.

## 11. Próximos passos

Os próximos passos planejados, ainda não concluídos, são:

1. pagador e validação de CPF/CNPJ;
2. vencimento e relógio controlável;
3. regras específicas de boleto e Pix;
4. repositórios em memória;
5. PSP falso;
6. casos de uso;
7. controllers HTTP;
8. webhook e idempotência;
9. documentação final e revisão dos comentários.

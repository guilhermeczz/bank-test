# Decisões técnicas

Este documento registra as principais decisões presentes na implementação.

A solução foi construída de forma intencionalmente simples e voltada ao escopo
do desafio. Não considero que ela represente DDD completo, Clean Architecture
completa ou CQRS.

## Arquitetura

Organizei o código de acordo com responsabilidades diretas:

- controllers recebem dados HTTP, convertem erros conhecidos em códigos de
  resposta e mapeiam entidades para o contrato externo;
- DTOs validam o formato dos corpos e parâmetros recebidos;
- services orquestram emissão, persistência, idempotência e processamento de
  webhooks;
- a entidade `Charge` protege identidade e transições de estado;
- funções em `src/domain` validam valores, datas, multa, juros e expiração;
- repositórios baseados em `Map` simulam persistência durante a execução;
- o PSP falso simula a emissão dos instrumentos no mesmo processo.

Essa divisão permite testar regras e casos de uso sem depender de banco de dados
ou serviços externos.

Não existem transações, filas ou infraestrutura distribuída na implementação
atual.

### Benefícios e custos da organização

A separação entre controllers, services, domínio, DTOs e repositórios facilita
os testes e evita que regras financeiras fiquem presas ao protocolo HTTP ou ao
armazenamento em memória.

Como custo, essa estrutura aumenta a quantidade de arquivos, tipos e
mapeamentos. Para uma API pequena, seria possível escrever menos código
concentrando as operações em poucos services.

Considerei esse custo aceitável porque as regras de estado, pagamento e datas
são sensíveis e precisam ser testadas separadamente.

O service de webhooks também concentra diferentes tipos de evento. Caso a
quantidade de métodos e eventos crescesse, eu separaria os processadores por
tipo de evento. Não fiz essa divisão agora para evitar abstrações antes de serem
necessárias.

## Dinheiro

Todos os valores monetários são números inteiros em centavos.

Não utilizo números em reais com parte decimal, evitando imprecisões de ponto
flutuante nas regras financeiras.

Os limites são:

- boleto: mínimo de `1_000` centavos;
- Pix: mínimo de `1` centavo;
- ambos: máximo de `100_000_000` de centavos.

No boleto vencido, multa e juros são calculados sobre o valor original e
arredondados separadamente:

```text
multa = round(valor original × 2 / 100)
juros = round(valor original × dias de atraso × 333 / 1.000.000)
esperado = original + multa + juros
```

Para `45_050` centavos e um dia de atraso:

```text
valor original: 45.050 centavos
multa:              901 centavos
juros:               15 centavos
valor esperado:  45.966 centavos
```

O arredondamento separado torna explícito quanto pertence à multa e quanto
pertence aos juros.

## Datas

`dueDate` é uma data civil no formato `YYYY-MM-DD`, e não um instante.

O dia de negócio é interpretado em `America/Sao_Paulo`, independentemente do
fuso da máquina que executa a aplicação.

Uso `Intl.DateTimeFormat` com `formatToParts` para obter ano, mês e dia em São
Paulo.

`Date.UTC` é usado somente para representar e comparar essas partes civis,
evitando interferência do fuso local ou de mudanças de horário na contagem de
dias.

O pagamento pode ocorrer até `23:59:59` da data de vencimento.

No Pix, essa mesma regra vale durante todo o terceiro e último dia de
tolerância.

## Boleto e Pix

### O que é compartilhado

Boleto e Pix compartilham a mesma entidade `Charge`, com:

- identificador;
- pagador;
- valor original;
- data de vencimento;
- descrição;
- status;
- instrumento de pagamento.

Também compartilham:

- criação pelo mesmo endpoint;
- emissão pelo PSP falso;
- armazenamento no mesmo repositório;
- estados `PENDING`, `PAID` e `CANCELLED`;
- validação de CPF ou CNPJ;
- valores armazenados em centavos;
- recebimento assíncrono de confirmação;
- proteção contra pagamento duplicado;
- consulta, listagem e cancelamento.

As diferenças ficam no instrumento gerado, na referência utilizada pelo PSP,
nos limites mínimos e nas regras de vencimento.

### Boleto

O boleto possui:

- `nossoNumero`;
- linha digitável com 47 dígitos;
- código de barras.

Seu valor mínimo é `1_000` centavos.

Ele continua pagável depois do vencimento, com:

- multa única de 2%;
- juros de 0,0333% por dia corrido.

O boleto não expira na implementação atual.

A busca de uma cobrança de boleto recebida por webhook é feita por
`nossoNumero`.

### Pix

O Pix possui:

- `txid`;
- código Pix em `brCode`;
- representação de QR Code em `qrCode`.

Ele pode ser pago:

- na data do vencimento;
- no primeiro dia após o vencimento;
- no segundo dia após o vencimento;
- no terceiro dia após o vencimento.

No quarto dia após o vencimento, passa para `EXPIRED`.

A busca de uma cobrança Pix recebida por webhook é feita por `txid`.

Quando uma confirmação `pix.paid` chega depois da expiração, a entidade permite
reconciliar `EXPIRED` para `PAID` somente quando `paidAt` comprova que o
pagamento ocorreu dentro da tolerância.

Um pagamento realmente realizado depois do prazo continua rejeitado.

### Inclusão de um terceiro método de pagamento

Os instrumentos de pagamento são representados por uma união discriminada.

Para adicionar um novo método, seria necessário incluir:

- um novo valor em `PaymentMethod`;
- uma nova estrutura em `PaymentInstrument`;
- um discriminador próprio;
- os campos obrigatórios do novo instrumento.

Também seria necessário ampliar:

- a validação de valores;
- a emissão no PSP falso;
- o DTO de criação;
- o mapeamento da resposta HTTP;
- os eventos de webhook;
- as regras específicas de estado;
- os testes do novo método.

Os dados compartilhados, como pagador, valor, vencimento, descrição,
identificador e status, poderiam continuar pertencendo à cobrança.

Um método como cartão recorrente exigiria uma análise adicional, porque possui
um ciclo de vida diferente de boleto e Pix.

Ele poderia envolver:

- assinatura;
- tentativas periódicas de cobrança;
- autorização;
- captura;
- falha;
- estorno;
- cancelamento da recorrência.

Nesse caso, eu evitaria adicionar vários campos opcionais à `Charge` atual e
avaliaria separar a assinatura das cobranças geradas por ela.

## PSP falso

`FakePaymentProvider` executa no mesmo processo e não representa uma integração
financeira real.

Ele:

- adiciona uma pequena latência;
- permite que a próxima emissão falhe de forma controlada;
- gera dados fictícios, porém plausíveis para testes.

Os códigos gerados não seguem integralmente os padrões bancários da FEBRABAN ou
do Banco Central e não devem ser usados para pagamentos reais.

Quando o PSP falha durante a emissão:

- a cobrança não é salva;
- a chave de idempotência não é salva;
- o endpoint retorna HTTP 502;
- uma nova tentativa com a mesma chave continua permitida.

Essa decisão evita registrar uma chave idempotente apontando para uma cobrança
que nunca foi criada.

## Idempotência

### `POST /charges`

O header `Idempotency-Key` é opcional.

Quando informado:

- espaços externos são removidos com `trim()`;
- a chave vazia é rejeitada;
- o limite máximo é de 255 caracteres;
- a chave é relacionada a um hash SHA-256 canônico do conteúdo da criação.

O hash utiliza campos em ordem fixa:

- nome do pagador;
- CPF ou CNPJ normalizado;
- e-mail;
- valor;
- vencimento;
- descrição;
- método de pagamento.

Comportamentos:

- mesma chave e mesmo conteúdo: retorna a cobrança existente sem chamar
  novamente o PSP;
- mesma chave e conteúdo diferente: retorna HTTP 409;
- sem chave: cada requisição cria uma nova cobrança.

O registro idempotente é salvo somente depois da cobrança.

Em memória e em uma única instância, isso atende ao desafio. Porém, a sequência
de consultar a chave, criar a cobrança e salvar a idempotência não é atômica
para requisições simultâneas ou múltiplas instâncias.

### Webhooks de pagamento

`boleto.paid` e `pix.paid` usam uma chave SHA-256 determinística formada por:

- evento;
- referência;
- valor;
- instante normalizado;
- `endToEndId`, no caso do Pix.

O campo de data é normalizado para ISO antes da criação da chave. Assim, dois
valores com fusos diferentes, mas que representam o mesmo instante, geram a
mesma chave.

Comportamentos:

- a repetição de um pagamento válido devolve o resultado anterior sem alterar a
  cobrança novamente;
- a repetição de uma divergência retorna novamente HTTP 422 sem criar outro
  registro;
- uma notificação diferente não é confundida com repetição;
- uma nova notificação para uma cobrança já paga continua sendo validada pelas
  regras de estado.

`pix.expired` não é salvo no repositório de webhooks processados.

Sua repetição é idempotente pelo estado: um Pix já `EXPIRED` permanece assim sem
executar `expire()` novamente.

## Eventos fora de ordem

Foram tratados os dois cenários principais definidos no escopo.

### Expiração recebida depois do pagamento

Quando `pix.expired` é recebido depois de `pix.paid`:

- a cobrança permanece `PAID`;
- `expire()` não é chamado;
- o pagamento confirmado não é sobrescrito;
- o endpoint retorna sucesso.

### Pagamento recebido depois da expiração

Quando `pix.paid` é recebido depois de `pix.expired`, a cobrança pode ser
reconciliada quando `paidAt` comprova que o pagamento ocorreu dentro da
tolerância.

Nesse caso:

```text
EXPIRED → PAID
```

A expiração aconteceu antes da chegada da confirmação, mas o pagamento ocorreu
dentro do prazo.

Quando `paidAt` estiver depois da tolerância:

- a cobrança permanece `EXPIRED`;
- o pagamento não é confirmado;
- o endpoint retorna conflito.

Não existe um mecanismo genérico de ordenação para eventos futuros ou para
eventos que não fazem parte deste desafio.

## Premissa de `pix.expired`

O desafio menciona a expiração do Pix, mas não define completamente o payload do
evento.

Adotei o seguinte contrato:

```json
{
  "event": "pix.expired",
  "txid": "identificador-pix",
  "expiredAt": "data ISO 8601"
}
```

`expiredAt` representa o instante informado pelo PSP.

Uma expiração ainda dentro da data de vencimento ou dos três dias de tolerância
é rejeitada com HTTP 422.

## Expiração preguiçosa

Não existe scheduler ou cron job.

Nesta implementação em memória, o estado do Pix é atualizado de forma
preguiçosa quando a cobrança é:

- consultada por ID;
- listada;
- cancelada;
- processada por webhook.

Essa estratégia é suficiente para o desafio, mas significa que uma cobrança
pode continuar armazenada como `PENDING` até ser acessada novamente.

Em produção, a expiração precisaria ser persistente e independente do acesso do
usuário.

## Divergências

Quando `paidAmount` é diferente de `expectedAmount`, o pagamento não é
confirmado.

Isso inclui:

- pagamento parcial;
- valor menor que o esperado;
- valor maior que o esperado;
- boleto vencido pago sem multa e juros corretos;
- Pix pago com valor diferente do valor original.

A cobrança mantém seu estado e a divergência é registrada separadamente com:

- referência;
- valor recebido;
- valor esperado;
- evento;
- data do pagamento;
- data do registro.

Uma divergência repetida não gera outro registro.

Não existe endpoint público para consultar ou corrigir divergências.

## Testes e validação

Existem testes unitários para:

- domínio;
- services;
- repositórios;
- PSP falso;
- cálculos financeiros;
- datas;
- estados;
- idempotência;
- webhooks.

Também existem testes e2e para os contratos HTTP.

Relógios falsos e datas futuras são usados para evitar dependência de datas que
ficariam vencidas durante a vida do projeto.

O projeto utiliza TypeScript com:

```json
{
  "strict": true
}
```

A validação final inclui:

```bash
npm run build
npm test
npm run test:e2e
npm run lint
```

Os fluxos principais também foram testados manualmente no Postman.

## Limitações

Os itens abaixo foram deixados de fora porque o desafio solicitou uma
implementação em memória, executável sem dependências externas e com prazo
reduzido.

Priorizei as regras obrigatórias de cobrança, estados, pagamentos,
idempotência e testes, em vez de adicionar infraestrutura de produção.

A implementação atual possui as seguintes limitações:

- armazenamento apenas na memória local;
- perda de todos os dados no reinício;
- funcionamento consistente apenas em uma instância;
- ausência de banco de dados e migrações;
- ausência de autenticação de usuários;
- ausência de assinatura ou autenticação dos webhooks;
- ausência de transações e constraints persistentes;
- ausência de controle distribuído de concorrência;
- ausência de filas;
- ausência de retentativas persistentes;
- ausência de dead-letter queue;
- ausência de rate limiting;
- ausência de observabilidade completa;
- ausência de scheduler real;
- instrumentos do PSP sem validade bancária;
- ausência de endpoint público para divergências;
- ausência de estorno e chargeback.

Essas limitações são compatíveis com a proposta in-memory do desafio, mas não
com uma operação financeira em produção.

## Onde quebraria com 50 mil cobranças por dia

A implementação atual não suportaria 50 mil cobranças por dia de forma segura.

Os principais problemas seriam:

- crescimento contínuo dos objetos armazenados nos `Map`;
- consumo crescente de memória;
- perda de todos os dados ao reiniciar o processo;
- impossibilidade de compartilhar dados entre múltiplas instâncias;
- buscas por `nossoNumero` e `txid` em estruturas locais;
- disputa entre requisições simultâneas usando a mesma chave de idempotência;
- ausência de transação entre emissão no PSP, criação da cobrança e registro da
  idempotência;
- ausência de fila para absorver picos de webhooks;
- ausência de retentativas persistentes;
- expiração preguiçosa dependendo do acesso à cobrança;
- falta de métricas e alertas para identificar lentidão e falhas.

Mesmo que um único processo suportasse parte desse volume por algum tempo, a
solução não teria durabilidade, concorrência, rastreabilidade e escalabilidade
suficientes para uma operação financeira.

## Como seria em produção

Em produção, eu substituiria os `Map` por PostgreSQL, utilizando:

- migrações;
- transações;
- índices;
- constraints únicas;
- tabelas próprias para idempotência;
- tabela de inbox de webhooks;
- histórico persistente de eventos;
- armazenamento persistente de divergências.

A tabela de inbox permitiria receber o webhook, salvá-lo e processá-lo de forma
confiável.

Eventos seriam encaminhados para filas com:

- retentativas;
- controle de falhas;
- dead-letter queue;
- processamento assíncrono.

Os webhooks teriam:

- assinatura validada;
- autenticação;
- proteção contra replay;
- registro de auditoria.

Também seriam adicionados:

- logs estruturados;
- métricas;
- tracing;
- alertas;
- scheduler persistente;
- múltiplas instâncias;
- testes de concorrência;
- testes de integração com banco.

A sequência atual:

```text
consultar chave
→ emitir instrumento
→ salvar cobrança
→ salvar idempotência
```

não é atomicamente segura para requisições simultâneas.

Em produção, isso exigiria:

- transação;
- restrição única;
- controle de concorrência;
- estratégia para falhas ocorridas depois da emissão no PSP.

## O que faria com mais uma semana

Minhas prioridades seriam:

1. adicionar PostgreSQL;
2. criar migrações e constraints;
3. tornar a idempotência transacional;
4. autenticar e validar a assinatura dos webhooks;
5. criar documentação OpenAPI;
6. adicionar testes de integração com banco;
7. adicionar logs estruturados;
8. adicionar métricas e tracing;
9. melhorar a simulação de falhas do PSP;
10. criar uma collection do Postman para facilitar a avaliação.

Não faria uma reescrita completa. A prioridade seria tornar persistentes e
confiáveis as regras já implementadas.

## Uso de inteligência artificial

Usei ChatGPT e Codex para auxiliar em:

- decomposição do desafio;
- planejamento das etapas;
- geração assistida de código;
- geração e revisão de testes;
- revisão de tipagens;
- revisão de documentação;
- identificação de cenários de borda.

As alterações foram revisadas etapa por etapa.

Também foram executados:

- build;
- testes unitários;
- testes e2e;
- lint;
- testes manuais no Postman.

O uso das ferramentas não transfere a responsabilidade pelo projeto.

Continuo responsável:

- pelo código entregue;
- pelas decisões;
- pelas limitações documentadas;
- pelos testes;

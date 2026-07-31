# Decisões técnicas

Este documento registra decisões que já aparecem na implementação. A solução é
intencionalmente simples e voltada ao escopo do desafio; não considero que ela
represente DDD completo, Clean Architecture completa ou CQRS.

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

Essa divisão permite testar regras e casos de uso sem banco de dados ou serviços
externos. Não existem transações, filas ou infraestrutura distribuída.

## Dinheiro

Todos os valores monetários são números inteiros em centavos. Não uso números em
reais com parte decimal, evitando imprecisões de ponto flutuante nas regras
financeiras.

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

Para `45_050` centavos e um dia de atraso, a multa é `901`, os juros são `15` e
o valor esperado é `45_966` centavos.

## Datas

`dueDate` é uma data civil no formato `YYYY-MM-DD`, e não um instante. O dia de
negócio é interpretado em `America/Sao_Paulo`, independentemente do fuso da
máquina que executa a aplicação.

Uso `Intl.DateTimeFormat` com `formatToParts` para obter ano, mês e dia em São
Paulo. `Date.UTC` é usado somente para representar e comparar essas partes civis,
evitando interferência de fuso ou horário de verão na contagem de dias.

O pagamento pode ocorrer até `23:59:59` da data de vencimento. No Pix, essa mesma
regra vale durante todo o terceiro e último dia de tolerância.

## Boleto e Pix

### Boleto

O boleto possui `nossoNumero`, linha digitável com 47 dígitos e código de barras.
Seu valor mínimo é `1_000` centavos. Ele continua pagável depois do vencimento,
com multa única de 2% e juros de 0,0333% por dia corrido. Boleto não expira na
implementação atual.

### Pix

O Pix possui `txid`, código Pix (`brCode`) e representação de QR Code (`qrCode`).
Ele pode ser pago na data do vencimento e nos três dias corridos seguintes. No
quarto dia após o vencimento, passa a `EXPIRED`.

Quando uma confirmação `pix.paid` chega depois da expiração, a entidade permite
reconciliar `EXPIRED` para `PAID` somente se `paidAt` comprovar que o pagamento
ocorreu dentro da tolerância. Um pagamento realmente feito depois do prazo
continua rejeitado.

## PSP falso

`FakePaymentProvider` executa no mesmo processo e não representa integração
financeira real. Ele adiciona uma pequena latência, permite que a próxima emissão
falhe de forma controlada e gera dados fictícios, porém plausíveis para testes.

Os códigos não seguem integralmente padrões bancários da FEBRABAN ou do BACEN e
não devem ser usados para pagamentos reais.

## Idempotência

### `POST /charges`

O header `Idempotency-Key` é opcional. Quando existe, seu valor é normalizado com
`trim()` e relacionado a um hash SHA-256 canônico do conteúdo da criação. O hash
usa campos em ordem fixa e o CPF/CNPJ já normalizado.

- mesma chave e mesmo conteúdo: retorna a cobrança existente sem chamar o PSP;
- mesma chave e conteúdo diferente: retorna conflito HTTP 409;
- sem chave: cada requisição cria uma nova cobrança.

O registro idempotente é salvo somente depois da cobrança. Em memória e em uma
única instância isso atende aos testes, mas a sequência de consultar a chave,
criar a cobrança e salvar a idempotência não é atômica para requisições
simultâneas ou múltiplas instâncias.

### Webhooks de pagamento

`boleto.paid` e `pix.paid` usam uma chave SHA-256 determinística formada por
evento, referência, valor, instante normalizado e, no Pix, `endToEndId`.

- a repetição de um pagamento válido devolve o resultado anterior sem alterar a
  cobrança novamente;
- a repetição de uma divergência retorna novamente HTTP 422 sem criar outro
  registro;
- uma notificação diferente não é confundida com repetição.

`pix.expired` não é salvo no repositório de webhooks processados. Sua repetição é
idempotente pelo estado: um Pix já `EXPIRED` permanece assim sem executar
`expire()` novamente.

## Eventos fora de ordem

Foram tratados os dois casos definidos no escopo:

- `pix.expired` recebido depois de `pix.paid` mantém a cobrança `PAID`;
- `pix.paid` recebido depois de `pix.expired` pode reconciliar a cobrança quando
  `paidAt` comprova que o pagamento ocorreu dentro da tolerância.

Se `paidAt` estiver depois do prazo, a cobrança permanece `EXPIRED` e o endpoint
retorna conflito. Não há mecanismo genérico de ordenação para eventos futuros.

## Premissa de `pix.expired`

O desafio menciona a expiração do Pix, mas não define completamente o payload do
evento. Adotei o seguinte contrato:

```json
{
  "event": "pix.expired",
  "txid": "identificador-pix",
  "expiredAt": "data ISO 8601"
}
```

`expiredAt` representa o instante informado pelo PSP. Uma expiração ainda dentro
da tolerância é rejeitada com HTTP 422.

## Expiração preguiçosa

Não existe scheduler ou cron job. Nesta implementação em memória, o estado do Pix
é atualizado de forma preguiçosa quando a cobrança é consultada, listada,
cancelada ou processada por webhook.

Essa estratégia é suficiente para o desafio, mas significa que uma cobrança pode
continuar armazenada como `PENDING` até ser acessada novamente.

## Divergências

Quando `paidAmount` é diferente de `expectedAmount`, o pagamento não é confirmado.
A cobrança mantém seu estado e a divergência é registrada separadamente com
referência, valores em centavos, evento e datas.

Uma divergência repetida não gera outro registro. Não existe endpoint público
para consultar ou corrigir divergências.

## Testes e validação

Há testes unitários para domínio, services, repositórios e PSP, além de testes
e2e para os contratos HTTP. Relógios falsos e datas futuras são usados para
evitar dependência de datas que ficariam vencidas durante a vida do projeto.

O projeto usa TypeScript com `strict: true`. Build, testes unitários, testes e2e
e lint fazem parte da validação final.

## Limitações

A implementação atual possui limitações conscientes:

- armazenamento apenas na memória local e perda de dados no reinício;
- funcionamento consistente apenas em uma instância;
- ausência de banco de dados e migrações;
- ausência de autenticação de usuários;
- ausência de assinatura ou autenticação dos webhooks;
- ausência de transações e constraints persistentes;
- ausência de controle distribuído de concorrência;
- ausência de filas, retentativas persistentes e dead-letter queue;
- ausência de rate limiting;
- ausência de observabilidade completa;
- ausência de scheduler real;
- instrumentos do PSP sem validade bancária.

Essas limitações são compatíveis com a proposta in-memory do desafio, mas não com
uma operação financeira em produção.

## Como seria em produção

Em produção, eu substituiria os `Map` por PostgreSQL, com migrações, transações e
constraints únicas. Chaves idempotentes e notificações recebidas teriam tabelas
próprias; uma inbox de webhooks permitiria processamento confiável.

Eventos seriam encaminhados para filas com retentativas e dead-letter queue. Os
webhooks teriam assinatura validada. Eu adicionaria logs estruturados, métricas,
tracing, alertas e um scheduler persistente para expiração. Testes de concorrência
validariam criação e processamento simultâneos em múltiplas instâncias.

## O que faria com mais uma semana

Prioridades realistas:

1. PostgreSQL, migrações e constraints;
2. autenticação e assinatura dos webhooks;
3. documentação OpenAPI;
4. testes de integração com banco;
5. controle transacional da concorrência de idempotência;
6. logs estruturados, métricas e tracing.

## Uso de inteligência artificial

Usei ChatGPT e Codex para auxiliar na decomposição do desafio, no planejamento,
na geração assistida de código, na geração e revisão de testes e na revisão da
documentação.

As alterações foram revisadas etapa por etapa. Build, testes e lint foram
executados, e os fluxos também foram testados manualmente no Postman. O uso das
ferramentas não transfere a responsabilidade: continuo responsável pelo código,
pelas decisões e por conseguir explicá-los durante a avaliação.

# Bank Test

Desafio técnico backend para emissão e processamento de cobranças com TypeScript
e NestJS.

# Solução implementada

## Visão geral

A solução expõe uma API HTTP para criar, consultar, listar e cancelar cobranças
por boleto ou Pix. As regras de estado e de valores ficam no domínio, os dados
são armazenados em memória e um PSP falso gera instrumentos de pagamento no
mesmo processo. Webhooks confirmam pagamentos, registram divergências e processam
a expiração do Pix.

Principais regras implementadas:

- estados `PENDING`, `PAID`, `CANCELLED` e `EXPIRED`;
- valores monetários representados por números inteiros em centavos;
- validação de CPF e CNPJ;
- boleto com multa de 2% e juros de 0,0333% ao dia após o vencimento;
- Pix pagável até o terceiro dia corrido após o vencimento;
- idempotência opcional na criação e repetição segura de webhooks de pagamento.

## Tecnologias

- Node.js;
- TypeScript com `strict: true`;
- NestJS;
- Jest;
- `class-validator` e `class-transformer`.

## Requisitos

É necessário utilizar uma versão LTS do Node.js compatível com as dependências
do projeto. O repositório não fixa uma versão exata do Node.js.

## Instalação

```bash
npm install
```

## Execução

```bash
npm run start:dev
```

URL local:

```text
http://localhost:3000
```

## Validação

```bash
npm run build
npm test
npm run test:e2e
npm run lint
```

## Endpoints

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/charges` | Cria boleto ou Pix |
| `GET` | `/charges` | Lista com filtros e paginação |
| `GET` | `/charges/:id` | Consulta por ID |
| `POST` | `/charges/:id/cancel` | Cancela uma cobrança pendente |
| `POST` | `/webhooks/psp` | Processa eventos do PSP |

### Criar boleto

```bash
curl -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -d '{
    "payer": {
      "name": "Maria Souza",
      "document": "529.982.247-25",
      "email": "maria@example.com"
    },
    "amount": 45050,
    "dueDate": "2099-08-15",
    "description": "Taxa condominial",
    "paymentMethod": "BOLETO"
  }'
```

### Criar Pix

```bash
curl -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -d '{
    "payer": {
      "name": "Maria Souza",
      "document": "52998224725",
      "email": "maria@example.com"
    },
    "amount": 45050,
    "dueDate": "2099-08-15",
    "description": "Cobrança Pix",
    "paymentMethod": "PIX"
  }'
```

O campo `amount` representa centavos. Assim, `45050` equivale a R$ 450,50.

### Idempotency-Key

O header é opcional. A mesma chave e o mesmo conteúdo retornam a cobrança já
criada; a mesma chave com conteúdo diferente retorna HTTP 409.

```bash
curl -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: cobranca-condominio-2026-08-123" \
  -d '{
    "payer": {
      "name": "Maria Souza",
      "document": "52998224725",
      "email": "maria@example.com"
    },
    "amount": 45050,
    "dueDate": "2099-08-15",
    "description": "Taxa condominial",
    "paymentMethod": "BOLETO"
  }'
```

### Filtros e paginação

```bash
curl "http://localhost:3000/charges?status=PENDING&payerDocument=529.982.247-25&page=1&limit=20"
```

- `status`: `PENDING`, `PAID`, `CANCELLED` ou `EXPIRED`;
- `payerDocument`: CPF ou CNPJ, com ou sem pontuação;
- `page`: começa em 1;
- `limit`: padrão 20 e máximo 100.

### Webhook `boleto.paid`

Substitua `NOSSO_NUMERO` pelo valor devolvido na criação.

```json
{
  "event": "boleto.paid",
  "nossoNumero": "NOSSO_NUMERO",
  "paidAmount": 45050,
  "paidAt": "2099-08-15T14:32:00-03:00"
}
```

### Webhook `pix.paid`

Substitua `TXID` pelo valor devolvido na criação.

```json
{
  "event": "pix.paid",
  "txid": "TXID",
  "paidAmount": 45050,
  "paidAt": "2099-08-15T09:10:00-03:00",
  "endToEndId": "E12345678901234567890"
}
```

### Webhook `pix.expired`

```json
{
  "event": "pix.expired",
  "txid": "TXID",
  "expiredAt": "2099-08-19T00:00:00-03:00"
}
```

Os webhooks são enviados para `POST /webhooks/psp`.

## Códigos HTTP

| Código | Uso na implementação |
| --- | --- |
| `200` | Consultas, cancelamento e webhooks processados |
| `201` | Criação, inclusive repetição idempotente válida |
| `400` | Payload, documento ou chave idempotente inválidos |
| `404` | Cobrança ou referência externa não encontrada |
| `409` | Conflito de estado ou reutilização conflitante da chave |
| `422` | Divergência de valor ou expiração Pix prematura |
| `502` | Falha simulada do PSP durante a emissão |

## Armazenamento em memória

Cobranças, chaves idempotentes, webhooks processados e divergências ficam em
repositórios baseados em `Map`. Todos os dados são apagados ao reiniciar a
aplicação. Essa escolha atende ao escopo do desafio, mas não representa uma
persistência adequada para produção.

Detalhes, premissas e limitações estão registrados em [DECISOES.md](./DECISOES.md).

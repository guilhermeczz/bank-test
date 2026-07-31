# Bank Test

Primeira entrega de um desafio técnico backend para emissão de cobranças com
TypeScript e NestJS.

Nesta etapa, o projeto concentra as regras de domínio. Controllers, persistência
e integração com provedores de pagamento ainda não foram implementados.

## Funcionalidades implementadas

- Cobranças por boleto e Pix.
- Valores monetários armazenados como centavos inteiros.
- Limites mínimos e máximos conforme o método de pagamento.
- Estados `PENDING`, `PAID`, `CANCELLED` e `EXPIRED`.
- Transições de estado controladas pela entidade `Charge`.
- Testes unitários das regras de domínio.

## Tecnologias

- Node.js
- TypeScript com modo estrito
- NestJS
- Jest

## Como executar

Instale as dependências:

```bash
npm install
```

Inicie a aplicação em modo de desenvolvimento:

```bash
npm run start:dev
```

## Validação

Execute os testes:

```bash
npm test
```

Verifique o build:

```bash
npm run build
```

Execute a análise estática:

```bash
npm run lint
```

## Status

Projeto em desenvolvimento incremental.

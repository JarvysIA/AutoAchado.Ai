# AUTO214 — Automotive commercial discovery decisions

## Context

O classificador determinístico inicial considerava 214 categorias elegíveis ao discovery automático. A revisão comercial verificou a vendabilidade dessas categorias sem preço, desconto, comissão, score, vendas ou quota.

Princípio aprovado: **desconto não compensa baixa vendabilidade**.

Somente categorias `ALLOWED/A` e `ALLOWED/B` podem entrar no discovery automático. `ALLOWED/C` continua válida no universo, mas não é automática. `REVIEW`, `EXCLUDED` e `UNKNOWN` também não são automáticas.

## Decisões do gate AUTO214

O relatório `reports/0B3B2-AUTO214-commercial-review.md` aprovou:

- 22 rebaixamentos de A para B;
- 56 rebaixamentos para C;
- 23 casos enviados para decisão humana.

As decisões são aplicadas por ID explícito. Não existe regra baseada no texto “Outros”.

## Decisões humanas finais dos 23 borderline

### ALLOWED/A

- MLB432538
- MLB456123

### ALLOWED/B

- MLB392346
- MLB458249
- MLB3386
- MLB194028
- MLB429227
- MLB439465
- MLB8532

### ALLOWED/C

- MLB22675
- MLB271259
- MLB458058
- MLB440131
- MLB437338
- MLB458223
- MLB458233
- MLB458235
- MLB458244
- MLB45372

### REVIEW

- MLB116501
- MLB440302
- MLB194016

### EXCLUDED

- MLB437340

Contagem dos 23: A=2, B=7, C=10, REVIEW=3 e EXCLUDED=1. Exatamente nove são automáticos.

## Resultado final

- Universo do snapshot: 3.269 categorias;
- ALLOWED: 470;
- Tier A: 28;
- Tier B: 116;
- Tier C: 326;
- REVIEW: 1.950;
- EXCLUDED: 849;
- UNKNOWN: 0;
- discovery automático final: **144**.

O total 144 deriva das decisões comerciais, sem preenchimento de quota. Nenhuma categoria é promovida apenas para atingir uma quantidade-alvo.

## Segurança e escopo

Continuam válidos:

- somente carro, caminhonete e moto no recorte comercial;
- GNV, linha pesada, náutica, veículos completos e serviços excluídos;
- pneus automáticos limitados a carro/caminhonete e moto;
- fallback futuro permanece `UNKNOWN` e não automático;
- `commercialFamilyKeyDefault` continua `null`;
- nenhuma entrada de preço, desconto, comissão ou score;
- nenhuma API, OAuth, Supabase, banco ou migration participa desta decisão.

## Evidências

- `reports/0B3B2-AUTO214-commercial-review.md`;
- `reports/0B3B2-AUTO214-borderline23-review.md`;
- `reports/0B3B2-classifier-coverage.md`;
- `tests/commerce/classification/automotive/commercial-review.test.ts`.
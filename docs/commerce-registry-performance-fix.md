# Commerce Registry — correção de performance da RPC

## Escopo

A migration forward-only 20260824233000_optimize_commerce_registry_sync.sql substitui apenas a implementação de public.apply_commerce_registry_sync(jsonb). Os contratos commerce-registry-apply/v1 e commerce-registry-apply-result/v1, a atomicidade, o advisory transaction lock, os grants, a proteção de manual_override e as regras de timestamps permanecem inalterados.

## Correções

A validação de paths materializa uma expansão do payload por statement e cria um mapa JSONB externalCategoryId → name. Cada elemento de path passa a usar lookup direto no mapa, removendo o scan correlacionado de todas as 3.269 rows para cada um dos 15.017 elementos de path.

O insert de mappings removeu o anti-join NOT EXISTS redundante. A identidade continua garantida pela primary key (vertical_key, marketplace_category_id) e por ON CONFLICT ON CONSTRAINT vertical_category_mappings_pkey DO NOTHING.

Não foram adicionados timeout, índice, tabela temporária, staging persistente, SQL dinâmico ou DELETE.

## Evidência local

- P7 anterior: 12.488,332 ms.
- P7 otimizado: 223,284 ms, incluindo leitura/parsing do artefato de diagnóstico.
- Redução P7: 98,21%.
- P16 anterior: 1.338,013 ms.
- P16 otimizado: 279,112 ms.
- Redução P16: 79,14%.
- RPC anterior: 13.269,923 ms.
- first apply real via Supabase JS/PostgREST: 2.670,162 ms.
- Redução total: 79,88%; speedup: 4,97×.
- authenticator.statement_timeout: 8 s, sem alteração.

Todos os números são medições do Supabase local e não constituem SLA remoto.

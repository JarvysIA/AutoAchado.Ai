# Commerce Registry — E2E local de persistência

O gate local percorre o caminho completo:

snapshot → árvore → classifier → planner → payload → executor server-side → Supabase JS → PostgREST local → RPC → PostgreSQL → validator → current-state reader → diff.

## Baseline aceita

- snapshot SHA-256: c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2
- rows: 3.269
- payload: 1.603.538 bytes
- wrapper RPC: 1.603.552 bytes
- first apply: 3.269 categories e 3.269 mappings inseridos
- active mappings: 3.269
- ALLOWED/REVIEW/EXCLUDED/UNKNOWN: 470/1.950/849/0
- tiers A/B/C: 28/116/326
- automatic eligible: 144
- reader: quatro páginas de categories e quatro de mappings, sem truncamento
- diff após apply: tudo UNCHANGED

## Cenários cobertos

O harness scripts/test-registry-sync-local-e2e.ts valida replay idempotente, replay alterando apenas checkedAt, drift de source e classifier, proteção manual contra plano stale, inativação e reativação, reativação factual, mudança de parent com UUID estável, lock concorrente, liberação do lock, grants pela Data API e integridade referencial/semântica.

Cada apply faz uma única RPC. O reader faz chamadas paginadas, sem N+1. O harness recusa qualquer URL que não seja localhost ou 127.0.0.1.

Este gate não acessa Supabase remoto, Mercado Livre, OAuth nem executa sync de produção.

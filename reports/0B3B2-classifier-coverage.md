# AutoAchado.AI — 0B3B2 Classifier Coverage

Gerado offline a partir do snapshot sanitizado e versionado. Nenhuma API, OAuth, Supabase ou banco foi acessado.

## Baseline

- Snapshot checksum: `c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2`
- Snapshot nodes: 3269
- Classification version: `automotive-classifier/mlb/v1`
- Commercial scope: carros, caminhonetes e motos

## Coverage totals

| Métrica | Quantidade |
| --- | ---: |
| Total nodes | 3269 |
| ALLOWED | 470 |
| REVIEW | 1950 |
| EXCLUDED | 849 |
| UNKNOWN | 0 |
| Tier A | 28 |
| Tier B | 116 |
| Tier C | 326 |
| Automatic discovery eligible | 144 |
| Automatic discovery blocked | 3125 |
| Exact-rule matches | 227 |
| Ancestor-rule matches | 3042 |
| Fallback UNKNOWN | 0 |
| Rules without match | 0 |

## Coverage by root branch

| ID | Branch | Total | ALLOWED | REVIEW | EXCLUDED | UNKNOWN | A | B | C | Automatic |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MLB1747 | Aces. de Carros e Caminhonetes | 259 | 21 | 238 | 0 | 0 | 2 | 13 | 6 | 15 |
| MLB1771 | Aces. de Motos e Quadriciclos | 82 | 9 | 71 | 2 | 0 | 1 | 3 | 5 | 4 |
| MLB1776 | Tuning | 49 | 2 | 47 | 0 | 0 | 0 | 0 | 2 | 0 |
| MLB188063 | Limpeza Automotiva | 18 | 17 | 1 | 0 | 0 | 5 | 12 | 0 | 17 |
| MLB2227 | Ferramentas para Veículos | 60 | 21 | 39 | 0 | 0 | 1 | 12 | 8 | 13 |
| MLB2238 | Pneus e Acessórios | 14 | 2 | 4 | 8 | 0 | 2 | 0 | 0 | 2 |
| MLB2239 | Segurança Veicular | 33 | 28 | 4 | 1 | 0 | 2 | 14 | 12 | 16 |
| MLB22693 | Peças de Carros e Caminhonetes | 1609 | 304 | 1305 | 0 | 0 | 7 | 24 | 273 | 31 |
| MLB243551 | Peças de Motos e Quadriciclos | 176 | 0 | 176 | 0 | 0 | 0 | 0 | 0 | 0 |
| MLB255788 | Rodas | 7 | 2 | 3 | 2 | 0 | 0 | 2 | 0 | 2 |
| MLB260634 | Performance | 53 | 1 | 52 | 0 | 0 | 0 | 0 | 1 | 0 |
| MLB3381 | Som Automotivo | 33 | 30 | 3 | 0 | 0 | 0 | 18 | 12 | 18 |
| MLB377674 | Serviços Programados | 33 | 0 | 0 | 33 | 0 | 0 | 0 | 0 | 0 |
| MLB419936 | Peças de Linha Pesada | 521 | 0 | 0 | 521 | 0 | 0 | 0 | 0 | 0 |
| MLB438364 | Acessórios de Linha Pesada | 79 | 0 | 0 | 79 | 0 | 0 | 0 | 0 | 0 |
| MLB45468 | GNV | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| MLB455216 | Tags de Pagamento de Pedágio | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| MLB456046 | Peças Náuticas | 82 | 0 | 0 | 82 | 0 | 0 | 0 | 0 | 0 |
| MLB456111 | Lubrificantes e Fluidos | 44 | 22 | 2 | 20 | 0 | 8 | 14 | 0 | 22 |
| MLB457400 | Instalações de pneus | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| MLB458209 | Motos | 4 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 |
| MLB5802 | Outros | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| MLB6005 | Acessórios Náuticos | 85 | 0 | 0 | 85 | 0 | 0 | 0 | 0 | 0 |
| MLB8531 | Navegadores GPS para Vehículos | 13 | 11 | 2 | 0 | 0 | 0 | 4 | 7 | 4 |

## Top matching rules

| Rule | Nodes |
| --- | ---: |
| car-parts.residual-descendants | 1300 |
| heavy-parts.descendants | 520 |
| car-accessories.residual-descendants | 233 |
| car-parts.suspension.descendants | 151 |
| motorcycle-parts.residual-descendants | 147 |
| marine-accessories.descendants | 84 |
| marine-parts.descendants | 81 |
| heavy-accessories.descendants | 78 |
| motorcycle-accessories.residual-descendants | 69 |
| car-parts.brakes.descendants | 64 |
| performance.residual-descendants | 48 |
| tuning.residual-descendants | 45 |
| car-parts.lighting.descendants | 36 |
| tools.residual-descendants | 32 |
| services.descendants | 32 |
| car-audio.descendants | 16 |
| motorcycle-parts.brakes-mixed-descendants | 13 |
| security.descendants | 12 |
| gnv.descendants | 10 |
| lubricants.heavy.descendants | 8 |

## Automatic rules with at least 5 categories

| Rule | Automatic categories |
| --- | ---: |
| car-audio.descendants | 16 |
| security.descendants | 12 |
| car-accessories.racks.descendants | 7 |
| car-parts.filters.descendants | 5 |

## UNKNOWN / REVIEW summary

| ID | Branch | REVIEW | UNKNOWN |
| --- | --- | ---: | ---: |
| MLB22693 | Peças de Carros e Caminhonetes | 1305 | 0 |
| MLB1747 | Aces. de Carros e Caminhonetes | 238 | 0 |
| MLB243551 | Peças de Motos e Quadriciclos | 176 | 0 |
| MLB1771 | Aces. de Motos e Quadriciclos | 71 | 0 |
| MLB260634 | Performance | 52 | 0 |
| MLB1776 | Tuning | 47 | 0 |
| MLB2227 | Ferramentas para Veículos | 39 | 0 |
| MLB2238 | Pneus e Acessórios | 4 | 0 |
| MLB2239 | Segurança Veicular | 4 | 0 |
| MLB255788 | Rodas | 3 | 0 |
| MLB3381 | Som Automotivo | 3 | 0 |
| MLB456111 | Lubrificantes e Fluidos | 2 | 0 |
| MLB8531 | Navegadores GPS para Vehículos | 2 | 0 |
| MLB188063 | Limpeza Automotiva | 1 | 0 |
| MLB455216 | Tags de Pagamento de Pedágio | 1 | 0 |
| MLB5802 | Outros | 1 | 0 |

Rules without match: nenhuma.

## Business invariants

- CAR_MOTO_ONLY: **PASS**
- GNV_EXCLUDED: **PASS**
- HEAVY_VEHICLES_EXCLUDED: **PASS**
- MARINE_EXCLUDED: **PASS**
- COMPLETE_VEHICLES_EXCLUDED: **PASS**
- SERVICES_EXCLUDED: **PASS**
- NON_CAR_MOTO_TIRES_EXCLUDED: **PASS**
- TIER_C_NOT_AUTO_DISCOVERY: **PASS**
- REVIEW_NOT_AUTO_DISCOVERY: **PASS**
- UNKNOWN_NOT_AUTO_DISCOVERY: **PASS**
- EXCLUDED_NOT_AUTO_DISCOVERY: **PASS**

## Commercial invariants

- AUTO_DISCOVERY_FINAL_COUNT_144: **PASS**
- AUTO_DISCOVERY_NO_QUOTA: **PASS**
- AUTO_DISCOVERY_SELLABILITY_REVIEW_APPLIED: **PASS**
- BORDERLINE_HUMAN_DECISIONS_APPLIED: **PASS**
- A_TO_B_22_APPLIED: **PASS**
- TO_C_56_APPLIED: **PASS**

## Sellability invariants

- Tiers A/B são os únicos elegíveis ao discovery automático: **PASS**
- Tier C permanece no escopo, mas fora do discovery automático: **PASS**
- REVIEW, UNKNOWN e EXCLUDED ficam fora do discovery automático: **PASS**
- Preço, desconto, comissão e score não são entradas do classificador: **PASS**
- Branches mistas usam regras explícitas ou REVIEW; não há promoção automática por nome: **PASS**

## Qualitative safety review

O conjunto automático contém 144 de 3269 categorias. As regras com maior cobertura foram revisadas acima; branches amplas de peças, acessórios, performance, tuning, ferramentas e lubrificantes permanecem conservadoras quando a ancestralidade não prova escopo e vendabilidade.

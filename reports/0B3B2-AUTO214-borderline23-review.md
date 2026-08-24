# 0B3B2-AUTO214-BORDERLINE23 — Human Review

> Revisão humana assistida. Nenhuma decisão aplicada.

- `RECOMMENDATION_ONLY = true`
- `HUMAN_APPROVAL_REQUIRED = true`
- Escopo: exatamente 23 categorias previamente classificadas como `MOVE_TO_REVIEW`.
- Método: análise offline de ID, nome, caminho, ancestralidade, tier, família, regra, tipo de nó, flags e justificativa anterior.
- Alterações aplicadas: nenhuma.

## SUMMARY TABLE

| # | ID | Nome | Tier atual | Recomendação Codex | Decisão humana |
|---:|---|---|---|---|---|
| 1 | MLB116501 | Outros | B | REVIEW | PENDENTE |
| 2 | MLB22675 | Capas | B | REVIEW | PENDENTE |
| 3 | MLB271259 | Protetores de Mãos | B | REVIEW | PENDENTE |
| 4 | MLB458058 | Carregadores Portáteis | A | REVIEW | PENDENTE |
| 5 | MLB392346 | Lubrificantes | A | KEEP_B | PENDENTE |
| 6 | MLB440131 | Outros | B | REVIEW | PENDENTE |
| 7 | MLB437338 | Outros | B | REVIEW | PENDENTE |
| 8 | MLB437340 | Outros | B | REVIEW | PENDENTE |
| 9 | MLB440302 | Travas e Elásticos | B | REVIEW | PENDENTE |
| 10 | MLB194016 | Outros | A | REVIEW | PENDENTE |
| 11 | MLB458223 | Outros | B | REVIEW | PENDENTE |
| 12 | MLB458233 | Outros | B | REVIEW | PENDENTE |
| 13 | MLB458235 | Outros | B | REVIEW | PENDENTE |
| 14 | MLB458244 | Outros | B | REVIEW | PENDENTE |
| 15 | MLB458249 | Outros | B | REVIEW | PENDENTE |
| 16 | MLB3386 | Acessórios | B | KEEP_B | PENDENTE |
| 17 | MLB45372 | Outros | B | REVIEW | PENDENTE |
| 18 | MLB194028 | Outros | A | REVIEW | PENDENTE |
| 19 | MLB429227 | Outros | A | REVIEW | PENDENTE |
| 20 | MLB432538 | Outros | A | REVIEW | PENDENTE |
| 21 | MLB439465 | Outros | B | REVIEW | PENDENTE |
| 22 | MLB456123 | Outros | A | REVIEW | PENDENTE |
| 23 | MLB8532 | Acessórios | B | KEEP_B | PENDENTE |

## CASOS — ACESSÓRIOS DE CARRO

### 1. MLB116501 — Outros

**Caminho:** Acessórios para Veículos > Aces. de Carros e Caminhonetes > Exterior > Racks e Bagageiros > Outros
**Hoje:** Tier B / `car_accessories` / `car-accessories.racks.descendants`
**Regra-base / nó:** MLB73312 / leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — MOTOS

### 2. MLB22675 — Capas

**Caminho:** Acessórios para Veículos > Aces. de Motos e Quadriciclos > Capas
**Hoje:** Tier B / `motorcycle_accessories` / `motorcycle-accessories.covers`
**Regra-base / nó:** EXACT / leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O produto é claro, mas o ramo mistura motos e quadriciclos e não separa a aplicação.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** A mistura moto/quadriciclo é um critério explícito de revisão humana.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 3. MLB271259 — Protetores de Mãos

**Caminho:** Acessórios para Veículos > Aces. de Motos e Quadriciclos > Protetores de Mãos
**Hoje:** Tier B / `motorcycle_accessories` / `motorcycle-accessories.hand-guards`
**Regra-base / nó:** EXACT / leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O produto é específico e reconhecível, porém o ramo não distingue moto de quadriciclo.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** Seria C se o escopo de moto estivesse comprovado; a mistura do ramo impede essa certeza.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 4. MLB458058 — Carregadores Portáteis

**Caminho:** Acessórios para Veículos > Aces. de Motos e Quadriciclos > Carregadores Portáteis
**Hoje:** Tier A / `motorcycle_accessories` / `motorcycle-accessories.portable-chargers`
**Regra-base / nó:** EXACT / leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O nome é genérico e o ramo misto não mostra se são produtos automotivos universais ou aplicações específicas.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** Pode conter carregadores úteis e eletrônicos genéricos demais para descoberta automática.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — LIMPEZA

### 5. MLB392346 — Lubrificantes

**Caminho:** Acessórios para Veículos > Limpeza Automotiva > Lubrificantes
**Hoje:** Tier A / `automotive_cleaning` / `cleaning.descendants`
**Regra-base / nó:** MLB188063 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O nome indica manutenção recorrente, mas a posição em Limpeza Automotiva pode indicar lubrificantes de detalhamento.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** KEEP_B
**Motivo:** O caminho confirma produto automotivo, utilidade recorrente e categoria ampla; Tier B expressa a cautela adequada.
**Se mantivermos automático:** Preserva um consumível automotivo recorrente com confiança moderada.
**Se tirarmos do automático:** Reduz possível ruído, mas perde uma categoria automotiva clara e recorrente.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — FERRAMENTAS

### 6. MLB440131 — Outros

**Caminho:** Acessórios para Veículos > Ferramentas para Veículos > Medição > Medidores de Pressão > Outros
**Hoje:** Tier B / `vehicle_tools` / `tools.measurement.descendants`
**Regra-base / nó:** MLB455307 / leaf
**Flags:** `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — SEGURANÇA

### 7. MLB437338 — Outros

**Caminho:** Acessórios para Veículos > Segurança Veicular > Travas e Elásticos > Travas > Outros
**Hoje:** Tier B / `vehicle_security` / `security.descendants`
**Regra-base / nó:** MLB2239 / leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 8. MLB437340 — Outros

**Caminho:** Acessórios para Veículos > Segurança Veicular > Travas e Elásticos > Elásticos > Outros
**Hoje:** Tier B / `vehicle_security` / `security.descendants`
**Regra-base / nó:** MLB2239 / leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 9. MLB440302 — Travas e Elásticos

**Caminho:** Acessórios para Veículos > Segurança Veicular > Travas e Elásticos
**Hoje:** Tier B / `vehicle_security` / `security.descendants`
**Regra-base / nó:** MLB2239 / non-leaf
**Flags:** `UNIVERSAL_ACCESSORY`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O nó agrupa travas de segurança e elásticos de amarração, duas naturezas comerciais diferentes.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** A mistura de naturezas e o fato de não ser folha exigem decisão humana.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — PEÇAS DE CARRO

### 10. MLB194016 — Outros

**Caminho:** Acessórios para Veículos > Peças de Carros e Caminhonetes > Filtros > Outros
**Hoje:** Tier A / `filters` / `car-parts.filters.descendants`
**Regra-base / nó:** MLB191834 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 11. MLB458223 — Outros

**Caminho:** Acessórios para Veículos > Peças de Carros e Caminhonetes > Iluminação > Luzes Exteriores > Outros
**Hoje:** Tier B / `lighting` / `car-parts.lighting.exterior.descendants`
**Regra-base / nó:** MLB458211 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 12. MLB458233 — Outros

**Caminho:** Acessórios para Veículos > Peças de Carros e Caminhonetes > Iluminação > Faróis > Outros
**Hoje:** Tier B / `lighting` / `car-parts.lighting.headlights.descendants`
**Regra-base / nó:** MLB458231 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 13. MLB458235 — Outros

**Caminho:** Acessórios para Veículos > Peças de Carros e Caminhonetes > Iluminação > Luzes Internas > Outros
**Hoje:** Tier B / `lighting` / `car-parts.lighting.interior.descendants`
**Regra-base / nó:** MLB458234 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 14. MLB458244 — Outros

**Caminho:** Acessórios para Veículos > Peças de Carros e Caminhonetes > Iluminação > Posição Lateral e Piscas > Outros
**Hoje:** Tier B / `lighting` / `car-parts.lighting.turn-signals.descendants`
**Regra-base / nó:** MLB458243 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 15. MLB458249 — Outros

**Caminho:** Acessórios para Veículos > Peças de Carros e Caminhonetes > Iluminação > Lâmpadas e LEDs > Outros
**Hoje:** Tier B / `lighting` / `car-parts.lighting.bulbs-leds.descendants`
**Regra-base / nó:** MLB458247 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — SOM

### 16. MLB3386 — Acessórios

**Caminho:** Acessórios para Veículos > Som Automotivo > Reprodutores > Acessórios
**Hoje:** Tier B / `car_audio` / `car-audio.descendants`
**Regra-base / nó:** MLB3381 / non-leaf
**Flags:** `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O nome é amplo e o nó agrega descendentes, embora a ancestralidade seja inteiramente de som automotivo.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** KEEP_B
**Motivo:** O caminho comprova produto automotivo, família comercial clara e uso ligado a reprodutores; Tier B expressa a amplitude.
**Se mantivermos automático:** Preserva acessórios de instalação e uso de som automotivo.
**Se tirarmos do automático:** Reduz periféricos, mas perde uma família comercial coerente.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 17. MLB45372 — Outros

**Caminho:** Acessórios para Veículos > Som Automotivo > Reprodutores > Acessórios > Outros
**Hoje:** Tier B / `car_audio` / `car-audio.descendants`
**Regra-base / nó:** MLB3381 / leaf
**Flags:** `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — LUBRIFICANTES

### 18. MLB194028 — Outros

**Caminho:** Acessórios para Veículos > Lubrificantes e Fluidos > Carros e Caminhonetes > Outros
**Hoje:** Tier A / `lubricants_fluids` / `lubricants.car-pickup.descendants`
**Regra-base / nó:** MLB194025 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 19. MLB429227 — Outros

**Caminho:** Acessórios para Veículos > Lubrificantes e Fluidos > Motos > Outros
**Hoje:** Tier A / `lubricants_fluids` / `lubricants.motorcycle.descendants`
**Regra-base / nó:** MLB439944 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 20. MLB432538 — Outros

**Caminho:** Acessórios para Veículos > Lubrificantes e Fluidos > Carros e Caminhonetes > Óleos > Outros
**Hoje:** Tier A / `lubricants_fluids` / `lubricants.car-pickup.descendants`
**Regra-base / nó:** MLB194025 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 21. MLB439465 — Outros

**Caminho:** Acessórios para Veículos > Lubrificantes e Fluidos > Líquidos > Outros
**Hoje:** Tier B / `lubricants_fluids` / `lubricants.fluids.descendants`
**Regra-base / nó:** MLB439463 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

### 22. MLB456123 — Outros

**Caminho:** Acessórios para Veículos > Lubrificantes e Fluidos > Motos > Óleos > Outros
**Hoje:** Tier A / `lubricants_fluids` / `lubricants.motorcycle.descendants`
**Regra-base / nó:** MLB439944 / leaf
**Flags:** `MAINTENANCE_RECURRING`, `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O ramo é automotivo, mas "Outros" não identifica os produtos nem comprova aplicação, amplitude ou vendabilidade.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** MOVE_TO_REVIEW
**Motivo:** O residual pode reunir produtos úteis, acessórios e aplicações específicas; só a taxonomia não separa esses casos.
**Se mantivermos automático:** Amplia cobertura do ramo, com risco de incluir produtos heterogêneos ou específicos.
**Se tirarmos do automático:** Reduz cobertura residual, mas preserva precisão até existir evidência no nível dos produtos.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## CASOS — NAVEGAÇÃO

### 23. MLB8532 — Acessórios

**Caminho:** Acessórios para Veículos > Navegadores GPS para Vehículos > Acessórios
**Hoje:** Tier B / `vehicle_navigation` / `navigation.descendants`
**Regra-base / nó:** MLB8531 / non-leaf
**Flags:** `POSSIBLE_OVERBROAD_RULE`, `INSUFFICIENT_STRUCTURAL_EVIDENCE`
**Por que ficou em dúvida:** O nome é amplo e o nó agrega descendentes, embora o caminho seja exclusivamente de navegação veicular.
**Justificativa anterior:** Path e regra herdada não comprovam amplitude comercial suficiente ou contêm residual ambíguo; requer revisão humana antes de permanecer ALLOWED.
**Minha recomendação:** KEEP_B
**Motivo:** A ancestralidade comprova produto veicular, utilidade comercial clara e família ampla; Tier B mantém cautela.
**Se mantivermos automático:** Preserva suportes, energia e instalação de GPS veicular.
**Se tirarmos do automático:** Reduz periféricos, mas perde uma família veicular coerente.

**DECISÃO HUMANA:**
[ ] KEEP_B
[ ] C
[ ] REVIEW

## HIGH-CONFIDENCE RESOLUTIONS

Nenhum caso recebeu `DOWNGRADE_TO_C`: nos produtos específicos restantes, a mistura moto/quadriciclo impede confirmar o escopo somente pela taxonomia.

## TRUE BORDERLINE

MOVE_TO_REVIEW continua sendo a opção mais segura para 20 casos: MLB116501, MLB22675, MLB271259, MLB458058, MLB440131, MLB437338, MLB437340, MLB440302, MLB194016, MLB458223, MLB458233, MLB458235, MLB458244, MLB458249, MLB45372, MLB194028, MLB429227, MLB432538, MLB439465, MLB456123.

## POSSIBLE KEEP_B

Três casos talvez mereçam continuar automáticos: MLB392346 (Lubrificantes), MLB3386 (Acessórios de som automotivo) e MLB8532 (Acessórios de GPS veicular).

## RECOMMENDATION COUNTS

- `RECOMMEND_KEEP_B = 3`
- `RECOMMEND_C = 0`
- `RECOMMEND_REVIEW = 20`
- `TOTAL = 23`
- `SCOPE_BUG_FOUND = false`

## FINAL AUTO IF ACCEPTED

`FINAL_AUTO_IF_ALL_RECOMMENDATIONS_ACCEPTED = 135 + 3 = 138`. C e REVIEW não entram no automático.

## FOLHA DE DECISÃO HUMANA

| # | ID | Nome | Recomendação Codex | Decisão humana |
|---:|---|---|---|---|
| 1 | MLB116501 | Outros | REVIEW | PENDENTE |
| 2 | MLB22675 | Capas | REVIEW | PENDENTE |
| 3 | MLB271259 | Protetores de Mãos | REVIEW | PENDENTE |
| 4 | MLB458058 | Carregadores Portáteis | REVIEW | PENDENTE |
| 5 | MLB392346 | Lubrificantes | KEEP_B | PENDENTE |
| 6 | MLB440131 | Outros | REVIEW | PENDENTE |
| 7 | MLB437338 | Outros | REVIEW | PENDENTE |
| 8 | MLB437340 | Outros | REVIEW | PENDENTE |
| 9 | MLB440302 | Travas e Elásticos | REVIEW | PENDENTE |
| 10 | MLB194016 | Outros | REVIEW | PENDENTE |
| 11 | MLB458223 | Outros | REVIEW | PENDENTE |
| 12 | MLB458233 | Outros | REVIEW | PENDENTE |
| 13 | MLB458235 | Outros | REVIEW | PENDENTE |
| 14 | MLB458244 | Outros | REVIEW | PENDENTE |
| 15 | MLB458249 | Outros | REVIEW | PENDENTE |
| 16 | MLB3386 | Acessórios | KEEP_B | PENDENTE |
| 17 | MLB45372 | Outros | REVIEW | PENDENTE |
| 18 | MLB194028 | Outros | REVIEW | PENDENTE |
| 19 | MLB429227 | Outros | REVIEW | PENDENTE |
| 20 | MLB432538 | Outros | REVIEW | PENDENTE |
| 21 | MLB439465 | Outros | REVIEW | PENDENTE |
| 22 | MLB456123 | Outros | REVIEW | PENDENTE |
| 23 | MLB8532 | Acessórios | KEEP_B | PENDENTE |

Nenhuma caixa foi marcada e nenhuma decisão foi aplicada. O próximo passo depende de aprovação humana explícita para cada linha.

## RESULTADO DOS GATES

- `BORDERLINE_COUNT = 23`
- `UNIQUE_IDS = 23`
- `RECOMMENDATION_ONLY = true`
- `HUMAN_APPROVAL_REQUIRED = true`
- `BASELINE_TEST = PASS (13/13)`
- `SNAPSHOT_SHA256 = c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2`
- `SECRET_SCAN = PASS` — os três padrões amplos encontrados já pertencem a testes rastreados e inalterados; nenhum valor novo no relatório.
- `MERCADO_LIVRE_LIVE_CALLS = 0`
- `DATABASE_SUPABASE_CHANGES = 0`
- `OAUTH_CHANGES = 0`
- `PRODUCT_DISCOVERY_CALLS = 0`
- `CODE_CHANGES = 0`
- `RULESET_CHANGES = 0`
- `SCOPE_BUG_FOUND = false`
- `COMMIT = none`
- `PUSH = none`
- `HEAD = f74199e24531b18b07f4a1f4ea471e15694e01e3`
- Working tree: somente os dois relatórios locais não versionados; nenhum diff rastreado.

## LIMITAÇÕES

- A decisão usa somente a taxonomia e o relatório offline; não inspeciona anúncios nem produtos live.
- As três recomendações KEEP_B continuam sendo recomendações, não decisões aplicadas.
- Os 20 casos REVIEW permanecem fora do automático até decisão humana.

## NEXT STEP

O usuário deve escolher KEEP_B, C ou REVIEW para cada uma das 23 linhas. Só depois poderá ser autorizado um FIX único e separado.

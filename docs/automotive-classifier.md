# Classificador automotivo determinístico

## Finalidade

O classificador 0B3B2 transforma um ID de categoria presente em uma `TaxonomyTree` normalizada em uma decisão comercial auditável. Ele é puro, offline e independente de API, OAuth, banco, preço, desconto, comissão, score, relógio ou inteligência artificial.

Versão semântica: `automotive-classifier/mlb/v1`.

## Escopo comercial do MVP

O universo permitido é restrito a produtos para carros, caminhonetes e motocicletas. Ficam fora do MVP:

- caminhões, ônibus e linha pesada;
- máquinas, agro e aplicações industriais;
- náutica e aeronaves;
- bicicletas, patinetes, carrinhos e quadriciclos;
- veículos completos;
- serviços;
- toda a árvore de GNV.

Uma categoria tecnicamente automotiva não é automaticamente comercialmente prioritária.

## Resultado

Cada categoria conhecida recebe um dos estados:

- `ALLOWED`: pertence ao escopo comercial;
- `REVIEW`: exige decisão humana antes de uso;
- `EXCLUDED`: está explicitamente fora do escopo;
- `UNKNOWN`: não encontrou evidência estrutural suficiente.

Categorias desconhecidas na própria árvore geram erro tipado. Categorias válidas da árvore, mas fora de `MLB5672`, recebem `EXCLUDED / OUTSIDE_ROOT`.

O resultado informa o ID da regra, o match exato ou ancestral, a família semântica, a versão e a justificativa. `commercialFamilyKeyDefault` permanece `null` neste BUILD.

## Tiers e vendabilidade

- Tier A: grupo amplo, recorrente e prioritário; entra no discovery automático.
- Tier B: demanda normal e comercialmente útil; entra no discovery automático.
- Tier C: item válido, porém específico ou de menor amplitude; não entra no discovery automático.

`isAutomaticAutomotiveDiscoveryEligible()` retorna `true` somente para `ALLOWED/A` e `ALLOWED/B`. Tier C, REVIEW, UNKNOWN e EXCLUDED sempre retornam `false`.

Desconto não compensa baixa vendabilidade. O classificador não recebe preço, desconto histórico, comissão ou score.

## Precedência

1. validação de contexto, raiz e existência do nó;
2. categoria fora da raiz;
3. regra exata;
4. ancestral mais próximo;
5. fallback `UNKNOWN`.

Regras exatas vencem herança. Entre ancestrais, o mais próximo vence. A identidade é exclusivamente o ID; nomes nunca participam do match.

## Fail closed

Branches mistas têm raiz em REVIEW e só liberam IDs ou subárvores auditadas. Ausência de regra não produz ALLOWED nem tier. Uma regra ALLOWED sob ancestral EXCLUDED é rejeitada pela validação, salvo override exato e explicitamente marcado.

## Políticas congeladas

### Serviços e veículos completos

Toda `MLB377674`, `MLB457400` e toda `MLB458209` são EXCLUDED.

### Linha pesada, náutica e GNV

As subárvores `MLB419936`, `MLB438364`, `MLB6005`, `MLB456046` e `MLB45468` são EXCLUDED. Aplicações pesada, náutica, agro e industrial dentro de lubrificantes também são excluídas por IDs auditados.

### Pneus e rodas

Em pneus, somente `MLB2233` (carros/caminhonetes) e `MLB3933` (motos) são A. Aplicações para quadriciclo, caminhão, agrícola, industrial, aeronave, bicicleta, patinete e carrinho são EXCLUDED. Câmaras, selantes e “Outros” ficam em REVIEW.

Em rodas, carro/caminhonete e moto são B; caminhão e quadriciclo são EXCLUDED; residuais permanecem REVIEW.

### Branches mistas

Peças e acessórios de motos/quadriciclos não herdam permissão ampla. Categorias claramente exclusivas de moto podem receber regra exata; itens de quadriciclo são EXCLUDED; categorias ambíguas ficam em REVIEW.

Peças de carros não herdam A/B pela raiz. Filtros comuns recebem A, freios e iluminação comuns recebem B, enquanto descendentes específicos ficam em C. Suspensão é válida em C por padrão. Isso impede que uma ancestralidade ampla promova peças raras.

Lubrificantes separam carro/caminhonete, moto, fluidos e graxas das aplicações pesada, náutica e agro/industrial.

### Famílias iniciais

O ruleset usa chaves `snake_case` somente quando há coerência factual: `tires`, `wheels`, `filters`, `brakes`, `suspension`, `lighting`, `battery`, `lubricants_fluids`, `vehicle_tools`, `tire_inflators`, `automotive_cleaning`, `vehicle_security`, `car_audio`, `vehicle_navigation`, `car_accessories` e `motorcycle_accessories`.

## Validação

`validateAutomotiveClassifierRules()` verifica versão, raiz, contexto MLB, IDs existentes, unicidade de regras, decisões/tier, chaves semânticas, conflitos e permissões acidentais sob ancestrais excluídos.

## Cobertura offline

O relatório é regenerado sem rede com:

```powershell
pnpm exec tsx scripts/generate-automotive-classifier-coverage.ts
```

Fonte única: `tests/fixtures/meli-automotive-taxonomy.snapshot.json`. O gerador falha se qualquer invariante comercial obrigatório for violado.

## Limites deste BUILD

Não há persistência, migration, sync de registry, coleta, scheduler ou chamada Mercado Livre. O mismatch do schema de persistência para tier nulo será tratado somente no 0B3C.

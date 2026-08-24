# Snapshot sanitizado da taxonomia automotiva

O snapshot versionado em `tests/fixtures/meli-automotive-taxonomy.snapshot.json` contém somente a subtree normalizada de `MLB5672`. Ele é uma fixture factual para auditoria e testes; não contém classificação comercial.

## Conteúdo e origem

O comando manual `pnpm snapshot:automotive-taxonomy` faz uma única execução lógica de `MeliTaxonomyAdapter.fetchCategoryTree("MLB")`, sem autenticação. O snapshot é construído exclusivamente a partir do `TaxonomyTreeEnvelope` normalizado e validado. O payload bruto, `fetchedAt`, headers não aprovados, produtos, ofertas e credenciais não são persistidos.

O comando não participa de `test`, `build`, instalação, CI ou deploy. Os testes regulares leem somente a fixture já versionada e verificam estrutura, ordenação, determinismo e o sidecar SHA-256.

## Regeneração futura

A regeneração só deve ocorrer em um BUILD/gate explicitamente aprovado:

1. confirmar branch, HEAD e working tree esperados;
2. registrar o checksum do snapshot e do relatório R3 existentes;
3. remover ou mover de forma controlada os três outputs que o gerador cria com proteção `write-if-absent`;
4. executar o comando manual exatamente uma vez;
5. revisar drift, root children, auditoria direcionada e diff completo;
6. executar todos os testes e secret scan antes de versionar.

Não executar novamente apenas para confirmar um resultado. Retry de transporte permanece limitado ao comportamento defensivo do adapter; uma nova execução lógica exige novo gate.

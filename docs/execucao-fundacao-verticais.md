# Fundação das dez verticais

## Incremento implementado

Configuração persistida de dez verticais com capacidade individual de 100 monitorados e meta editorial de até três publicações diárias. Somente AUTOMOTIVE permanece habilitada; as demais aguardam regras comerciais, categorias e prova de dados.

Vínculos comerciais usam a chave vertical + identidade. Preços continuam na tabela de evidências existente, sem cópia ou descarte. O feedback foi separado por vertical, com backfill e ponte de compatibilidade para os registros automotivos antigos.

A promoção automotiva passa a respeitar sua configuração de 100 vagas. Reserva e reativação por feedback usam trava transacional; marcar Interesse em uma lista cheia salva a preferência sem ultrapassar a capacidade. Consultas de ranking e revalidação leem apenas o feedback automotivo. A API rejeita outra vertical explicitamente, evitando aplicar suas decisões ao público errado enquanto o executor ainda é exclusivo de Automotivo.

## Limites intencionais deste incremento

As novas tabelas constituem a fundação, não a ativação de 1.000 produtos. O executor histórico e a fila de exploração continuam automotivos. A ponte de compatibilidade atribui gravações do executor antigo a AUTOMOTIVE; o executor multivertical deve substituir essa ponte antes de coletar Casa. Nunca habilitar outra vertical apenas alterando enabled no banco.

O campo rules_version registra a versão aprovada, mas não implementa critérios comerciais de outras verticais. A meta editorial não equivale a um agendador de publicações. O lote de 48 e os dois horários históricos atuais ainda precisam ser substituídos pela distribuição retomável prevista no plano. A capacidade nominal de 100 não garante 100 preços diários na rotina atual.

## Validação e implantação

Migração aditiva: `20260907100000_commercial_vertical_foundation.sql`. Aplicar antes do novo runtime, pois as consultas passam a depender da tabela de feedback contextual. A ponte mantém compatibilidade com o runtime anterior durante a implantação. Rollback do runtime deve preservar essas tabelas e o histórico.

Testes SQL executados em transação com rollback cobrem backfill, isolamento do feedback, vaga compartilhada entre verticais sem duplicar preços, bloqueio de vertical desativada, capacidade máxima, reativação e privilégios. O teste de admissão também verifica que marcar Interesse não ultrapassa uma lista cheia.

Build aprovado; suíte completa com 64 arquivos e 677 testes aprovados. Migração aplicada no Supabase e verificada por leitura: dez verticais, capacidade nominal total de 1.000, apenas uma habilitada, 54 monitorados automotivos e nenhum vínculo histórico ausente no backfill.

Próxima entrega: executor com fila persistente, orçamento de API e distribuição justa de coletas; depois prova de dados e ativação progressiva de Casa.

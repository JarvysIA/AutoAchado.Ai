# Casa — operação ativada em 12/09/2026

## Estado verificado

HOME está habilitada no Supabase e publicada na dashboard. Carteira de 100 produtos únicos, em duas páginas de 50. Todos os cards retornaram preço, foto, link e avaliação. A renderização do script da dashboard foi exercitada com a resposta real da API, incluindo campo de afiliado, cópia e paginação. Nenhuma oferta aprovada historicamente no início; nenhum envio realizado.

Foram gravados 317 candidatos nas 29 categorias. Ao fim da carga inicial havia 1.143 observações de preço, todas com timestamps reais. Isso não representa 1.143 dias nem produtos distintos. Os 100 monitorados se distribuem em cozinha 25, organização 25, limpeza 25, lavanderia 19 e banheiro 6.

Automotivo permaneceu com 100 monitorados antes e depois da carga.

## Rotina

- Histórico: a cada hora, minuto 17, até 25 produtos vencidos. Preço elegível agenda nova consulta em 12 horas; falha deixa nova tentativa para cerca de uma hora. Não significa consultar todos os 100 a cada hora.
- Descoberta: diariamente às 03h37 de Brasília. Percorre até os 20 registros de produto de cada ranking disponível, valida raiz e coerência editorial, deduplica por ID e respeita o orçamento de execução. Categorias não concluídas retomam em outra execução.
- Capacidade: 100 vagas, teto de 25 por família. Substituições até cinco por dia de São Paulo, com vantagem mínima de pontuação e proteção aos produtos marcados como interessantes. Retirar um produto não apaga observações ou divulgação anterior.
- Envio: continua sujeito à revisão do operador e confirmação do WhatsApp. A ativação do coletor não envia mensagens. O destino HOME depende de configuração/confirmacão separada na Central WhatsApp.

## Isolamento e dados

As tabelas home_candidates, home_observations, home_rank_observations, home_runs, home_category_checks e home_renewals isolam o executor dos gatilhos legados automotivos. Identidade HOME usa catálogo exato, condição nova e BRL; somente previews comparáveis persistem preços. Produtos de outro recorte ficam fora da admissão. Preços HOME não são mesclados automaticamente com o histórico legado de Automotivo nesta versão.

Os registros de preços e posição de ranking são separados. Repetições no mesmo dia não simulam dias de recorrência. Ofertas de vendedores adicionais só entram quando a API fornece evidência comparável do mesmo catálogo.

Rankings e perfis de Casa são usados na seleção; original_price é desconto anunciado, não comprovação histórica. Aprovação mantém as exigências de desconto histórico, demanda, confiança e correspondência de anúncio/preço. A limitação de consulta de anúncios do ML permanece relevante; somente a passagem de dias não garante aprovação.

## Verificações concluídas

Testes unitários e de endpoint, build e artefato Vercel aprovados. Teste transacional remoto com rollback validou 100 vagas, limite por família, exclusão de coletas simultâneas e preservação de Automotivo. Duas descobertas terminaram sem falhas registradas. A primeira rodada de acompanhamento consultou 25 produtos e terminou sem falhas. Diagnóstico protegido STATUS confirmou 100 identidades HOME, com resposta paginada 50+50 e campos completos.

As consultas autenticadas pelo segredo técnico funcionaram. A configuração local antiga de sessão não autenticou a rota de usuário; não se afirmou inspeção visual na sessão pessoal do operador. A validação do serviço usou a API de produção protegida e o script de renderização com dados reais.

## Administração e reversão

GET /api/commercial/home-run?kind=STATUS (offset opcional) é leitura protegida por CRON_SECRET. HISTORY e DISCOVERY usam trava própria, reservada por até seis minutos. Coletas interrompidas não reutilizam dias falsos.

Para pausar Casa: desabilitar apenas HOME em commercial_verticals. Os despachos programados passam a não iniciar coleta, preservando dados. Não remover tabelas nem desfazer históricos para pausar o piloto. O deploy anterior pode ser restaurado separadamente se necessário.

O grupo de Casa ainda aguardava confirmação explícita da revisão automática no encerramento desta verificação; não foi enviada mensagem de teste.

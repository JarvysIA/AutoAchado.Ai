# Preparação antes de Casa — 08/09/2026

## Objetivo e estado

Manter 100 vagas automotivas úteis, formar evidência confiável e preparar a expansão sem ativar HOME. Admissão ao acompanhamento não equivale a aprovação para divulgação. O ranking continua exigindo histórico, desconto, demanda recorrente, identidade comparável e vendedor confiável.

## Controles implementados

1. **Revisão editorial versionada:** ELIGIBLE indica hipótese comercial adequada, REVIEW exige informação adicional, EXCLUDE identifica uso especializado ou instalação/aplicação inadequada ao público amplo inicial. A avaliação fica persistida por identidade e fonte, com motivo e validade. Na amostra anterior de 100: 61 editorialmente elegíveis, 13 em revisão e 26 fora do perfil. A disponibilidade atual pode reduzir a elegibilidade final.
2. **Composição gradual:** teto inicial de 25 por família nas novas admissões. Até cinco substituições por dia civil de São Paulo, apenas quando existe candidato qualificado, atual e de outra família. Prioriza EXCLUDE e depois famílias acima do teto. Não preenche vagas com produtos sem qualidade. Produtos enviados, SHARED ou INTERESTED são protegidos. Cada troca registra saída, entrada, motivo e data; não apaga observações ou fontes antigas. Um retirado não volta automaticamente por essa mesma fila.
3. **Preços e retries:** preserva rotina horária, lote configurado de até 25 e reconfirmação em 12 horas; erros recebem retry persistido. Uma coleta que estava em andamento não reativa monitoramento interrompido pelo usuário. A admissão registra o primeiro preço já validado com seu timestamp original, sem inventar horário ou posição de ranking nem sobrescrever observações.
4. **Cobertura auditável:** amostra presente na migração e após cada execução histórica concluída, inclusive parcial ou falha. Não reconstrói retrospectivamente cobertura que não foi medida. Critério operacional: sete dias decorridos de amostragem, mínimo de 95% dos monitorados com preço comparável nas últimas 24 horas e nenhuma lacuna de amostragem acima de duas horas. Isso mede saúde operacional; não concede desconto histórico nem comprova vendas.
5. **Variantes:** marca/modelo gera somente alerta de inspeção. A identidade canônica continua sendo o catálogo exato, com condição/moeda/contexto comparáveis. Modelos parecidos não compartilham histórico por título. A inspeção autenticada verifica atributos dos dois Electrolux AWD01 identificados na amostra.
6. **Preparação por vertical:** capacidade, feedback, orçamento de lote e prontidão do executor ficam explícitos no banco. HOME segue desativada e sem executor liberado. O executor de descoberta e a ponte de persistência continuam automotivos; adaptar esses dois componentes é condição de ativação de Casa, não uma funcionalidade já concluída.
7. **Prova de Casa:** endpoint técnico autenticado por segredo, com caminhos fixos, percorre no máximo 20 categorias e resolve até 30 produtos de rankings. Seleciona ramos candidatos de cozinha, organização, limpeza, lavanderia e banheiro. Não grava fila, histórico, monitoramento ou mapeamento HOME. O resultado é uma amostra técnica, sem alegação de 100 candidatos provados ou aprovação editorial.

## Como verificar

A migração possui uma reversão de compatibilidade em `scripts/rollback-pre-home-quality.sql`: restaura a promoção anterior e desliga o novo trigger de amostragem, preservando tabelas, auditoria e preços. Deve acompanhar a reversão do deployment; não desfaz retroativamente substituições já registradas.

- `commercial_editorial_assessments`: classificação, motivo, versão, alerta de variante e validade do preço avaliado.
- `commercial_cohort_changes`: substituições efetuadas; o limite considera o dia civil em America/Sao_Paulo.
- `commercial_health_samples`: cobertura observada em cada execução.
- `commercial_pre_home_readiness()`: janela, cobertura mínima, maior lacuna e situação de HOME. Apenas service role.
- `POST /api/commercial/pre-home`: revisão e prova técnica restrita; exige CRON_SECRET, não aceita URLs externas fornecidas pelo cliente.
- A listagem comercial inclui `preparation` com o diagnóstico da janela; os controles técnicos não acrescentam um segundo menu ao usuário.

## Condições ainda necessárias para iniciar Casa

1. Completar a janela real de saúde operacional. A rotina horária começou em 07/09; a medição persistida da cobertura começa nesta entrega, sem dados retroativos inventados.
2. Revisar a amostra autenticada HOME, selecionar descendentes canônicos e regras próprias. A raiz contém móveis e decoração que não entram automaticamente no recorte.
3. Implementar e testar descoberta, fila e executor efetivamente isolados por vertical, substituindo a ponte automática exclusivamente automotiva. Reservar tempo de execução sem reduzir cobertura de Automotivo.
4. Provar pelo menos 50 candidatos distintos e completos, rumo a 100; o limite da prova inicial não garante esse estoque. Testar o ciclo completo com HOME ainda desativada antes da ativação controlada.

Não é necessário esperar 30 dias para desenvolver esses componentes. Histórico maduro de desconto continua dependendo dos dias e vendedores observados de cada produto. Desejo de compra é hipótese comercial, a validar com feedback e conversões reais.

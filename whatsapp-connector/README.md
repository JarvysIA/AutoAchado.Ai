# Conector WhatsApp Web — Cyber Ofertas

O notebook processa somente envios explicitamente confirmados na dashboard. A biblioteca é não oficial e não elimina o risco de bloqueio do WhatsApp. A aba habitual do WhatsApp não é reutilizada: este programa conecta um aparelho separado, via QR Code.

## Iniciar no Windows

1. Node.js 20+ e Chrome ou Edge instalados.
2. Na raiz do projeto, execute `npm ci --prefix whatsapp-connector --ignore-scripts`. O navegador instalado é usado; não baixe arquivos de navegador pelo Puppeteer.
3. Execute `powershell -ExecutionPolicy Bypass -File whatsapp-connector/start.ps1`.
4. Abra `http://127.0.0.1:3210` no notebook.
5. Na dashboard autenticada, abra **WhatsApp — conexão, grupos e envios** e clique em **Conectar notebook / renovar chave**. Importe o JSON baixado na página local.
6. No celular, conecte o QR Code por **Aparelhos conectados**. Depois selecione os grupos na dashboard e habilite os destinos desejados. Recomenda-se cadastrar primeiro um grupo de teste e confirmar uma oferta nele.

Não compartilhe o JSON: ele contém a chave privada do conector. A sessão, configuração e diário ficam em `.state`, ignorado pelo Git. O servidor local escuta apenas em loopback. Nenhuma chave Supabase vai para o notebook. Renove a chave pela dashboard para revogar o conector antigo; isso pausa destinos e cancela pedidos pendentes. Importe a nova configuração na página local.

## Uso

No card, cole o link oficial e clique em **Revisar envio para Automotivo**. A prévia mostra a mensagem revalidada e o grupo. Confirmar coloca na fila. A oferta é consultada novamente antes do disparo; alterações exigem uma nova revisão. Rascunhos expiram em dez minutos; pedidos pendentes, em trinta. Outras verticais aceitam o cadastro de destino, mas não enviam produtos até seus executores serem ativados.

O envio é registrado após ACK do servidor WhatsApp (não significa leitura por todos os participantes). Não há promessa de entrega exatamente uma vez: um resultado incerto fica `UNKNOWN` e não é reenviado. O diário local permite reconciliar confirmação posterior pelo ID da mensagem. Não apague esse diário para tentar novamente. Mensagens com mesmo produto e grupo já enviadas ou incertas ficam bloqueadas nesta versão. Repetições deliberadas exigirão um fluxo específico futuro.

Notebook desligado, suspenso ou sem internet não envia. Inicie o script novamente após reiniciar o Windows. Não instalamos inicialização automática nem alteramos as opções de energia. Se a sessão desconectar, reinicie o processo local; não remova a sessão sem necessidade.

Falhas de navegação interna do WhatsApp são tratadas com tentativas limitadas e reconexão, mantendo a página local disponível. Use **Reconectar WhatsApp** se necessário. Se aparecer **Chave revogada**, importe a configuração mais recente baixada da dashboard; não é necessário gerar outra chave. Renovar a chave na dashboard invalida o arquivo anterior.

## Verificação e limites

`npm test --prefix whatsapp-connector` testa intenção durável, ACK, expiração e falhas sem enviar mensagens reais. Os testes HTTP e SQL ficam no projeto principal. A confirmação real depende do QR Code e de um envio escolhido pelo operador.

Dependências isoladas do bundle Vercel. A auditoria da versão inicial aponta alerta transitivo em `extract-zip`, usado no download de navegadores. A instalação usa `--ignore-scripts` e o Chrome/Edge local, sem esse download. Revisar versões compatíveis quando houver correção; não fazer downgrade automático da biblioteca para silenciar o alerta.

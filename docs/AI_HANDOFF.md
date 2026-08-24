# Passagem de trabalho — Claude + Codex

Atualize este documento no início e no fim de cada tarefa. Não registre segredos.

## Estado atual

- Status: `CONCLUIDO`
- Agente responsável: Codex
- Atualizado em: 2026-08-24
- Branch: `main`
- Objetivo atual: resolver o carregamento e a persistência da configuração de login com PIN.

## Último resultado confirmado

- Repositório oficial clonado do GitHub.
- Protocolo compartilhado criado.
- Contexto técnico inicial registrado em `docs/ARCHITECTURE.md`.
- Relatório funcional do Claude recebido e consolidado em 2026-08-24.
- GitHub confirmado como fonte da verdade. Não usar a cópia local antiga do Claude.
- Último commit informado pelo Claude: `5208d41` (`Update APPS_SCRIPT_URL to the deployed backend URL`).
- Produção provavelmente corresponde à branch `main`, mas isso ainda não foi verificado diretamente.

## Trabalho em andamento

Bug crítico: o aplicativo volta à tela de configuração inicial porque a chave `config` não está sendo recuperada corretamente do Google Sheets.

## Arquivos alterados na tarefa atual

- `AGENTS.md`
- `CLAUDE.md`
- `PROJECT_RULES.md`
- `docs/AI_HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/BACKLOG.md`
- `.gitignore`
- `package-lock.json` (gerado pelo `npm install`)
- `App.jsx`
- `apps-script/Code.gs`
- `apps-script/README.md`

## Verificações executadas

- `npm install`: concluído com sucesso.
- `npm run build`: concluído com sucesso em 2026-08-24.
- Build transformou 2.299 módulos e gerou os artefatos de produção.
- Aviso: o bundle JavaScript principal ficou acima de 500 kB após minificação.
- Auditoria de dependências reportou 2 vulnerabilidades: 1 moderada e 1 alta. Nenhuma correção automática foi aplicada.
- O npm informou que a linha 2.x do Recharts não recebe mais manutenção. Migração não realizada sem análise de compatibilidade.
- Build executado após a correção do login: concluído com sucesso em 2026-08-24.
- Consulta somente de leitura ao backend atual: respondeu `ok`, mas a chave `config` não foi encontrada. Nenhum valor ou PIN foi exibido.
- Função `configurarBancoDeDados` executada com sucesso pelo proprietário em 2026-08-24.
- Backend correto publicado como Web App, versão 4, com acesso anônimo explicitamente autorizado pelo Igor.
- Teste final do backend: resposta `ok`, acesso à planilha confirmado e chave `config` ainda ausente, como esperado antes da criação dos PINs.
- Frontend atualizado para usar a implantação correta do Apps Script.
- Build final concluído com sucesso após a troca do backend.
- Commit principal criado: `32a254e` (`Fix login persistence and add agent handoff`).
- Push para `main` concluído em 2026-08-24.
- Vercel confirmado usando o bundle atualizado e a implantação correta do Apps Script.
- Teste técnico de POST e GET confirmou que o backend persiste dados corretamente.
- Falha restante identificada no navegador: a resposta do POST do Apps Script é bloqueada por CORS.
- Frontend ajustado para POST `no-cors` seguido de confirmação por GET com CORS.
- Backend confirmado com `config` válida, `setupCompleto` e ambos os PINs presentes, sem exposição dos valores.
- Falha reproduzida: o GET JSONP falha em uma sessão nova, enquanto o GET JSON com CORS responde corretamente.
- Leitura migrada de JSONP para `fetch` GET com CORS e cache desativado.
- Falhas transitórias de backend não exibem mais a configuração inicial; agora mostram erro e opção de tentar novamente.
- Teste automatizado com dois perfis limpos e independentes do Chrome: ambos exibiram a tela de login e nenhum exibiu a configuração inicial.
- Build da correção cross-browser concluído com sucesso.
- Commit cross-browser publicado: `f099657` (`Fix shared login loading across browsers`).
- Vercel confirmado com o hash exato do novo build.
- Teste final na URL pública com dois novos perfis isolados do Chrome: ambos exibiram login; nenhum exibiu configuração inicial ou erro de carregamento.

## Pendências e bloqueios

- Criar os PINs de dono e gestor diretamente no aplicativo publicado.
- Recarregar a página e confirmar que a tela de login persiste.
- Confirmar diretamente se a versão da Vercel corresponde ao commit atual de `main`.
- Avaliar vulnerabilidades de dependências separadamente, sem usar correção forçada.

## Próxima ação exata

Abrir o aplicativo publicado, criar os PINs e confirmar a persistência após recarregar a página.

## Decisões e observações

- `APPS_SCRIPT_URL` é protegido e não deve ser alterado.
- Push para `main` é tratado como ação de produção.
- Conversas dos agentes não são fonte de verdade; Git, build e este documento são.
- Não alterar o GET via JSONP nem o POST `text/plain` durante o diagnóstico do login.
- O Apps Script precisa de uma nova versão de implantação para que mudanças em `Code.gs` cheguem à produção.

## Estado funcional informado pelo Claude

### Funcionando

- Painel e análise financeira.
- Calendário, reservas, repasses e despesas.
- Prestadores e manutenção.
- Configurações e dois perfis de acesso por PIN.
- Alertas operacionais e financeiros.
- DRE mensal e gráficos.
- Importação de CSV do Airbnb.
- Cálculos de comissão, faxina e prestadores.
- Publicação automática da branch `main` na Vercel.

### Incompleto ou não implementado

- Persistência e carregamento do login com PIN: bug crítico atual.
- OCR de comprovantes: código existente, configuração segura da integração ainda pendente.
- Sincronização iCal do Airbnb.
- Alertas por WhatsApp ou e-mail.
- Relatório mensal exportável.

### Hipótese principal do bug

O POST responde com sucesso, mas o GET não recupera a chave `config`. A hipótese mais forte é que a implantação esteja usando o projeto Apps Script incorreto, uma versão antiga, uma planilha diferente ou uma planilha sem a aba `KV`. Essa hipótese precisa ser testada; não está confirmada.

## Correção preparada pelo Codex

- O frontend não avança mais quando a gravação falha.
- Após salvar os PINs, o frontend relê a chave `config` e só conclui se os valores forem confirmados.
- A tela de configurações não informa sucesso quando o backend falha.
- O backend não depende mais de `getActiveSpreadsheet()` durante chamadas do Web App.
- A função `configurarBancoDeDados` grava o ID da planilha nas propriedades do script; as chamadas usam `openById`.
- Gravações usam lock e `SpreadsheetApp.flush()` para reduzir concorrência e garantir persistência antes da resposta.

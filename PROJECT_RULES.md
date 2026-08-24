# Regras compartilhadas — Claude + Codex

## Objetivo

Manter o sistema de gestão do Chalé Serra do Cipó com continuidade segura entre Claude e Codex.

## Contexto obrigatório

- Frontend: React 18, Vite, Tailwind via CDN, Lucide React, Recharts e PapaParse.
- Backend: Google Apps Script ligado à planilha `Chale Cipo - Dados`, aba `KV`.
- Comunicação: leitura por JSONP e gravação por POST `text/plain`.
- Produção: Vercel; alterações enviadas à branch `main` podem ser publicadas automaticamente.
- Arquivos principais: `App.jsx`, `main.jsx`, `index.html`, `package.json` e `vite.config.js`.

## Regras de segurança

1. Não alterar, remover, imprimir ou documentar o valor de `APPS_SCRIPT_URL` sem autorização explícita do Igor.
2. Nunca incluir no Git chaves de API, PINs, tokens, cookies, credenciais, URLs privadas ou dados pessoais de hóspedes.
3. Não executar deploy, push, merge ou alteração no Google Apps Script sem pedido explícito do Igor.
4. Antes de mudar o formato dos dados, mapear compatibilidade com os registros existentes na aba `KV`.
5. Preservar alterações existentes no diretório; não apagar trabalho do outro agente.
6. Não usar comandos destrutivos de Git para resolver conflitos.

## Fluxo de trabalho

1. Ler `docs/AI_HANDOFF.md`, `docs/ARCHITECTURE.md` e `docs/BACKLOG.md`.
2. Conferir o estado do Git e o último commit antes de editar.
3. Registrar no handoff o objetivo e marcar a tarefa como `EM_ANDAMENTO`.
4. Fazer mudanças pequenas e focadas.
5. Rodar `npm run build` e os testes aplicáveis. Se não for possível, registrar o motivo.
6. Revisar o diff procurando credenciais, regressões e mudanças acidentais.
7. Atualizar o handoff com arquivos alterados, verificações, pendências e a próxima ação exata.
8. Só fazer commit ou push quando o Igor pedir. Um push em `main` pode publicar em produção.

## Passagem entre agentes

O agente que parar deve deixar `docs/AI_HANDOFF.md` suficiente para o próximo continuar sem depender da conversa anterior. Fatos confirmados devem ser separados de hipóteses. Mudanças locais não concluídas devem ser descritas, nunca ocultadas.

Se o handoff estiver desatualizado, o agente que assumir deve reconstruir o estado usando Git, código e build antes de continuar.

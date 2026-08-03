# Chalé Serra do Cipó — App de Gestão

App de controle de reservas, repasses, despesas e prestadores, com leitura
automática de comprovantes. Mesma arquitetura do seu app financeiro pessoal:
**frontend no Vercel + Google Sheets/Apps Script como banco de dados.**

Passo a passo completo abaixo — leva uns 15-20 minutos na primeira vez.

---

## Parte 1 — Planilha + Apps Script (o "banco de dados")

1. Crie uma planilha nova no Google Sheets. Pode chamar de `Chale Cipo - Dados`.
2. Nela, crie uma aba chamada exatamente `KV` (não precisa preencher nada).
3. Menu **Extensões → Apps Script**.
4. Apague tudo que estiver em `Code.gs` e cole o conteúdo do arquivo
   `apps-script/Code.gs` deste pacote.
5. **(Opcional, só pra leitura automática de comprovante funcionar):**
   - Vá em **Configurações do projeto** (ícone de engrenagem, no menu lateral).
   - Em **Propriedades do script**, clique em "Adicionar propriedade do script".
   - Propriedade: `ANTHROPIC_API_KEY` — Valor: sua chave da Anthropic
     (gere em [console.anthropic.com](https://console.anthropic.com) → API Keys).
   - Sem isso, o app funciona normalmente — só a leitura automática de
     comprovante vai falhar e pedir preenchimento manual.
6. Clique em **Implantar → Nova implantação**.
   - Tipo: **App da Web**.
   - Executar como: **Eu (seu e-mail)**.
   - Quem pode acessar: **Qualquer pessoa**.
7. Clique em **Implantar** e autorize as permissões pedidas (é a sua própria
   planilha — pode autorizar tranquilo).
8. Copie a **URL da Web App** gerada (termina em `/exec`). Guarde — você vai
   usar no Passo 2.

> **Sempre que eu (Claude) editar o `Code.gs` no futuro:** volte em
> **Implantar → Gerenciar implantações → ícone de lápis → Versão: Nova versão
> → Implantar**. Só salvar o arquivo não atualiza a versão publicada.

---

## Parte 2 — Colar a URL no app

1. Abra `src/App.jsx` neste projeto.
2. Logo no topo, encontre a linha:
   ```js
   const APPS_SCRIPT_URL = "COLE_AQUI_A_URL_DO_SEU_APPS_SCRIPT";
   ```
3. Substitua pela URL que você copiou no Passo 1.8 (a que termina em `/exec`).

---

## Parte 3 — Publicar no Vercel

**Opção A — via GitHub (recomendado):**
1. Crie um repositório novo no GitHub e suba esta pasta inteira (`git init`,
   `git add .`, `git commit -m "primeira versão"`, `git push`).
2. Em [vercel.com](https://vercel.com), clique em **Add New → Project**,
   selecione o repositório.
3. O Vercel detecta automaticamente que é um projeto Vite — não precisa mudar
   nada nas configurações de build. Clique em **Deploy**.
4. Em ~1 minuto você recebe a URL pública (algo como
   `chale-cipo-app.vercel.app`).

**Opção B — direto do computador (sem GitHub):**
1. Instale a CLI da Vercel: `npm i -g vercel`
2. Dentro da pasta do projeto, rode `vercel`
3. Siga as perguntas (login, nome do projeto) — ele já publica e te dá o link.

---

## Parte 4 — Usar

1. Abra a URL publicada — vai aparecer a tela de configuração inicial.
2. Crie o PIN do dono e o PIN do gestor.
3. Pronto — mande o link pra quem precisar acessar (ele entra com o próprio PIN).

---

## Estrutura do projeto

```
├── apps-script/
│   └── Code.gs          ← cole isso no Apps Script (Parte 1)
├── src/
│   ├── App.jsx           ← o app inteiro (telas, lógica, cálculos)
│   └── main.jsx          ← ponto de entrada do React
├── index.html
├── package.json
└── vite.config.js
```

## Se algo der errado

- **"Tempo esgotado ao falar com a planilha" / dados não carregam:** confira
  se colou a URL certa (terminando em `/exec`) e se o deploy do Apps Script
  está como "Qualquer pessoa" tem acesso.
- **Leitura de comprovante não funciona:** confira se a `ANTHROPIC_API_KEY`
  foi salva nas Propriedades do script (Parte 1, passo 5). Sem isso, o campo
  fica em branco e pede preenchimento manual — o resto do app continua normal.
- **Erro de CORS no console do navegador ao salvar dados:** me avise nessa
  conversa com o print do erro — é a única parte da integração que depende
  do comportamento do Google e pode precisar de um ajuste fino.

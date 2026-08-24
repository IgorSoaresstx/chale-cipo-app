# Arquitetura — Chalé Serra do Cipó

## Visão geral

Aplicação web de gestão de reservas, repasses, despesas e prestadores do chalé.

## Frontend

- React 18 com Vite.
- Tailwind carregado via CDN.
- `App.jsx` concentra atualmente a maior parte das telas e regras.
- `main.jsx` inicializa a aplicação.
- Bibliotecas principais: Lucide React, Recharts e PapaParse.

## Backend e persistência

- Google Apps Script como API.
- Google Sheets como armazenamento, planilha `Chale Cipo - Dados`, aba `KV`.
- Leituras via JSONP.
- Gravações via POST com conteúdo `text/plain`.
- A constante `APPS_SCRIPT_URL` já está configurada em `App.jsx` e é protegida pelas regras do projeto.

## Publicação

- Repositório oficial: `IgorSoaresstx/chale-cipo-app`.
- Hospedagem: Vercel.
- A branch `main` pode disparar publicação automática.

## Riscos técnicos conhecidos

- `App.jsx` monolítico aumenta o risco de regressões em alterações amplas.
- Mudanças no esquema de dados podem quebrar registros existentes na aba `KV`.
- JSONP e Apps Script exigem cuidado com timeout, serialização e tratamento de erros.
- A publicação automática transforma push em `main` numa ação de produção.
- O GET via JSONP e o POST `text/plain` são mecanismos deliberados de compatibilidade com CORS; não devem ser substituídos sem um plano completo.
- `App.jsx` e `main.jsx` ficam na raiz do repositório; `index.html` aponta para `/main.jsx`.
- Tailwind é carregado via CDN, sem pipeline local de PostCSS.
- Salvar `Code.gs` não atualiza a implantação ativa; é necessário publicar uma nova versão no Apps Script.
- O backend correto deve ser um Apps Script vinculado à planilha pelo menu Extensões do Google Sheets.

## Estado de produção ainda não confirmado

- Correspondência entre a Vercel e o último commit de `main`.
- Identidade e versão da implantação ativa do Apps Script.
- Existência e grafia exata da aba `KV` na planilha usada pela implantação.
- Cobertura de testes automatizados.

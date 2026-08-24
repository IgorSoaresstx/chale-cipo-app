# Ativação da correção do login

Esta etapa precisa ser feita no Google Apps Script vinculado à planilha correta.

1. Abra a planilha `Chale Cipo - Dados`.
2. Confirme que a aba se chama exatamente `KV`.
3. Acesse **Extensões → Apps Script** pela própria planilha.
4. Substitua o conteúdo de `Code.gs` pelo arquivo `apps-script/Code.gs` deste repositório.
5. No seletor de funções, escolha `configurarBancoDeDados` e clique em **Executar**.
6. Autorize o acesso solicitado. A função registra internamente o ID da planilha nas propriedades do script.
7. Acesse **Implantar → Gerenciar implantações → Editar**.
8. Selecione **Nova versão** e clique em **Implantar**.
9. Não altere a URL da implantação usada no frontend.
10. Volte ao aplicativo, recarregue a página e crie os PINs.

O frontend agora só conclui a configuração quando consegue gravar e ler novamente os dados. Se o backend estiver apontando para outra planilha ou versão, ele exibirá uma mensagem de erro em vez de aparentar sucesso.

Não coloque chaves de API, PINs ou outras credenciais no código ou no Git.

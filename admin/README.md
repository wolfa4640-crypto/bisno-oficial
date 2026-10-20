# Painel administrativo do Bisno

## Ativar o primeiro administrador

1. Cria uma conta normal no Bisno com o e-mail que será usado para administrar a plataforma.
2. Confirma esse e-mail e inicia sessão uma vez para confirmar que a conta funciona.
3. No Render, abre o serviço Web do Bisno e entra em **Environment**.
4. Define `ADMIN_EMAIL` com o e-mail exato da conta administrativa. O servidor normaliza maiúsculas/minúsculas.
5. Confirma que `SESSION_SECRET` existe e tem pelo menos 32 caracteres; não publiques esse valor.
6. Guarda as variáveis e faz um novo deploy. Não coloques credenciais nem segredos no repositório.

A conta indicada por `ADMIN_EMAIL` recebe privilégios administrativos no servidor. Não é necessário nem permitido alterar `isAdmin` no navegador. Para transferir a administração, altera `ADMIN_EMAIL` no Render para o e-mail da conta autorizada e faz novo deploy.

## Acesso e funcionalidades

- Painel: `https://bisno-oficial.onrender.com/admin`
- API privada: `/api/admin/*`
- Estatísticas calculadas a partir das tabelas existentes.
- Pesquisa e paginação de utilizadores e anúncios.
- Bloqueio/desbloqueio, suspensão/restauração e eliminação com confirmação.
- Registo de auditoria persistido na base de dados SQLite.

O painel e a API verificam a sessão e o e-mail autorizado no backend. Pedidos de alteração também verificam a origem. Utilizadores bloqueados continuam impedidos pelo middleware existente nas operações autenticadas.

## Antes de usar em produção

- Confirma que o serviço Render usa armazenamento persistente para o ficheiro SQLite e sessões, e que `DATA_DIR` aponta para esse disco.
- Faz backup da base de dados antes de eliminar contas ou anúncios.
- Executa `npm test` no ambiente de desenvolvimento e verifica o deploy/logs do Render.
- O histórico estatístico só pode refletir os registos que ainda existem na base de dados; a aplicação não tinha um histórico de eventos retroativo.

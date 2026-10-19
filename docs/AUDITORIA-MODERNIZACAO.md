# Auditoria inicial de modernização — Bisno

## Estado observado no repositório

O projeto usa Node.js, Express, SQLite (`better-sqlite3`), sessões persistidas com `connect-sqlite3`, bcryptjs, Helmet, express-rate-limit e Multer. Existem rotas para autenticação, anúncios, funcionalidades sociais e lojas.

## Riscos e melhorias prioritárias

1. **Persistência no Render:** `data/marketplace.db`, a base de sessões e `uploads/` dependem de armazenamento local. Em produção, configurar um disco persistente e apontar `DATA_DIR=/var/data` e `UPLOADS_DIR=/var/data/uploads`. Confirmar que o serviço Render e o plano suportam o disco antes do deploy.
2. **Uploads:** a validação atual confia no MIME declarado pelo cliente. Adicionar validação da assinatura real dos ficheiros, nomes/extensões consistentes, limites de quantidade/tamanho e limpeza dos ficheiros quando uma operação falha.
3. **Sessões:** regenerar o ID da sessão depois do registo (o login já regenera); confirmar que o logout limpa o cookie com o nome configurado no Express (`bisno.sid`).
4. **Segurança HTTP:** a Content Security Policy está desativada no Helmet. Reativá-la depois de inventariar scripts, estilos e recursos externos usados pela interface.
5. **Validação e autorização:** rever limites e tipos em todos os campos e confirmar que cada edição/exclusão verifica a propriedade do recurso no servidor.
6. **Testes:** o script `npm test` executa verificações de sintaxe. Criar testes automatizados de rotas, autenticação, autorização, uploads, persistência e casos inválidos; incluir um teste de ponta a ponta no ambiente de staging.
7. **Dados sensíveis:** garantir que segredos ficam apenas nas variáveis de ambiente e que a base de dados real, sessões e uploads não são inadvertidamente incluídos em commits.
8. **Operação:** documentar backup e restauração da SQLite, migrações, logs sem dados sensíveis, endpoint de saúde e procedimento de rollback.

## Critérios mínimos antes de produção

- [ ] Registo, login, consulta de sessão e logout testados.
- [ ] Um utilizador não consegue editar ou eliminar recursos de outro.
- [ ] Uploads inválidos, demasiado grandes e com MIME falsificado são rejeitados.
- [ ] Anúncios, perfis e sessões persistem após reinício/deploy de teste.
- [ ] Testes funcionais e de segurança passam em CI.
- [ ] Variáveis de ambiente e armazenamento persistente estão configurados no Render.
- [ ] Fluxos principais verificados em telemóvel e computador.
- [ ] Backup e restauração testados.

## Nota

Este documento regista uma auditoria inicial baseada na estrutura e nos trechos de código inspecionados. Os itens são recomendações, não afirmações de que todos os problemas já foram reproduzidos. A aplicação ainda precisa de testes funcionais no ambiente de execução antes de declarar a modernização concluída.

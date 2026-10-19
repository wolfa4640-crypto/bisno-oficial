# Auditoria e modernização — Bisno

## Âmbito e estado

O Bisno é um marketplace para Angola, com preços em Kz, anúncios, perfis, mensagens, notificações e lojas. O comprador e o vendedor combinam diretamente pagamento e entrega; a aplicação não deve introduzir pagamentos internos.

Este trabalho decorre na branch `modernizacao/auditoria-e-seguranca` e no PR #1. A branch principal e o serviço publicado não foram alterados por merge ou deploy. As mudanças descritas abaixo foram registadas no ramo de desenvolvimento. A execução anterior passou em Node.js 20 e 22. Após ajustar o workflow para Node.js 22, a nova execução também concluiu com sucesso; a validação funcional no ambiente de execução continua pendente.

## Alterações já registadas nesta branch

- Sessão: regeneração do identificador depois do registo e do login; destruição da sessão e limpeza do cookie `bisno.sid` ao sair.
- Configuração: segredo de sessão obrigatório com pelo menos 32 caracteres; diretórios de dados e uploads podem ser definidos por `DATA_DIR` e `UPLOADS_DIR`; versão do endpoint de saúde vem de `package.json`.
- Uploads: nomes aleatórios, limite de tamanho, tipos permitidos JPEG/PNG/WEBP e verificação das assinaturas do ficheiro para avatar e fotografia de anúncio; limpeza de ficheiros quando certas operações falham.
- Registo: limites e validação básica de nome, e-mail, telefone e palavra-passe; hash bcrypt com custo 12 e limite de 72 bytes.
- Anúncios: validação de campos, estado, WhatsApp e preço como inteiro seguro em Kz; o campo de preço da interface foi alinhado para aceitar inteiros.
- Lojas: validação do utilizador e do nome ao ativar, nome mínimo ao editar e confirmação de que o anúncio associado a um contacto pertence à loja indicada.
- Interesses: inserção idempotente em transação para reduzir erros e notificações duplicadas em pedidos concorrentes.
- Testes: testes unitários do verificador de assinatura de imagens; script `npm test` executa verificações de sintaxe e a suite Node.js.
- CI: workflow GitHub Actions configurado para executar `npm test` em Node.js 22, compatível com a versão de `better-sqlite3`, em pushes e pull requests.

## Riscos e tarefas ainda por validar

1. **CI e testes:** o workflow atualizado para Node.js 22 concluiu com sucesso. Continuam necessários testes de integração e ponta a ponta, pois a suite atual cobre apenas parte do comportamento.
2. **Render e persistência:** verificar no painel do serviço se há disco persistente e configurar `DATA_DIR` e `UPLOADS_DIR` para caminhos no disco montado. A existência dessas variáveis no código não confirma a configuração do serviço.
3. **Backup e restauração:** documentar e testar cópia e recuperação da base SQLite e dos uploads antes de qualquer migração ou publicação.
4. **Autorização:** executar testes de integração para garantir que nenhum utilizador consegue ler ou modificar recursos privados de outro utilizador.
5. **Uploads:** testar ficheiros inválidos, MIME falsificado, limites e limpeza; a assinatura inicial do ficheiro é uma verificação básica, não uma análise completa de imagem.
6. **Segurança HTTP:** a Content Security Policy (CSP) permanece desativada no Helmet; inventariar scripts, estilos e recursos antes de a ativar sem quebrar a interface.
7. **Dependências:** `package-lock.json` ainda tem metadados de `meu-primeiro-site` versão `1.0.0` e não declara todas as dependências do `package.json` (incluindo `helmet`, `express-rate-limit` e `connect-sqlite3`). O CI usa `npm install`, não `npm ci`; regenerar e validar o lock em ambiente Node/npm compatível antes de mudar para instalação reprodutível.
8. **Interface:** validar navegação, formulários, chat, notificações, lojas e layout em telemóvel e computador.
9. **Produção:** executar teste de ponta a ponta no staging, confirmar variáveis de ambiente e plano de rollback antes de merge/deploy.

## Critérios mínimos antes de produção

- [x] CI atual concluída com sucesso em Node.js 22 (execução nº 10).
- [ ] Registo, login, sessão, logout e validação de entradas testados.
- [ ] Autorização e propriedade de anúncios, conversas, mensagens e lojas testadas.
- [ ] Uploads válidos e inválidos testados.
- [ ] Dados, sessões e uploads persistem após reinício no ambiente de teste.
- [ ] Backup e restauração SQLite verificados.
- [ ] Interface principal verificada em computador e telemóvel.
- [ ] Configuração Render confirmada sem expor segredos.
- [ ] PR revisto antes de qualquer merge e deploy.

## Limitações

Não declarar a modernização concluída até os testes e a verificação no serviço de staging serem executados e observados. Não fazer merge, deploy nem operações destrutivas sem autorização explícita e sem validar backup/rollback.

## Revisão de código — etapa seguinte

- Revistos os fluxos de autenticação, anúncios, conversas/mensagens, notificações e lojas nesta branch.
- As rotas de mensagens verificam que o utilizador pertence à conversa antes de ler ou enviar mensagens; a marcação de notificações como lidas filtra pelo destinatário; a eliminação de anúncios filtra pelo proprietário.
- A rota de contactos de loja verifica a propriedade do anúncio associado. O seguimento da própria loja é recusado e a unicidade da base de dados impede seguimentos duplicados.
- Estes pontos são observações estáticas do código, não substituem testes HTTP de integração. Ainda é necessário executar testes com duas contas e tentar acessos cruzados para confirmar o comportamento real.
- Não foi alterado o lockfile: não há um ambiente npm local disponível nesta sessão para regenerar e validar o ficheiro completo com integridades reais. Não é seguro reconstruí-lo manualmente.

## Testes acrescentados nesta etapa

- Criado `test/auth-middleware.test.js` para verificar três comportamentos do middleware de autenticação: pedido sem sessão recebe 401, sessão sem utilizador recebe 401 e sessão com `userId` segue para a rota.
- O comando `npm run check` agora também valida a sintaxe de `middleware/auth.js`.
- A execução automática após estes commits ainda não foi confirmada nesta revisão; consultar GitHub Actions antes de considerar os testes aprovados.
- Estes são testes unitários do middleware, não testes de integração de registo, login, autorização de recursos ou persistência.

## Correções de perfil — etapa seguinte

- A edição do perfil agora exige nome com 2–100 caracteres e telefone com 7–30 caracteres, alinhando estes limites aos usados no registo.
- Ao substituir um avatar, o sistema tenta apagar o ficheiro anterior apenas depois de guardar a atualização e apenas quando a referência antiga aponta para `/uploads/`. Falha na limpeza é registada sem reverter o perfil atualizado.
- O teste unitário do middleware e a verificação de sintaxe foram adicionados em commits anteriores. A execução de CI após as últimas alterações ainda precisa de confirmação no GitHub Actions.

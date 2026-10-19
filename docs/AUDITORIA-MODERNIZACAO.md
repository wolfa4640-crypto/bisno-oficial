# Auditoria e modernização — Bisno

## Âmbito e estado

O Bisno é um marketplace para Angola, com preços em Kz, anúncios, perfis, mensagens, notificações e lojas. O comprador e o vendedor combinam diretamente pagamento e entrega; a aplicação não deve introduzir pagamentos internos.

Este trabalho decorre na branch `modernizacao/auditoria-e-seguranca` e no PR #1. A branch principal e o serviço publicado não foram alterados por merge ou deploy. As mudanças descritas abaixo foram registadas no ramo de desenvolvimento, mas ainda precisam de validação funcional no ambiente de execução.

## Alterações já registadas nesta branch

- Sessão: regeneração do identificador depois do registo e do login; destruição da sessão e limpeza do cookie `bisno.sid) ao sair.
- Configuração: segredo de sessão obrigatório com pelo menos 32 caracteres; diretórios de dados e uploads podem ser definidos por `DATA_DIR` e `UPLOADS_DIR`; versão do endpoint de saúde vem de `package.json`.
- Uploads: nomes aleatórios, limite de tamanho, tipos permitidos JPEG/PNG/WEBP e verificação das assinaturas do ficheiro para avatar e fotografia de anúncio; limpeza de ficheiros quando certas operações falham.
- Registo: limites e validação básica de nome, e-mail, telefone e palavra-passe; hash bcrypt com custo 12 e limite de 72 bytes.
- Anúncios: validação de campos, estado, WhatsApp e preço como inteiro seguro em Kz; o campo de preço da interface foi alinhado para aceitar inteiros.
- Lojas: validação do utilizador e do nome ao ativar, nome mínimo ao editar e confirmação de que o anúncio associado a um contacto pertence à loja indicada.
- Interesses: inserção idempotente em transação para reduzir erros e notificações duplicadas em pedidos concorrentes.
- Testes: testes unitários do verificador de assinatura de imagens; script `npm test` executa verificações de sintaxe e a suite Node.js.
- CI: workflow GitHub Actions adicionado para executar `npm test` em Node.js 20 e 22 em pushes e pull requests.

## Riscos e tarefas ainda por validar

1. **CI e testes:** confirmar que o workflow executa com sucesso; a criação do workflow não significa que os testes já passaram.
2. **Render e persistência:** verificar no painel do serviço se há disco persistente e configurar `DATA_DIR` e `UPLOADS_DIR` para caminhos no disco montado. A existência dessas variáveis no código não confirma a configuração do serviço.
3. **Backup e restauração:** documentar e testar cópia e recuperação da base SQLite e dos uploads antes de qualquer migração ou publicação.
4. **Autorização:** executar testes de integração para garantir que nenhum utilizador consegue ler ou modificar recursos privados de outro utilizador.
5. **Uploads:** testar ficheiros inválidos, MIME falsificado, limites e limpeza; a assinatura inicial do ficheiro é uma verificação básica, não uma análise completa de imagem.
6. **Segurança HTTP:** a Content Security Policy (CSP) permanece desativada no Helmet; inventariar scripts, estilos e recursos antes de a ativar sem quebrar a interface.
7. **Dependências:** verificar coerência entre `package.json` e `package-lock.json` e usar instalação reprodutível quando o lock estiver atualizado.
8. **Interface:** validar navegação, formulários, chat, notificações, lojas e layout em telemóvel e computador.
9. **Produção:** executar teste de ponta a ponta no staging, confirmar variáveis de ambiente e plano de rollback antes de merge/deploy.

## Critérios mínimos antes de produção

- [ ] CI concluída com sucesso em todas as versões Node configuradas.
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

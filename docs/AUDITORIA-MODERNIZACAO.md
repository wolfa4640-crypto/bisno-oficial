# Auditoria e modernização — Bisno

## Âmbito e estado

O Bisno é um marketplace para Angola, com preços em Kz, anúncios, perfis, mensagens, notificações e lojas. O comprador e o vendedor combinam diretamente pagamento e entrega; a aplicação não deve introduzir pagamentos internos.

Este trabalho decorre na branch `modernizacao/auditoria-e-seguranca` e no PR #1. A branch principal e o serviço publicado não foram alterados por merge ou deploy. As mudanças descritas abaixo foram registadas no ramo de desenvolvimento. A execução anterior passou em Node.js 20 e 22. O workflow foi ajustado para Node.js 22. A execução correspondente aos commits mais recentes precisa ser confirmada no GitHub Actions; a validação funcional no ambiente de execução continua pendente.

## Alterações já registadas nesta branch

- Sessão: regeneração do identificador depois do registo e do login; destruição da sessão e limpeza do cookie `bisno.sid` ao sair.
- Configuração: segredo de sessão obrigatório com pelo menos 32 caracteres; diretórios de dados e uploads podem ser definidos por `DATA_DIR` e `UPLOADS_DIR`; versão do endpoint de saúde vem de `package.json`.
- Uploads: nomes aleatórios, limite de tamanho, tipos permitidos JPEG/PNG/WEBP e verificação das assinaturas do ficheiro para avatar e fotografia de anúncio; limpeza de ficheiros quando certas operações falham.
- Registo: limites e validação básica de nome, e-mail, telefone e palavra-passe; hash bcrypt com custo 12 e limite de 72 bytes.
- Anúncios: validação de campos, estado, WhatsApp e preço como inteiro seguro em Kz; o campo de preço da interface foi alinhado para aceitar inteiros.
- Lojas: validação do utilizador e do nome ao ativar, nome mínimo ao editar e confirmação de que o anúncio associado a um contacto pertence à loja indicada.
- Interesses: inserção idempotente em transação para reduzir erros e notificações duplicadas em pedidos concorrentes.
- Testes: testes unitários do verificador de assinatura de imagens e do middleware de autenticação; testes HTTP de integração para isolamento de conversas, mensagens e notificações entre utilizadores. O script `npm test` executa verificações de sintaxe e a suite Node.js.
- CI: workflow GitHub Actions configurado para executar `npm test` em Node.js 22, compatível com a versão de `better-sqlite3`, em pushes e pull requests.

## Riscos e tarefas ainda por validar

1. **CI e testes:** confirmar o resultado do workflow para o commit mais recente. Foram adicionados testes HTTP de integração de controlo de acesso social, mas a execução automática ainda precisa de ser observada.
2. **Render e persistência:** verificar no painel do serviço se há disco persistente e configurar `DATA_DIR` e `UPLOADS_DIR` para caminhos no disco montado. A existência dessas variáveis no código não confirma a configuração do serviço.
3. **Backup e restauração:** documentar e testar cópia e recuperação da base SQLite e dos uploads antes de qualquer migração ou publicação.
4. **Autorização:** os testes HTTP de integração foram acrescentados; confirmar a sua execução na CI e ampliar a cobertura a anúncios e lojas.
5. **Uploads:** testar ficheiros inválidos, MIME falsificado, limites e limpeza; a assinatura inicial do ficheiro é uma verificação básica, não uma análise completa de imagem.
6. **Segurança HTTP:** a Content Security Policy (CSP) permanece desativada no Helmet; inventariar scripts, estilos e recursos antes de a ativar sem quebrar a interface.
7. **Dependências:** `package-lock.json` ainda tem metadados de `meu-primeiro-site` versão `1.0.0` e não declara todas as dependências do `package.json` (incluindo `helmet`, `express-rate-limit` e `connect-sqlite3`). O CI usa `npm install`, não `npm ci`; regenerar e validar o lock em ambiente Node/npm compatível antes de mudar para instalação reprodutível.
8. **Interface:** validar navegação, formulários, chat, notificações, lojas e layout em telemóvel e computador.
9. **Produção:** executar teste de ponta a ponta no staging, confirmar variáveis de ambiente e plano de rollback antes de merge/deploy.

## Critérios mínimos antes de produção

- [ ] Confirmar CI após os commits mais recentes; uma execução anterior em Node.js 22 teve sucesso.
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
- Foram acrescentados testes HTTP de integração com uma base SQLite temporária e sessões separadas para dois utilizadores e um terceiro utilizador não participante. Os testes cobrem leitura/envio de mensagens, marcação de notificações e listagem de notificações. A execução CI mais recente ainda precisa de ser confirmada.
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


## Testes HTTP de controlo de acesso — etapa seguinte

- Criado `test/social-access-control.test.js`, que monta as rotas sociais num servidor HTTP de teste e utiliza uma base SQLite temporária isolada. Não utiliza a base de dados do serviço publicado.
- Os casos verificam que um utilizador externo não consegue ler mensagens, enviar mensagens para conversa alheia ou marcar notificações de outra pessoa como lidas; também verificam que a listagem de notificações é filtrada por utilizador e que um participante legítimo mantém acesso.
- O login de teste é exclusivo ao servidor montado dentro do ficheiro de testes e usa `express-session`; não foi acrescentada nenhuma rota de teste ao servidor de produção.
- Estes testes foram adicionados ao ramo, mas não são declarados aprovados até o GitHub Actions concluir a execução do commit mais recente.


## Propriedade de anúncios — etapa seguinte

- Expandido `test/social-access-control.test.js` para tentar eliminar por HTTP um anúncio pertencente a outro utilizador autenticado como terceiro. O teste verifica a resposta 404 e confirma que o anúncio continua na base SQLite temporária.
- A execução da CI para o commit que contém este novo caso ainda precisa de confirmação; o teste não deve ser considerado aprovado apenas por ter sido adicionado.


## Propriedade de lojas — etapa seguinte

- Expandido `test/social-access-control.test.js` para tentar alterar uma loja usando a sessão de um terceiro utilizador. O teste espera 404 no endpoint da loja do próprio utilizador e confirma que o nome e a descrição da loja do vendedor original permanecem inalterados.
- O caso foi adicionado à branch de desenvolvimento; a sua execução e resultado devem ser confirmados na CI antes de declarar aprovação.


## Regras de contacto e seguimento de lojas — etapa seguinte

- Acrescentados dois testes HTTP: a rota de contacto rejeita um anúncio inexistente/que não pode ser associado à loja e não regista contacto; o proprietário não pode seguir a própria loja e nenhum seguimento é criado.
- Os casos foram adicionados à suite de integração na branch. A CI do commit mais recente ainda precisa de confirmação, por isso estes testes não são declarados aprovados.


## Fluxos válidos de loja — etapa seguinte

- Acrescentados dois testes HTTP de caminho positivo: um cliente pode registar contacto por WhatsApp com um anúncio pertencente à loja, e um utilizador pode seguir a loja de outra pessoa.
- Os testes verificam a resposta da rota e os registos efetivamente gravados na base SQLite temporária, incluindo o contador de seguidores. Isso complementa os casos negativos que verificam tentativas indevidas.
- Os testes foram registados na branch de desenvolvimento; não foram executados localmente nesta sessão e a CI correspondente ainda precisa de confirmação no GitHub Actions.


## Validação de tipos na autenticação — etapa seguinte

- As rotas de registo e login agora rejeitam campos que não sejam texto, além de verificar campos vazios. Isso evita passar objetos/arrays para normalização de credenciais e para a comparação de hash da palavra-passe.
- Acrescentados testes HTTP para verificar que uma palavra-passe enviada como objeto no login recebe erro 400 e que um nome enviado como array no registo não cria uma conta.
- Os testes usam o servidor e a base de dados temporária da suite de integração. Ainda é necessário confirmar o resultado da execução na CI para o commit mais recente; não declarar aprovação antes disso.


## Redesign visual responsivo — etapa seguinte

- Criada a camada `public/bisno-design-refresh.css` para uniformizar a identidade visual, melhorar hierarquia tipográfica, espaçamento, filtros, cartões de anúncios, botões, painéis e painel de loja.
- A nova folha é carregada depois de `bisno-pro.css`, preservando o CSS existente e as funções da aplicação; os ajustes incluem grelha de anúncios para computador/tablet e cartões compactos para telemóvel, navegação inferior móvel e respeito por preferência de movimento reduzido.
- O HTML foi atualizado apenas para carregar a nova camada de design. Não foram alteradas rotas, dados nem regras de negócio.
- A revisão visual no navegador e a verificação em dispositivos reais continuam pendentes; a CI não confirma a qualidade visual.

## Acessibilidade visual e estados de interação — etapa seguinte

- Acrescentados estados de foco visíveis e consistentes para navegação por teclado, realce de seleção de texto e apresentação de controlos desativados.
- Melhorada a área mínima de toque dos itens da navegação móvel e acrescentado suporte de contorno para modos de cores forçadas.
- Os estilos não alteram os fluxos de negócio nem o conteúdo da base de dados. A verificação de contraste e a inspeção em navegador/dispositivos continuam pendentes; estas alterações ainda não equivalem a uma auditoria WCAG completa.

## Navegação inferior fixa em telemóveis — etapa seguinte

- Ajustada a navegação móvel para permanecer fixa junto à parte inferior do ecrã, com respeito pela área segura dos dispositivos e espaço adicional no conteúdo para reduzir sobreposição.
- A alteração é apenas CSS e não muda destinos, permissões ou fluxos da aplicação. É necessário confirmar em navegador móvel real a altura final e o comportamento com teclado virtual aberto.

## Navegação compacta em ecrãs estreitos — etapa seguinte

- Refinados alinhamento, espaçamento e badges de contagem da navegação para acomodar os seis destinos em ecrãs estreitos sem perder o tamanho mínimo de toque definido anteriormente.
- O ajuste aplica-se sobretudo a larguras até 420 px; a validação final requer inspeção visual em ecrãs reais, incluindo dispositivos com largura próxima de 320 px.

## Estado de carregamento acessível do catálogo — etapa seguinte

- A lista de anúncios expõe `aria-busy="true"` durante o pedido à API e regressa a `false` após sucesso ou erro.
- Isto ajuda tecnologias de apoio a perceber quando a região do catálogo está a ser atualizada; não substitui testes com leitores de ecrã e continua pendente a validação de ponta a ponta.

## Pesquisa por localização do anúncio — etapa seguinte

- O filtro de província/cidade também procura no bairro, para que a pessoa consiga encontrar anúncios ao pesquisar uma localização mais específica.
- A alteração reutiliza os campos já existentes nos anúncios e não altera dados, permissões ou a API. Ainda é necessário validar o comportamento com dados reais e executar a CI.

## Limpeza rápida dos filtros do catálogo — etapa seguinte

- Adicionado o botão “Limpar filtros”, que repõe pesquisa, categoria, localização, ordenação e preço máximo aos valores iniciais.
- Depois de limpar, a lista é atualizada e o foco regressa ao campo de pesquisa para facilitar a navegação por teclado.
- A implementação foi registada na branch de desenvolvimento; a execução dos testes automatizados e a verificação visual continuam pendentes.

## Pesquisa tolerante a acentos — melhoria de usabilidade

- A pesquisa por nome, descrição, categoria textual e localização passa a ignorar diferenças entre letras acentuadas e não acentuadas.
- Exemplos: “telemoveis” encontra “Telemóveis”; “Luanda” e “Luandá” deixam de depender de diferenças de acentuação no texto introduzido.
- Não altera os dados guardados nem as regras de categoria; testes automatizados e validação visual ainda precisam de confirmação.

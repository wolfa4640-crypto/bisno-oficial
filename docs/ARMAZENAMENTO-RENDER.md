# Armazenamento persistente do Bisno no Render

## Configuração obrigatória do serviço

O Bisno guarda a base de dados SQLite, as sessões de login e as fotografias de anúncios/perfis no diretório de dados. Em produção, o padrão é `/var/data`.

1. No dashboard do Render, abre o serviço Web do Bisno.
2. Abre **Disks** e adiciona um disco persistente (se esta opção não estiver disponível no plano atual, será necessário mudar para um plano que suporte discos persistentes).
3. Define o ponto de montagem exatamente como `/var/data`. Escolhe um tamanho inicial adequado (por exemplo, 1 GB) e guarda.
4. Em **Environment**, confirma que `DATA_DIR` está ausente ou definida como `/var/data`. Não é necessário definir `UPLOADS_DIR`; por padrão, as imagens ficam em `/var/data/uploads`.
5. Guarda e deixa o Render fazer o deploy. Confirma nos Logs que o servidor iniciou e que não há erros de permissão.

## O que fica persistente

- `/var/data/marketplace.db`: contas, anúncios, perfis, lojas e outros dados SQLite.
- `/var/data/sessions.sqlite`: sessões de login (o cookie tem validade de 14 dias).
- `/var/data/uploads/`: fotografias de anúncios e perfis.

O código usa o mesmo diretório de dados em todos os módulos para evitar que o servidor, a base de dados e os uploads gravem em caminhos diferentes. Se o diretório não estiver acessível, o servidor agora falha com uma mensagem que indica a configuração necessária, em vez de ocultar o problema usando armazenamento temporário.

## Atenção à migração

Adicionar um disco não copia automaticamente dados antigos para ele. Se existirem dados úteis num disco antigo ou noutra base de dados, copia-os para o novo disco antes de apagar o armazenamento antigo. Não uses `/tmp` para dados de produção: o conteúdo pode desaparecer em reinícios ou deploys.

## Proteção de dados no Git

A base de dados e as fotografias carregadas por utilizadores não devem ser commitadas no GitHub. O `.gitignore` impede novas inclusões; os ficheiros que já estavam na versão atual do repositório foram removidos. Isto não apaga automaticamente os ficheiros de commits antigos do histórico Git. Se continham dados pessoais reais, é necessário avaliar uma limpeza do histórico e considerar os dados expostos como potencialmente acessíveis.

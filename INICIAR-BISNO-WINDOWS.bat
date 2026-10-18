@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Bisno - Marketplace
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Instala o Node.js LTS antes de iniciar o Bisno.
  echo https://nodejs.org/
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Foi criado o ficheiro .env.
  echo Abre .env e substitui SESSION_SECRET por uma chave aleatoria com pelo menos 32 caracteres.
  notepad .env
  pause
)
if not exist node_modules (
  echo A instalar dependencias. Isto pode demorar alguns minutos...
  call npm install
  if errorlevel 1 (
    echo A instalacao falhou. Verifica a ligacao a internet e tenta novamente.
    pause
    exit /b 1
  )
)
call npm test
if errorlevel 1 (
  echo Os testes de sintaxe falharam. Corrige os erros antes de iniciar.
  pause
  exit /b 1
)
call npm start
pause

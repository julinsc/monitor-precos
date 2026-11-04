@echo off
setlocal
title Enviar analisacadeira para o GitHub
cd /d "%~dp0"

set "GIT=%LOCALAPPDATA%\PortableGit\cmd\git.exe"
if not exist "%GIT%" set "GIT=git"

set "USUARIO=julinsc"
set "PROJETO=analisacadeira"
set "REPO=https://github.com/%USUARIO%/%PROJETO%.git"

echo ============================================================
echo   Enviando para: %REPO%
echo ============================================================
echo.
echo IMPORTANTE - quando o Git pedir credenciais:
echo   Usuario: %USUARIO%
echo   Senha:   Personal Access Token (ppl_... ou ghp_...)
echo            NAO e a senha da conta do GitHub!
echo.
echo Se nao tiver token, crie em:
echo   https://github.com/settings/tokens
echo   (Generate new token -^> classic -^> marque a caixa "repo")
echo.
pause

"%GIT%" remote remove origin 2>nul
"%GIT%" remote add origin %REPO%
"%GIT%" push -u origin main

if %errorlevel%==0 (
  echo.
  echo ============================================================
  echo   ENVIADO COM SUCESSO!
  echo ============================================================
  echo.
  echo PROXIMO PASSO - cadastre os 2 segredos em:
  echo   https://github.com/%USUARIO%/%PROJETO%/settings/secrets/actions
  echo.
  echo   TELEGRAM_TOKEN    = 9038882756:AAHuhmwMTru9WP5SYA9M4ta6Bze4HzjGHHs
  echo   TELEGRAM_CHAT_ID  = 6030806550
  echo.
  echo Depois va em Actions e clique em "Run workflow" para testar.
  echo.
) else (
  echo.
  echo FALHOU. Erros comuns:
  echo  - Token invalido, expirado ou sem permissao "repo"
  echo  - Senha da conta usada no lugar do token
  echo  - O repositorio %PROJETO% precisa existir e estar VAZIO
  echo    (sem README, sem .gitignore, sem licenca)
  echo.
)

pause

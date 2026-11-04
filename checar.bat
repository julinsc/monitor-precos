@echo off
REM Roda o monitor uma vez, aqui no seu PC (teste ou uso manual).
REM Requer: TELEGRAM_TOKEN e TELEGRAM_CHAT_ID definidos como variaveis de ambiente.
REM Ou defina a variavel do usuario: setx TELEGRAM_TOKEN "123:abc"

cd /d "%~dp0"

set NODE_EXE=node
where node >nul 2>nul || set NODE_EXE="C:\Program Files\nodejs\node.exe"

echo [%date% %time%] checando precos... >> log.txt
%NODE_EXE% monitor.js %* 2>> log.txt
echo [%date% %time%] fim >> log.txt

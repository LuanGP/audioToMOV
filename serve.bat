@echo off
echo Servindo versao web em http://localhost:8080
echo Pressione Ctrl+C para parar.
cd /d "%~dp0"
python -m http.server 8080

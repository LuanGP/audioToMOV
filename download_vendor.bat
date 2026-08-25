@echo off
setlocal
cd /d "%~dp0"

echo Baixando FFmpeg WASM para web\vendor ...
if not exist "vendor" mkdir vendor
cd vendor

npm pack @ffmpeg/ffmpeg@0.12.10 @ffmpeg/util@0.12.1 @ffmpeg/core@0.12.10
if errorlevel 1 (
  echo ERRO: npm pack falhou. Instale Node.js/npm.
  exit /b 1
)

if exist ffmpeg rmdir /s /q ffmpeg
if exist util rmdir /s /q util
if exist core rmdir /s /q core
mkdir ffmpeg\esm util\esm core

tar -xzf ffmpeg-ffmpeg-0.12.10.tgz
copy /y package\dist\esm\*.js ffmpeg\esm\ >nul
rmdir /s /q package

tar -xzf ffmpeg-util-0.12.1.tgz
copy /y package\dist\esm\*.js util\esm\ >nul
rmdir /s /q package

tar -xzf ffmpeg-core-0.12.10.tgz
copy /y package\dist\esm\ffmpeg-core.js core\ >nul
copy /y package\dist\esm\ffmpeg-core.wasm core\ >nul
rmdir /s /q package

del /q *.tgz
echo Pronto. Arquivos em web\vendor\
dir /s core

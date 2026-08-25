# Áudio to MOV — versão web

Conversor no navegador. A conversão roda **no seu PC** — nada é enviado para servidor.
O FFmpeg WASM fica em `vendor/` (~31 MB) e é servido junto com o site (sem CDN).

## Pré-requisito: vendor

Se a pasta `web/vendor/core/` estiver vazia (clone sem o `.wasm`), rode:

```bat
web\download_vendor.bat
```

(Requer Node.js/npm.)

## Testar localmente

Não abre com `file://` — use um servidor local:

```bash
cd web
python -m http.server 8080
```

Ou `web\serve.bat` → http://localhost:8080

## Publicar de graça (GitHub Pages)

1. Envie o projeto (incluindo `web/vendor/`) para o GitHub  
2. **Settings → Pages → Source: GitHub Actions**  
3. Push na `main` — o workflow publica a pasta `web/`

**Nota:** o arquivo `ffmpeg-core.wasm` tem ~31 MB. O GitHub aceita (limite 100 MB), mas o clone/push fica mais pesado.

## Limitações vs. desktop

- Mais lento que o `.exe`
- Arquivos acima de 200 MB são recusados
- Saída via download (não cria pasta `audio mov`)

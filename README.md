# carlofebbraio.com

La link in bio di Carlo Febbraio, al posto di Linktree. HTML, CSS e JavaScript puri: nessun abbonamento, nessuna libreria, nessun build. Si pubblica così com'è.

| File | Cosa contiene |
|---|---|
| `index.html` | Tutti i testi e i link (cerca i commenti ✏️) e le tre schede progetto |
| `style.css` | Colori e aspetto. Le card sono `.pcard--becode`, `.pcard--reframe`, `.pcard--cf` |
| `script.js` | Vetro bombato della foto (WebGL), animazioni, schede progetto |
| `img/carlo-febbraio.webp` | Foto profilo (512×512) |
| `img/og.jpg` | Anteprima quando il link viene condiviso (WhatsApp, LinkedIn, iMessage…) |
| `img/*-mark.*` · `img/*-wordmark.svg` | Loghi grandi e scritte sulle card · `img/*-logo.*` loghi nelle schede |
| `fonts/` | Font Geist (licenza OFL) servito dal tuo dominio: niente Google Fonts, nessun problema GDPR |

## Modificare

- **Un link**: cambia l'`href` nella riga giusta di `index.html`. Per aggiungerne uno copia un intero blocco `<li>…</li>`.
- **WhatsApp**: il testo dopo `?text=` è il messaggio già scritto quando si apre la chat.
- **Un progetto**: la card è in "2. PROGETTI", la scheda è il `<dialog>` con lo stesso `id`. In `style.css`, per ogni card: `--card-bg` (sfondo con i colori del brand), `--glow` (ombra colorata), `--mark-h` (grandezza del logo), `--shine` (forza del bagliore).
- **Il bagliore** che attraversa le card parte ogni 7 secondi, una card dopo l'altra (`.pcard__shine` in `style.css`).
- **La foto**: sostituisci `img/carlo-febbraio.webp` con un'altra immagine quadrata 512×512 con lo stesso nome; il vetro bombato si adatta da solo. Se cambi foto, rigenera anche `img/og.jpg`.
- **La luce blu dal basso** è `.horizon` in `style.css`: colori dell'arco e altezza.

Ogni scheda ha un link diretto: `carlofebbraio.com/#becode`, `#reframe`, `#cf-communication`.

## Provarla sul computer

```
python -m http.server 4321
```

poi apri http://localhost:4321

## Online con GitHub Pages

Il sito sta nel repository https://github.com/carlofebbraio/carlofebbraio.com e GitHub Pages lo pubblica a ogni `git push`. Il file `CNAME` dice a GitHub di servirlo su carlofebbraio.com.

- **Aggiornare**: modifica i file, poi `git add -A`, `git commit -m "descrizione"`, `git push`. In circa un minuto è online.
- **Se cambi `style.css` o `script.js`** aumenta il numero dopo `?v=` nelle due righe in cima a `index.html` (es. `?v=2`). GitHub tiene i file in memoria 10 minuti: così nessuno vede la pagina nuova con lo stile vecchio.

### DNS su GoDaddy per carlofebbraio.com

*I miei prodotti → carlofebbraio.com → DNS*:

- togli il parcheggio o l'inoltro (*Forwarding*) del dominio;
- 4 record **A** con nome `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`;
- un record **CNAME** con nome `www` che punta a `carlofebbraio.github.io`;
- non toccare i record MX e TXT (servono all'email).

Quando i DNS si aggiornano (di solito entro un'ora), in GitHub *Settings → Pages* attiva *Enforce HTTPS*. Poi metti `carlofebbraio.com` nella bio di Instagram e TikTok.

## Statistiche dei click

Ogni link ha `data-track="nome"`. Se aggiungi Plausible, Umami o Google Analytics, i click vengono registrati da soli come eventi. Plausible, Umami e Cloudflare Web Analytics non usano cookie, quindi non serve il banner.

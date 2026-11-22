# Especificació Tècnica i Funcional — Nadal Tracker

Aquest document defineix l'arquitectura, el model de dades, les regles de negoci, la seguretat i els patrons d'interfície de **Nadal Tracker**, una aplicació web progressiva (PWA) dissenyada per a la planificació familiar compartida de regals, calendari d'advent i despeses nadalenques.

---

## 1. Visió General i Context del Producte

* **Objectiu:** Gestionar de manera col·laborativa i en temps real el cicle de vida dels regals (des de la idea inicial fins que estan embolicats), el control pressupostari, el balanç de regals per persona, el registre de regals d'altres llars, el Calendari d'Advent (24 dies) i la planificació del Dinar de Santa Llúcia.
* **Usuaris:** Dos administradors principals (pares/parella) amb gestió de secrets individuals per PIN, dins un ecosistema familiar ampliat (fills, avis, tiets, cosins i mascotes).
* **Idioma de la interfície:** Català (textos, estats, categories i formats numèrics/data `ca-ES`).
* **Filosofia tècnica:** *Zero-Build*, *Zero-Backend*, *Client-Side First* i *Privacy-by-Design*. L'aplicació funciona íntegrament al navegador sense servidors intermedis, frameworks ni dependències externes.

---

## 2. Arquitectura Tècnica i Infraestructura

L'aplicació utilitza una arquitectura desacoblada en **dos repositoris de GitHub** dins un mateix compte d'usuari:

| Component | Repositori | Visibilitat | Funció |
| :--- | :--- | :--- | :--- |
| **Frontend (App)** | `nadal-app` | **Públic** (GitHub Pages) | Allotja el codi estàtic (`index.html`, `style.css`, `app.js`). No conté dades personals ni credencials. |
| **Base de Dades** | `nadal-dades` | **Privat** | Allotja l'únic fitxer de persistència (`dades.json`) amb regals, calendari d'advent, pressupostos, PINs i configuració familiar. |

### Estructura Modular del Codi (`nadal-app`)
1. `index.html`: Estructura semàntica del DOM, capçalera *smart sticky* amb panell desplegable de núvol, 4 contenidors de vistes, barra de navegació inferior fixa i finestres modals.
2. `style.css`: Variables CSS (`--c-red: #b3000c`, `--c-green: #165b33`, `--c-gold: #f1c40f`, `--c-bg: #fcf9f2`), disseny *responsive* adaptatiu (`680px` per a llista, `1380px` per a mapa familiar i calendari real d'Advent), navegació inferior amb `env(safe-area-inset-bottom)` i animació CSS de neu a la capçalera.
3. `app.js`: Controlador únic encapsulat dins l'objecte global `app` (estat, motor criptogràfic, client API de GitHub, càlculs financers i renderitzat del DOM).

### Motor de Sincronització i Resiliència Offline (`GitHub REST API`)
* **Lectura (`GET /repos/{owner}/{repo}/contents/{path}`):**
  * Utilitza capçaleres `Authorization: Bearer <token>`, `If-None-Match: <ETag>` i `cache: 'no-store'` per minimitzar el consum de quota i evitar lectures en memòria cau.
  * *Polling* automàtic cada **15 segons** (aturat si la pestanya està oculta o si hi ha qualsevol modal obert per no sobreescriure edicions en curs).
* **Protecció de Canvis Offline (`nadalPendingSync`) i Cua de Pujada (`queuedPush`):**
  * Cada operació de desat (`saveLocal`) escriu a `localStorage` (`nadalData`), activa la bandera `localStorage.setItem('nadalPendingSync', '1')` i invoca `pushToGithub()`.
  * Si `pushToGithub()` s'invoca mentre `app.isSyncing === true`, marca `app.queuedPush = true` i s'executa automàticament tot just en acabar l'operació en curs, evitant col·lisions.
  * Si un `pushToGithub()` falla per manca de cobertura, `nadalPendingSync` es manté a `'1'`. Quan torna la connexió, `pullFromGithub()` detecta `nadalPendingSync === '1'`, fusiona les dades remotes amb les locals mitjançant `mergeDataObjects(remoteData, app.data, true)` i llança `pushToGithub()`. La bandera `nadalPendingSync` només s'esborra quan el `PUT` acaba amb èxit i no queden enviaments encuats.
* **Escriptura Optimista i Resolució de Conflictes (`PUT`):**
  * Envia el JSON codificat en Base64 UTF-8 (`ghEncodeBase64`) juntament amb l'últim `sha` conegut.
  * **Gestió de col·lisions (HTTP 409 / 422):** Si els dos usuaris guarden simultàniament, l'app descarrega la versió remota, executa `mergeDataObjects(remote, local, true)` —fusionant regals per `id` segons `updatedAt`, fusionant els 24 dies de `advent` dia per dia segons `updatedAt`, respectant `deletedIds` i donant prioritat als diccionaris locals `budgets` i `lastYear`— i reintenta el `PUT` fins a 2 vegades.

---

## 3. Model de Dades (`dades.json`)

Tota la persistència al núvol resideix en un únic objecte JSON amb aquesta estructura:

```json
{
  "gifts": [
    {
      "id": "1732258800000",
      "type": "gift",
      "expenseCat": null,
      "title": "Bicicleta vermella",
      "price": "85",
      "isApprox": true,
      "url": "https://...",
      "image": "https://.../foto.jpg",
      "comments": "Roda de 16 polzades",
      "isSecret": false,
      "paidByUs": true,
      "recipients": ["Olívia"],
      "froms": ["Mariona", "Alfred"],
      "event": "👑 Reis",
      "round": null,
      "state": "Decidit",
      "createdBy": "Alfred",
      "updatedAt": 1732258800000
    }
  ],
  "deletedIds": ["1732250000123"],
  "advent": {
    "1": {
      "day": 1,
      "title": "Llibre de Nadal",
      "state": "Comprat",
      "price": "12.50",
      "isApprox": false,
      "url": "https://...",
      "comments": "Guardat a l'armari",
      "updatedAt": 1732258800000
    }
  },
  "budgets": {
    "Olívia": 200,
    "🎄 Altres Despeses (Àpats, Deco...)": 300
  },
  "lastYear": {
    "Olívia": 185
  },
  "pins": {
    "Mariona": "1234",
    "Alfred": "5678"
  },
  "config": {
    "parents": ["Mariona", "Alfred"],
    "casaMembers": ["Olívia", "Juliana", "Mariona", "Alfred"],
    "dir1Name": "Família Alfred",
    "dir1Members": ["Avi", "Àvia", "Dani", "Kris", "Jack", "Linus (gos)", "Fiona (gossa)"],
    "dir2Name": "Família Mariona",
    "dir2Members": ["Abu", "Baba", "Elisenda", "Adri", "Ona", "Bruce (gos)", "Pipa (gossa)"],
    "ext1Name": "Tietes Prat",
    "ext1Members": ["..."],
    "ext2Name": "Tietes BetiJohn",
    "ext2Members": ["..."],
    "bigTioName": "🪵 Tió Esquerdo",
    "rounds": ["Ronda Esquerdo Barragan", "Ronda Tietes Esquerdo", "Ronda Prats", "Ronda BetiJohn"]
  },
  "lastUpdate": "22/11/2026, 08:00:00"
}
```

### Compatibilitat Retroactiva (Migracions)
* Els registres antics amb `recipient` o `from` com a *string* es llegeixen automàticament com a arrays (`recipients`, `froms`).
* Si s'importa o carrega un JSON sense els nodes `advent` o `deletedIds`, s'inicialitzen automàticament com a `{}` i `[]`.
* Si s'importa un JSON sense node `config`, `inferConfigFromLegacyData()` dedueix usuaris, membres de casa i rondes automàticament.

---

## 4. Lògica de Negoci i Regles Financeres

### Tipus d'Elements i Estats
L'aplicació gestiona **quatre fluxos diferenciats**:

1. **Regals Nostres (`type === "gift"` i `paidByUs === true`):**
   * *Estats disponibles:* `Idea` (Idea / Previst), `Decidit` (Decidit, pendent de comprar), `Comprat/Delivery` (Comprat / Pagat), `El tenim`, `Embolicat`.
   * *Impacte econòmic:* Només sumen a **Gastat** quan estan en estat `Comprat/Delivery`, `El tenim` o `Embolicat`.
2. **Regals d'una Altra Casa (`type === "gift"` i `paidByUs === false`):**
   * En desmarcar *"Ho paguem nosaltres"*, el formulari commuta automàticament el selector d'estats a només dues opcions: **`💡 Idea / Proposta`** (`Idea`) i **`🤝 Confirmat`** (`Confirmat`).
   * *Impacte econòmic:* **Mai sumen al pressupost** (ni com a previst ni com a gastat), fins i tot si s'anota un preu orientatiu en una proposta.
3. **Despeses Nadalenques (`type === "expense"`):**
   * Categories fixes: `🍲 Dinar de Santa Llúcia`, `🗓️ Calendari d'Advent`, `🍽️ Àpats i Begudes`, `✨ Decoració i Arbre`, `🪵 Tradicions (Tió, Reis, Pessebre)`, `✉️ Postals de Nadal`, `🎉 Altres despeses nadalenques`.
   * Assigna per defecte l'esdeveniment `✨ General Festes`.
   * *Impacte econòmic:* Sumen a la categoria global `🎄 Altres Despeses (Àpats, Deco...)` quan no són `Idea` ni `Decidit`.
4. **Calendari d'Advent (`app.data.advent["1".."24"]`):**
   * Estructura dedicada de 24 dies (1 al 24 de desembre), destinada als infants de casa (`casaMembers` excloent `parents`) i aïllada de la *Llista* i del *Mapa per Persona*.
   * *Estats disponibles:* `Idea` (`💡 Idea`), `Decidit` (`🎯 Decidit`), `Comprat` (`✅ A punt / Comprat`).
   * *Impacte econòmic:* Els dies amb preu en estat `Comprat` sumen automàticament a **Gastat** dins la categoria `🗓️ Calendari d'Advent` (i al bloc global `🎄 Altres Despeses (Àpats, Deco...)`); els que estan en estat `Idea` o `Decidit` compten com a *Previst / Idees* al detall de despeses.

### Càlculs Pressupostaris (`calculateSpendingBreakdown`)
* **Desglossament Definitiu vs. Aproximat:** Segons el flag booleà `isApprox`, el total gastat es divideix en `totalSpentDefinitive` i `totalSpentApprox` (mostrant-se tant a la capçalera com al panell *Control Econòmic*).
* **Prorrateig Multi-Destinatari:** Si un regal pagat per nosaltres té $N$ destinataris (`recipients.length > 1`), el seu import es divideix a parts iguals ($\text{Preu} / N$) entre les categories pressupostàries de cada destinatari.
* **Detall de Despeses Nadalenques:** Dins *Control Econòmic → Ràtios i Comparativa*, es mostra una subtargeta específica que desglossa el gastat per cada categoria de despesa nadalenca (incloent `🍲 Dinar de Santa Llúcia` i `🗓️ Calendari d'Advent`), el seu pes percentual sobre el total de despeses i l'import pendent en estat `Idea` o `Decidit`.

---

## 5. Model de Seguretat i Privadesa

1. **Separació Codi / Dades:** El repositori públic no conté noms reals ni claus. Tota la configuració familiar viu dins `dades.json`.
2. **Secrets per PIN (`Top Secret`):**
   * Quan un usuari inicia sessió secreta amb el seu PIN, pot marcar regals com a `isSecret: true`.
   * Abans de guardar, els camps `title`, `price`, `url`, `image` i `comments` s'encripten al client mitjançant xifratge XOR sobre bytes UTF-8 (`TextEncoder`) i codificació Base64 (`app.crypt`), permetent l'ús segur d'emojis (`🚲`), accents i el símbol `€`.
   * La lectura (`app.decrypt`) descodifica en UTF-8 estricte (`TextDecoder('utf-8', { fatal: true })`) i aplica automàticament un *fallback* Latin-1 (`String.fromCharCode`) per mantenir 100% llegibles els secrets antics amb accents xifrats abans de la migració UTF-8.
   * Per a l'altre usuari (o en vista familiar bloquejada), la targeta mostra `"🎁 Sorpresa de [createdBy]"` i computa `0 €` als totals perquè l'import no delati el regal.
3. **Autenticació al Núvol i Enllaç Màgic (`#setup=`):**
   * El *Fine-Grained PAT* de GitHub es limita exclusivament al repositori `nadal-dades` amb permís `Contents: Read and write`.
   * **Enllaç Màgic:** Genera una URL `https://.../#setup=<base64_json>`. Com que el fragment `#` mai s'envia als servidors HTTP de GitHub, permet configurar un mòbil nou en un sol clic. Tant en `loadGithubConfig()` com en `saveGithubConfig()`, un cop llegit i persistit, el fragment s'esborra immediatament de la barra d'adreces i de l'historial amb `history.replaceState(null, '', window.location.pathname)`.
   * **Persistència Dual:** Per evitar la pèrdua de sessió a Safari iOS (aïllament entre navegador i PWA a la pantalla d'inici), les credencials es desen simultàniament a `localStorage` (`nadalGithubConfig`) i en una cookie persistent de 1 any (`nadalGhCfg`).

---

## 6. Especificació Funcional de Vistes i Mòduls

### A. Capçalera *Smart Sticky* (`<header id="appHeader">`) i Navegació Inferior
* **Comportament *Smart Sticky* (`setupSmartHeader`):** La capçalera vermella s'amaga automàticament en fer scroll cap avall (`> 80px`) per maximitzar l'àrea visible al mòbil i reapareix de manera immediata en fer un lleuger gest d'scroll cap amunt.
* **Panell Desplegable de Núvol (`#cloudDrawer`):** L'estat de connexió es mostra com una píndola compacta a la barra superior (`⚪ Local` / `🟡 Sincro...` / `🟢 Núvol` / `🔴 Error`) que desplega les accions de sincronització, configuració, compartir idees i exportació/importació JSON.
* **Barra de Navegació Inferior Fixa (`<nav class="bottom-nav">`):** Accés directe amb el polze a les 4 pantalles (`📋 Llista`, `👨‍👩‍👧‍👧 Mapa`, `🕯️ Advent`, `🍲 Sta. Llúcia`), amb suport `env(safe-area-inset-bottom)`. El botó flotant `+` se situa per sobre de la barra i s'amaga a la vista d'Advent.

### B. Vista 1: `📋 Llista i Logística`
* **Filtres Multi-Selecció d'Un Sol Clic:**
  * Píndoles independents per marcar simultàniament un o diversos **Estats individuals** (`💡 Idea`, `🎯 Decidit`, `🚚 Comprat/Delivery`, `✅ El tenim`, `🎀 Embolicat`, `🤝 Confirmat`) i un o diversos **Esdeveniments**.
  * Cerca de text lliure, desplegables de *Tipus* i *Persona*, botó de neteja ràpida i plegat opcional en mòbil.
* **Agrupació per Rondes:** Quan l'únic esdeveniment seleccionat és el Tió familiar (`cfg.bigTioName`), els filtres s'apliquen abans de pintar les capçaleres `.round-header` per evitar seccions buides, i els elements sense ronda s'agrupen al bloc final **`🪵 Altres / Sense ronda`**.

### C. Vista 2: `👨‍👩‍👧‍👧 Mapa per Persona`
Graella panoràmica dividida en **tres nivells jeràrquics**:
1. **Nucli Familiar:** Una caixa per a cada membre de `casaMembers` més una caixa automàtica **`🏠 Casa / Els 4`** on s'agrupen els regals compartits per tots els membres de casa.
2. **Familiars Directes:** Una caixa individual per a cada membre de `dir1Members` i `dir2Members` (amb icona `🐶` automàtica si el nom conté `(gos)` o `(gossa)`).
3. **Altres Familiars:** Dues caixes agrupades (`ext1Name` i `ext2Name`) que mostren el destinatari específic dins de cada mini-targeta.

### D. Vista 3: `🕯️ Calendari d'Advent`
* **Renderitzat Adaptatiu:**
  * **Escriptori (`> 768px`):** Graella de calendari real de 7 columnes (`Dl` a `Dg`) amb desplaçament inicial calculat segons el dia de la setmana de l'1 de desembre de l'any nadalenc actiu.
  * **Mòbil (`<= 768px`):** Columna vertical compacta de 24 targetes ordenades de l'1 al 24.
* **Codi de Colors i Dates:** Distingeix visualment els dies buits (vora discontínua), `💡 Idea` (ambre), `🎯 Decidit` (blau), `✅ A punt` (verd), el dia actual (`✨ Avui`) i les dates ja passades (`Passat`). Inclou filtre ràpid (`Tots`, `Buits`, `Idees/Decidits`, `A punt`).

### E. Vista 4: `🍲 Dinar de Santa Llúcia`
* Vista dedicada que centralitza el resum econòmic i les partides vinculades a la categoria `"🍲 Dinar de Santa Llúcia"`, preparada per incorporar la gestió detallada de menú, assistents i tasques.

### F. Eines Complementàries
* **Duplicació de targetes (`📋 Duplicar`):** Crea un clon amb nou `id`, estat forçat a `Idea` i mantenint intacte l'estat de `Top Secret`.
* **Generador d'Idees (`📲 Idees`):** Permet marcar múltiples persones, triar camps i generar un text formatat per a WhatsApp filtrant estrictament `type === "gift"`, `state === "Idea"` i `!isSecret`.
* **Icona PWA Dinàmica (`generatePngIcons`):** Genera un PNG de `180x180px` mitjançant `<canvas>` per a iOS Safari.

---

## 7. Ergonomia i Patrons d'Interacció (UX)

* **Clic fora del modal (*Backdrop Click*):**
  * En modals de consulta (`unlockModal`, `shareModal`, `configModal`): tanca la finestra.
  * En `budgetsModal`: si l'usuari és a les pestanyes d'edició (*Límits* o *Any Passat*), desa els canvis i tanca.
  * En `giftModal` i `adventModal`: si el camp títol és buit, tanca sense mostrar alertes de validació; en qualsevol altre cas, desa els canvis i tanca.
* **Dreceres de Teclat (`setupKeyboardShortcuts`):**
  * `ESC`: Tanca la finestra modal activa sense desar (equivalent a Cancel·lar).
  * `Ctrl + Enter` (o `Cmd + Enter` a macOS): Executa l'acció principal de desar i tancar de la finestra modal activa.

---

## 8. Regles de Manteniment per a Futures Iteracions (Contracte IA)

1. **Zero Dependències:** No introduir npm, bundlers, frameworks JS ni llibreries externes. Tot el codi ha de continuar sent HTML/CSS/JS pur executable directament des de GitHub Pages.
2. **Privadesa al Codi Públic:** No escriure mai noms reals, tokens ni contrasenyes dins `index.html`, `style.css` o `app.js`. Qualsevol nou paràmetre personalitzable s'ha d'afegir a `app.data.config`.
3. **Integritat de Dades i Sincronització:** Mantenir la compatibilitat amb l'esquema actual de `dades.json` (inclòs el node `advent`), el xifratge UTF-8 amb *fallback* Latin-1 (`crypt`/`decrypt`), la bandera `nadalPendingSync`, la cua `queuedPush`, el sistema de *tombstones* (`deletedIds`) i la fusió en cas de conflicte (`mergeDataObjects`).
4. **Abast dels Canvis:** Indicar sempre amb precisió els fitxers afectats (`index.html`, `style.css`, `app.js`, `SPEC.md`) amb els blocs exactes de cerca i substitució o fitxers complets segons la magnitud del canvi.

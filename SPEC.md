# Especificació Tècnica i Funcional — Nadal Tracker

Aquest document defineix l'arquitectura, el model de dades, les regles de negoci, la seguretat i els patrons d'interfície de **Nadal Tracker**, una aplicació web progressiva (PWA) dissenyada per a la planificació familiar compartida de regals i despeses nadalenques.

---

## 1. Visió General i Context del Producte

* **Objectiu:** Gestionar de manera col·laborativa i en temps real el cicle de vida dels regals (des de la idea inicial fins que estan embolicats), el control pressupostari, el balanç de regals per persona i el registre de regals que faran altres familiars per evitar duplicitats.
* **Usuaris:** Dos administradors principals (pares/parella) amb gestió de secrets individuals per PIN, dins un ecosistema familiar ampliat (fills, avis, tiets, cosins i mascotes).
* **Idioma de la interfície:** Català (textos, estats, categories i formats numèrics/data `ca-ES`).
* **Filosofia tècnica:** *Zero-Build*, *Zero-Backend*, *Client-Side First* i *Privacy-by-Design*. L'aplicació funciona íntegrament al navegador sense servidors intermedis, frameworks ni dependències externes.

---

## 2. Arquitectura Tècnica i Infraestructura

L'aplicació utilitza una arquitectura desacoblada en **dos repositoris de GitHub** dins un mateix compte d'usuari:

| Component | Repositori | Visibilitat | Funció |
| --- | --- | --- | --- |
| **Frontend (App)** | `nadal-app` | **Públic** (GitHub Pages) | Allotja el codi estàtic (`index.html`, `style.css`, `app.js`). No conté dades personals ni credencials. |
| **Base de Dades** | `nadal-dades` | **Privat** | Allotja l'únic fitxer de persistència (`dades.json`) amb regals, pressupostos, PINs i configuració familiar. |

### Estructura Modular del Codi (`nadal-app`)

1. `index.html`: Estructura semàntica del DOM, capçalera, contenidors de vistes i finestres modals.
2. `style.css`: Variables CSS (`--c-red: #b3000c`, `--c-green: #165b33`, `--c-gold: #f1c40f`, `--c-bg: #fcf9f2`), disseny *responsive* adaptatiu (mòbil estret `650px` per a llista, escriptori ample `1380px` per a graella familiar) i animació CSS de neu a la capçalera.
3. `app.js`: Controlador únic encapsulat dins l'objecte global `app` (estat, motor criptogràfic, client API de GitHub, càlculs financers i renderitzat del DOM).

### Motor de Sincronització (`GitHub REST API`)

* **Lectura (`GET /repos/{owner}/{repo}/contents/{path}`):**
* Utilitza capçaleres `Authorization: Bearer <token>` i `If-None-Match: <ETag>` per minimitzar el consum de quota.
* *Polling* automàtic cada **15 segons** (aturat si la pestanya està oculta o si hi ha qualsevol modal obert per no sobreescriure edicions en curs).


* **Escriptura Optimista i Resolució de Conflictes (`PUT`):**
* Cada desat desa primer a `localStorage` (`nadalData`) i envia el JSON codificat en Base64 UTF-8 (`ghEncodeBase64`) juntament amb l'últim `sha` conegut.
* **Gestió de col·lisions (HTTP 409 / 422):** Si els dos usuaris guarden simultàniament, l'app descarrega la versió remota, executa `mergeDataObjects(remote, local)` —fusionant regals per `id` segons el timestamp `updatedAt` més recent i respectant el registre d'eliminats (`deletedIds`)— i reintenta el `PUT` fins a 2 vegades.



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
  "lastUpdate": "22/11/2026, 07:35:00"
}

```

### Compatibilitat Retroactiva (Migracions)

* Els registres antics amb `recipient` o `from` com a *string* es llegeixen automàticament com a arrays (`recipients`, `froms`).
* Si s'importa un JSON sense node `config`, `inferConfigFromLegacyData()` dedueix usuaris, membres de casa i rondes automàticament.

---

## 4. Lògica de Negoci i Regles Financeres

### Tipus d'Elements i Estats

L'aplicació gestiona **tres fluxos diferenciats**:

1. **Regals Nostres (`type === "gift"` i `paidByUs === true`):**
* *Estats disponibles:* `Idea` (Idea / Previst), `Decidit` (Decidit, pendent de comprar), `Comprat/Delivery` (Comprat / Pagat), `El tenim`, `Embolicat`.
* *Impacte econòmic:* Només sumen a **Gastat** quan estan en estat `Comprat/Delivery`, `El tenim` o `Embolicat`.


2. **Regals d'una Altra Casa (`type === "gift"` i `paidByUs === false`):**
* En desmarcar *"Ho paguem nosaltres"*, el formulari commuta automàticament el selector d'estats a només dues opcions: **`💡 Idea / Proposta`** (`Idea`) i **`🤝 Confirmat`** (`Confirmat`).
* *Impacte econòmic:* **Mai sumen al pressupost** (ni com a previst ni com a gastat), fins i tot si s'anota un preu orientatiu en una proposta.
* *Objectiu:* Controlar el volum de regals que rebran els membres de casa des d'altres llars i evitar repeticions.


3. **Despeses Nadalenques (`type === "expense"`):**
* Categories fixes: `🍲 Dinar de Santa Llúcia`, `🍽️ Àpats i Begudes`, `✨ Decoració i Arbre`, `🪵 Tradicions (Tió, Reis, Pessebre)`, `✉️ Postals de Nadal`, `🎉 Altres despeses nadalenques`.
* Assigna per defecte l'esdeveniment `✨ General Festes`.
* *Impacte econòmic:* Sumen a la categoria global `🎄 Altres Despeses (Àpats, Deco...)` quan no són `Idea` ni `Decidit`.



### Càlculs Pressupostaris (`calculateSpendingBreakdown`)

* **Desglossament Definitiu vs. Aproximat:** Segons el flag booleà `isApprox`, el total gastat es divideix en `totalSpentDefinitive` i `totalSpentApprox` (mostrant-se tant a la capçalera com al panell *Control Econòmic*).
* **Prorrateig Multi-Destinatari:** Si un regal pagat per nosaltres té $N$ destinataris (`recipients.length > 1`), el seu import es divideix a parts iguals ($\text{Preu} / N$) entre les categories pressupostàries de cada destinatari.
* **Detall de Despeses Nadalenques:** Dins *Control Econòmic → Ràtios i Comparativa*, es mostra una subtargeta específica que desglossa el gastat per cada categoria de despesa nadalenca, el seu pes percentual sobre el total de despeses i l'import pendent en estat `Idea` o `Decidit`.

---

## 5. Model de Seguretat i Privadesa

1. **Separació Codi / Dades:** El repositori públic no conté noms reals ni claus. Tota la configuració familiar viu dins `dades.json`.
2. **Secrets per PIN (`Top Secret`):**
* Quan un usuari inicia sessió secreta amb el seu PIN, pot marcar regals com a `isSecret: true`.
* Abans de guardar, els camps `title`, `price`, `url`, `image` i `comments` s'encripten al client mitjançant xifratge XOR amb la clau del PIN i codificació Base64 (`app.crypt`).
* Per a l'altre usuari (o en vista familiar bloquejada), la targeta mostra `"🎁 Sorpresa de [createdBy]"` i computa `0 €` als totals perquè l'import no delati el regal.


3. **Autenticació al Núvol i Enllaç Màgic (`#setup=`):**
* El *Fine-Grained PAT* de GitHub es limita exclusivament al repositori `nadal-dades` amb permís `Contents: Read and write`.
* **Enllaç Màgic:** Genera una URL `https://.../#setup=<base64_json>`. Com que el fragment `#` mai s'envia als servidors HTTP de GitHub, permet configurar un mòbil nou en un sol clic. Un cop llegit, s'esborra de la barra d'adreces amb `history.replaceState`.
* **Persistència Dual:** Per evitar la pèrdua de sessió a Safari iOS (aïllament entre navegador i PWA a la pantalla d'inici), les credencials es desen simultàniament a `localStorage` (`nadalGithubConfig`) i en una cookie persistent de 1 any (`nadalGhCfg`).



---

## 6. Especificació Funcional de Vistes i Mòduls

### A. Capçalera Fixa (`<header>`)

* Barra de sessió (Vista Familiar / Sessió secreta activa) i botó de desbloqueig/bloqueig.
* **Compte enrere dinàmic (`renderCountdown`):** Calcula els dies restants per al Tió (24 des.), Nadal (25 des.) i Reis (6 gen.).
* Resum financer clicable (obre *Control Econòmic*) amb barra de progrés global.

### B. Vista 1: `📋 Llista i Logística`

* **Filtres combinables:** Cerca de text lliure, Tipus (*Tot*, *Tots els Regals*, *Regals Nostres*, *D'una altra casa*, *Despeses*), Estat (*Tots*, *Idees*, *Decidits*, *Confirmats*, *Pendents nostres*), Esdeveniment i Persona.
* **Agrupació per Rondes:** Si es selecciona l'esdeveniment de Tió familiar (`cfg.bigTioName`), la llista s'agrupa automàticament sota capçaleres per cada ronda configurada.

### C. Vista 2: `👨‍👩‍👧‍👧 Mapa per Persona`

Graella panoràmica dividida en **tres nivells jeràrquics**:

1. **Nucli Familiar:** Una caixa per a cada membre de `casaMembers` més una caixa automàtica **`🏠 Casa / Els 4`** on s'agrupen els regals que tenen marcats simultàniament tots els membres de casa.
2. **Familiars Directes:** Una caixa individual per a cada membre de `dir1Members` i `dir2Members` (amb icona `🐶` automàtica si el nom conté `(gos)` o `(gossa)`).
3. **Altres Familiars:** Dues caixes agrupades (`ext1Name` i `ext2Name`) que mostren el destinatari específic dins de cada mini-targeta.

**Regles de cada caixa individual:**

* Mostra totes les persones encara que estiguin buides (*"No hi ha regals planificats"*), amb un filtre global opcional per amagar caixes buides.
* **Comptadors per esdeveniment:** Píndoles superiors amb emoji i recompte per esdeveniment. **Exclouen les `Idea**` i inclouen tots els regals consolidats (tant nostres com `Confirmat` d'altres cases).
* **Separació visual interna:** Les `Idea` es mostren amb vora discontínua; els regals d'altres cases se separen a la part inferior sota la línia divisòria `🏡 D'una altra casa (Rebrem)`.
* **Acció ràpida (`+`):** Cada caixa incorpora un botó `+` que obre el formulari amb aquella persona (o els 4 de casa) i l'esdeveniment filtrat preseleccionats.

### D. Eines Complementàries

* **Duplicació de targetes (`📋 Duplicar`):** Dins l'edició d'un element existent, crea un clon amb nou `id`, estat forçat a `Idea` i mantenint intacte l'estat de `Top Secret`.
* **Generador d'Idees (`📲 Idees`):** Permet marcar múltiples persones (amb dreceres per als fills o tota la casa), triar quins camps incloure (preu, enllaç, comentaris, esdeveniment) i genera un text formatat per a WhatsApp dins un `<textarea>` editable abans de copiar-lo al porta-retalls. Filtra estrictament `type === "gift"`, `state === "Idea"` i `!isSecret`.
* **Icona PWA Dinàmica (`generatePngIcons`):** Genera en temps d'execució un PNG de `180x180px` mitjançant `<canvas>` (fons `#b3000c` + emoji `🎄`) i l'injecta a `<link id="appleTouchIcon" rel="apple-touch-icon">` per garantir compatibilitat nativa amb iOS Safari.

---

## 7. Ergonomia i Patrons d'Interacció (UX)

* **Clic fora del modal (*Backdrop Click*):**
* En modals de consulta (`unlockModal`, `shareModal`, `configModal`): tanca la finestra.
* En `budgetsModal`: si l'usuari és a les pestanyes d'edició (*Límits* o *Any Passat*), desa els canvis i tanca.
* En `giftModal`: si és un element nou i el camp títol és buit, tanca sense mostrar alertes de validació; en qualsevol altre cas, desa els canvis i tanca.


* **Dreceres de Teclat (`setupKeyboardShortcuts`):**
* `ESC`: Tanca la finestra modal activa sense desar (equivalent a Cancel·lar).
* `Ctrl + Enter` (o `Cmd + Enter` a macOS): Executa l'acció principal de desar i tancar de la finestra modal activa.



---

## 8. Regles de Manteniment per a Futures Iteracions (Contracte IA)

Qualsevol modificació futura sobre aquest codi ha de respectar obligatòriament els principis següents:

1. **Zero Dependències:** No introduir npm, bundlers, frameworks JS ni llibreries externes. Tot el codi ha de continuar sent HTML/CSS/JS pur executable directament des de GitHub Pages.
2. **Privadesa al Codi Públic:** No escriure mai noms reals, tokens ni contrasenyes dins `index.html`, `style.css` o `app.js`. Qualsevol nou paràmetre personalitzable s'ha d'afegir a `app.data.config`.
3. **Integritat de Dades:** Mantenir la compatibilitat amb l'esquema actual de `dades.json`, el xifratge XOR (`crypt`/`decrypt`), el sistema de *tombstones* (`deletedIds`) i la fusió en cas de conflicte (`mergeDataObjects`).
4. **Abast dels Canvis:** Quan es modifiqui només l'aparença, entregar únicament els blocs afectats de `style.css`; quan s'afegeixi lògica puntual, indicar les cerques i substitucions exactes a `app.js` / `index.html` per facilitar l'edició directa a GitHub.

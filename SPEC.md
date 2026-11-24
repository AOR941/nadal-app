Markdown
# 🎄 Nadal Tracker — Especificació Tècnica (v8.0)

Aplicació web progressiva (PWA) per a la gestió familiar de regals, pressupost, Calendari d'Advent i despeses nadalenques. Dissenyada sota principis **Zero-Build**, **Zero-Backend** i **Zero-Knowledge**.

---

## 1. Principis d'Arquitectura i Privadesa

* **Zero-Build:** HTML5, CSS3 i JavaScript natiu mitjançant **ES Modules** (`<script type="module">`), sense compiladors, *bundlers* ni dependències externes. Desplegable directament a GitHub Pages.
* **Zero-Backend (BYOC — Bring Your Own Cloud):** El codi públic viu al repositori `nadal-app`. Totes les dades familiars viuen a un repositori privat separat (`nadal-dades` → `dades.json`) sincronitzat via GitHub REST API.
* **Zero dades personals al codi públic:** El codi font no conté noms reals, configuracions familiars específiques ni credencials. Tota la composició familiar viatja dins `dades.json` (`config`).
* **Xifratge local de secrets:** Els regals marcats com a *Top Secret* es xifren al client (XOR sobre UTF-8 amb compatibilitat regressiva Latin-1) mitjançant el PIN personal de cada adult abans d'escriure al núvol.

---

## 2. Estructura de Fitxers

```text
nadal-app/
├── index.html          # Estructura base, capçalera smart-sticky, barra inferior i modals globals
├── style.css           # Estils unificats dividits en 7 blocs numerats
├── SPEC.md             # Documentació tècnica del projecte
└── js/
    ├── main.js         # Punt d'entrada: registra les 4 pestanyes i arrenca core.init()
    ├── core.js         # Estat global, GitHub Sync, criptografia, finances, WhatsApp i formulari
    ├── list.js         # Pestanya 1: Llista, filtres col·lapsables, Graella PC i Kanban drag & drop
    ├── board.js        # Pestanya 2: Mapa per Persona amb píndoles ràpides i ordenació interna
    ├── advent.js       # Pestanya 3: Calendari d'Advent (24 dies), Bateria d'Idees i modal propi
    └── santallucia.js  # Pestanya 4: Vista i resum de despeses del Dinar de Santa Llúcia
3. Funcionalitats Principals per Mòdul
Nucli (js/core.js)
Sincronització amb GitHub: Lectura condicional amb ETag (polling cada 15 s sense modals oberts), control de concurrència per SHA, resolució automàtica de conflictes (mergeDataObjects per updatedAt i deletedIds) i cua offline (nadalPendingSync).

Configuració portable: Persistència de credencials a localStorage + cookie de suport, i generació d'Enllaç Màgic (#setup=...) per configurar mòbils en un clic.

Interacció mòbil i escriptori: Capçalera smart sticky, gest swipe-down per sincronitzar al mòbil i dreceres de teclat (Esc per tancar, Ctrl/Cmd + Enter per guardar).

Control Econòmic: Càlcul automàtic de gastat definitiu vs. aproximat, execució per persona/bloc, desglossament de despeses nadalenques (incloent Advent) i comparativa anual (Any Passat).

Compartir per WhatsApp: Generador editable amb selecció de persones i 3 caselles combinables (Idees pendents, Nostres decidits/comprats i Confirmats d'altres cases). Exclou sempre els regals Top Secret.

Regals conjunts i entregues: Detecció automàtica d'aportacions conjuntes entre unitats familiars (🤝 Conjunt amb: ...) i camp opcional de data prevista d'entrega (deliveryDate).

Pestanya Llista (js/list.js)
Panell de filtres col·lapsable: Plegat per defecte a PC i mòbil amb comptador de filtres actius i botó ràpid de neteja.

Filtres d'1 clic amb lògica d'intersecció (AND): Píndoles dinàmiques per als membres de config.casaMembers més 🏠 Tots N. Marcar diverses persones mostra els regals on apareixen totes elles alhora.

Filtres addicionals: Multi-selecció d'estats, esdeveniments, botó ràpid 🚚 En camí, selector de tipus i desplegable de família extensa.

Ordenació contextual: Per ordre d'entrada, esdeveniment cronològic, estat, persona, preu o data d'entrega.

Modes d'escriptori: Graella, Kanban per Estat i Kanban per Dia/Esdeveniment amb arrossegament de targetes (HTML5 Drag & Drop) i contenidor eixamplat automàticament (wide-view / kanban-wide).

Pestanya Mapa (js/board.js)
Organització en tres blocs: Nucli Familiar (membres + caixa conjunta Casa / Els N), Familiars Directes i Altres Familiars.

Píndoles ràpides del nucli de casa + 🏠 Tots N, filtre per esdeveniment/estat, opció d'amagar caixes buides i ordenació interna de mini-targetes.

Pestanya Advent (js/advent.js)
Mòdul 100% autònom (injecta la seva vista i el seu modal #adventModal).

Calendari de 24 dies alineat al dia de la setmana real de desembre de l'any nadalenc en curs, amb Bateria d'Idees (adventPool) per assignar o intercanviar dies i suma automàtica al pressupost de 🗓️ Calendari d'Advent.

Pestanya Santa Llúcia (js/santallucia.js)
Resum dedicat de despeses gastades i previstes vinculades a la categoria 🍲 Dinar de Santa Llúcia amb accés directe per afegir noves partides.

4. Esquema de Dades (dades.json)
JSON
{
  "gifts": [
    {
      "id": "string",
      "type": "gift | expense",
      "expenseCat": "string | null",
      "title": "string (xifrat si isSecret)",
      "price": "string | number (nostra aportació; xifrat si isSecret)",
      "isApprox": "boolean",
      "deliveryDate": "YYYY-MM-DD | ''",
      "url": "string",
      "image": "string",
      "comments": "string",
      "isSecret": "boolean",
      "paidByUs": "boolean",
      "recipients": ["string"],
      "froms": ["string"],
      "event": "string",
      "round": "string | null",
      "state": "Idea | Decidit | Comprat/Delivery | El tenim | Embolicat | Confirmat",
      "createdBy": "string",
      "updatedAt": "timestamp"
    }
  ],
  "deletedIds": ["string"],
  "advent": {
    "1": { "day": 1, "title": "string", "state": "Idea | Decidit | Comprat", "price": "string", "isApprox": "boolean", "url": "string", "comments": "string", "updatedAt": "timestamp" }
  },
  "adventPool": [],
  "budgets": {},
  "lastYear": {},
  "pins": {},
  "config": {
    "parents": ["string"],
    "casaMembers": ["string"],
    "dir1Name": "string",
    "dir1Members": ["string"],
    "dir2Name": "string",
    "dir2Members": ["string"],
    "ext1Name": "string",
    "ext1Members": ["string"],
    "ext2Name": "string",
    "ext2Members": ["string"],
    "bigTioName": "string",
    "rounds": ["string"]
  },
  "lastUpdate": "string"
}

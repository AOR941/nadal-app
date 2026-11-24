/* ==========================================================================
 * NADAL TRACKER - JS/CORE.JS (Índex de blocs)
 * [1] Constants globals, categories per defecte i estat del nucli
 * [2] Helpers de configuració, migració, esdeveniments i criptografia
 * [3] Persistència local, Cookie de suport i sincronització amb GitHub
 * [4] Motor econòmic jeràrquic (3 nivells) i modal de Control Econòmic
 * [5] Formulari de Regals / Despeses (incl. categories on-the-fly)
 * [6] Sessió PIN (Top Secret), Configuració i Compartir per WhatsApp
 * [7] Navegació entre pestanyes, PWA, smart-sticky i arrencada
 * ========================================================================== */

export const STATE_PROGRESS_ORDER = [
    'Idea',
    'Decidit',
    'Comprat/Delivery',
    'El tenim',
    'Embolicat',
    'Confirmat'
];

export const DEFAULT_EXPENSE_CATEGORIES = [
    '🍲 Dinar de Santa Llúcia',
    "🗓️ Calendari d'Advent",
    '🍽️ Àpats i Begudes',
    '✨ Decoració i Tradicions',
    '📦 Logística i Preparatius',
    '✉️ Postals de Nadal',
    '🎉 Altres despeses nadalenques'
];

const LEGACY_EXPENSE_CAT_MAP = {
    '✨ Decoració i Arbre': '✨ Decoració i Tradicions',
    '🪵 Tradicions (Tió, Reis, Pessebre)': '✨ Decoració i Tradicions'
};

const DEFAULT_CONFIG = {
    parents: ['Adult 1', 'Adult 2'],
    casaMembers: ['Fill/a 1', 'Fill/a 2', 'Adult 1', 'Adult 2'],
    dir1Name: 'Família 1',
    dir1Members: [],
    dir2Name: 'Família 2',
    dir2Members: [],
    ext1Name: 'Família Extensa 1',
    ext1Members: [],
    ext2Name: 'Família Extensa 2',
    ext2Members: [],
    bigTioName: '🪵 Tió Família',
    rounds: ['Ronda 1', 'Ronda 2'],
    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES]
};

const SPENT_GIFT_STATES = ['Comprat/Delivery', 'El tenim', 'Embolicat'];
const PLANNED_GIFT_STATES = ['Idea', 'Decidit'];
const SPECIAL_FROM_TOKENS = ['Nosaltres', 'Casa', 'Tió', 'Pare Noel', 'Reis Mags'];

export const core = {
    /* --- [1] CONSTANTS GLOBALS I ESTAT DEL NUCLI --- */
    allGiftStates: [
        { value: 'Idea', label: '💡 Idea' },
        { value: 'Decidit', label: '🎯 Decidit' },
        { value: 'Comprat/Delivery', label: '🚚 Comprat/Delivery' },
        { value: 'El tenim', label: '✅ El tenim' },
        { value: 'Embolicat', label: '🎁 Embolicat' },
        { value: 'Confirmat', label: '🏡 Confirmat' }
    ],

    views: {},
    activeMainView: 'list',
    currentUser: null,
    currentPin: null,
    isDuplicating: false,
    econExpanded: {},

    ghConfig: { owner: '', repo: '', path: 'dades.json', token: '' },
    ghSha: null,
    ghEtag: null,
    isSyncing: false,
    pollTimer: null,
    pushTimer: null,

    data: {
        gifts: [],
        deletedIds: [],
        advent: {},
        adventPool: [],
        budgets: {},
        lastYear: {},
        pins: {},
        config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
        lastUpdate: ''
    },

    /* --- [2] HELPERS DE CONFIGURACIÓ, MIGRACIÓ, ESDEVENIMENTS I CRIPTOGRAFIA --- */
    escapeHtml: (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),

    formatMoney: (val) => {
        const n = Number(val) || 0;
        return n.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    },

    formatMemberLabel: (name) => {
        if (!name) return '';
        return /\(gos/i.test(name)
            ? `🐶 ${name.replace(/\s*\(gos.*?\)/i, '').trim()}`
            : name;
    },

    parseCommaList: (str) => String(str || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),

    getConfig: () => {
        const raw = (core.data && core.data.config) ? core.data.config : {};
        const merged = {
            parents: Array.isArray(raw.parents) && raw.parents.length ? raw.parents : [...DEFAULT_CONFIG.parents],
            casaMembers: Array.isArray(raw.casaMembers) && raw.casaMembers.length ? raw.casaMembers : [...DEFAULT_CONFIG.casaMembers],
            dir1Name: raw.dir1Name || DEFAULT_CONFIG.dir1Name,
            dir1Members: Array.isArray(raw.dir1Members) ? raw.dir1Members : [],
            dir2Name: raw.dir2Name || DEFAULT_CONFIG.dir2Name,
            dir2Members: Array.isArray(raw.dir2Members) ? raw.dir2Members : [],
            ext1Name: raw.ext1Name || DEFAULT_CONFIG.ext1Name,
            ext1Members: Array.isArray(raw.ext1Members) ? raw.ext1Members : [],
            ext2Name: raw.ext2Name || DEFAULT_CONFIG.ext2Name,
            ext2Members: Array.isArray(raw.ext2Members) ? raw.ext2Members : [],
            bigTioName: raw.bigTioName || DEFAULT_CONFIG.bigTioName,
            rounds: Array.isArray(raw.rounds) ? raw.rounds : [...DEFAULT_CONFIG.rounds],
            expenseCategories: Array.isArray(raw.expenseCategories) && raw.expenseCategories.length
                ? raw.expenseCategories
                : [...DEFAULT_EXPENSE_CATEGORIES]
        };
        return merged;
    },

    getExpenseCategories: () => {
        const cfg = core.getConfig();
        const set = new Set();
        cfg.expenseCategories.forEach(c => {
            const mapped = LEGACY_EXPENSE_CAT_MAP[c] || c;
            if (mapped && mapped.trim()) set.add(mapped.trim());
        });
        // Assegurem que les dues categories vinculades a pestanyes sempre existeixin
        set.add('🍲 Dinar de Santa Llúcia');
        set.add("🗓️ Calendari d'Advent");
        (core.data.gifts || []).forEach(g => {
            if ((g.type || 'gift') === 'expense' && g.expenseCat) {
                const mapped = LEGACY_EXPENSE_CAT_MAP[g.expenseCat] || g.expenseCat;
                if (mapped.trim()) set.add(mapped.trim());
            }
        });
        return Array.from(set);
    },

    migrateExpenseCategories: () => {
        let changed = false;

        if (!core.data.config) core.data.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        if (!Array.isArray(core.data.config.expenseCategories) || core.data.config.expenseCategories.length === 0) {
            core.data.config.expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES];
            changed = true;
        } else {
            const cleaned = [];
            core.data.config.expenseCategories.forEach(cat => {
                const mapped = LEGACY_EXPENSE_CAT_MAP[cat] || cat;
                if (mapped !== cat) changed = true;
                if (mapped && !cleaned.includes(mapped)) cleaned.push(mapped);
            });
            if (!cleaned.includes('📦 Logística i Preparatius') && changed) {
                const idx = cleaned.indexOf('✨ Decoració i Tradicions');
                if (idx > -1) cleaned.splice(idx + 1, 0, '📦 Logística i Preparatius');
                else cleaned.push('📦 Logística i Preparatius');
            }
            core.data.config.expenseCategories = cleaned;
        }

        (core.data.gifts || []).forEach(g => {
            if ((g.type || 'gift') === 'expense' && g.expenseCat && LEGACY_EXPENSE_CAT_MAP[g.expenseCat]) {
                g.expenseCat = LEGACY_EXPENSE_CAT_MAP[g.expenseCat];
                changed = true;
            }
        });

        ['budgets', 'lastYear'].forEach(storeKey => {
            const obj = core.data[storeKey];
            if (!obj || typeof obj !== 'object') return;
            Object.entries(LEGACY_EXPENSE_CAT_MAP).forEach(([oldCat, newCat]) => {
                [oldCat, `exp:${oldCat}`].forEach(oldKey => {
                    if (obj[oldKey] !== undefined && obj[oldKey] !== '') {
                        const targetKey = `exp:${newCat}`;
                        const sum = (parseFloat(obj[targetKey]) || 0) + (parseFloat(obj[oldKey]) || 0);
                        obj[targetKey] = Number(sum.toFixed(2));
                        delete obj[oldKey];
                        changed = true;
                    }
                });
            });
        });

        return changed;
    },

    getKidsList: () => {
        const cfg = core.getConfig();
        return cfg.casaMembers.filter(m => !cfg.parents.includes(m));
    },

    getChristmasYear: () => {
        const now = new Date();
        return (now.getMonth() === 0 && now.getDate() <= 15) ? now.getFullYear() - 1 : now.getFullYear();
    },

    getOrderedEvents: () => {
        const cfg = core.getConfig();
        const base = ['🪵 Tió Casa'];
        if (cfg.bigTioName) base.push(cfg.bigTioName);
        base.push('🎅 Pare Noel');
        base.push('👑 Reis Casa');
        if (cfg.dir1Name) base.push(`👑 Reis ${cfg.dir1Name}`);
        if (cfg.dir2Name) base.push(`👑 Reis ${cfg.dir2Name}`);

        const extras = new Set();
        (core.data.gifts || []).forEach(g => {
            if (g.event && !base.includes(g.event) && g.event !== '✨ General Festes' && g.event !== '❓ Per decidir') {
                extras.add(g.event);
            }
        });

        return [...base, ...Array.from(extras), '✨ General Festes', '❓ Per decidir'];
    },

    getEventRank: (ev) => {
        const ordered = core.getOrderedEvents();
        const idx = ordered.indexOf(ev || '❓ Per decidir');
        return idx === -1 ? ordered.length : idx;
    },

    getStateRank: (st) => {
        const idx = STATE_PROGRESS_ORDER.indexOf(st);
        return idx === -1 ? STATE_PROGRESS_ORDER.length : idx;
    },

    getEventShortBadges: () => {
        return core.getOrderedEvents()
            .filter(ev => ev !== '✨ General Festes')
            .map(ev => ({ name: ev, icon: ev.split(' ')[0] || '🎁' }));
    },

    /* --- Criptografia client-side XOR UTF-8 (amb fallback Latin-1) --- */
    encryptSecret: (plainText, pin) => {
        if (!plainText) return '';
        const keyBytes = new TextEncoder().encode(String(pin || '0000'));
        const textBytes = new TextEncoder().encode(String(plainText));
        const out = new Uint8Array(textBytes.length);
        for (let i = 0; i < textBytes.length; i++) {
            out[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        let bin = '';
        out.forEach(b => { bin += String.fromCharCode(b); });
        return 'u8:' + btoa(bin);
    },

    decryptSecret: (encoded, pin) => {
        if (!encoded) return '';
        const keyStr = String(pin || '0000');
        try {
            if (encoded.startsWith('u8:')) {
                const bin = atob(encoded.slice(3));
                const bytes = new Uint8Array(bin.length);
                const keyBytes = new TextEncoder().encode(keyStr);
                for (let i = 0; i < bin.length; i++) {
                    bytes[i] = bin.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
                }
                return new TextDecoder().decode(bytes);
            }
            // Fallback compatibilitat regressiva (Latin-1 antic)
            const bin = atob(encoded);
            let res = '';
            for (let i = 0; i < bin.length; i++) {
                res += String.fromCharCode(bin.charCodeAt(i) ^ keyStr.charCodeAt(i % keyStr.length));
            }
            return res;
        } catch (e) {
            return '';
        }
    },

    resolveGiftDisplay: (g) => {
        const cfg = core.getConfig();
        const isExpense = (g.type || 'gift') === 'expense';
        const isSecret = Boolean(g.isSecret) && !isExpense;
        const canDecrypt = !isSecret || (core.currentUser && core.currentUser === g.createdBy && core.currentPin);
        const isOthersSecret = isSecret && !canDecrypt;

        const isPaidByUs = isExpense ? true : (g.paidByUs !== false);
        const isOtherHouse = !isExpense && !isPaidByUs;
        const isReceivedFromOthers = isOtherHouse || g.state === 'Confirmat';

        const recips = Array.isArray(g.recipients)
            ? g.recipients.filter(Boolean)
            : (g.recipient ? [g.recipient] : []);
        const froms = Array.isArray(g.froms)
            ? g.froms.filter(Boolean)
            : (g.from ? [g.from] : []);

        const ownTokens = new Set([...SPECIAL_FROM_TOKENS, ...cfg.casaMembers]);
        const jointContributors = (!isExpense && isPaidByUs)
            ? froms.filter(f => !ownTokens.has(f))
            : [];

        let titleDisplay = g.title || '(Sense títol)';
        let priceRaw = g.price;
        let commentsDisplay = g.comments || '';
        let shopUrl = g.url || '';
        let imgUrl = g.image || '';

        if (isSecret) {
            if (isOthersSecret) {
                titleDisplay = `🕵️‍♂️ Top Secret (de ${g.createdBy || 'Parella'})`;
                priceRaw = 0;
                commentsDisplay = '';
                shopUrl = '';
                imgUrl = '';
            } else {
                titleDisplay = core.decryptSecret(g.title, core.currentPin) || g.title;
                priceRaw = g.price ? core.decryptSecret(String(g.price), core.currentPin) : '';
                commentsDisplay = g.comments ? core.decryptSecret(g.comments, core.currentPin) : '';
                shopUrl = g.url ? core.decryptSecret(g.url, core.currentPin) : '';
                imgUrl = g.image ? core.decryptSecret(g.image, core.currentPin) : '';
            }
        }

        const priceVal = parseFloat(String(priceRaw || '').replace(',', '.')) || 0;

        return {
            isExpense,
            isSecret,
            isOthersSecret,
            isPaidByUs,
            isOtherHouse,
            isReceivedFromOthers,
            recips,
            froms,
            jointContributors,
            titleDisplay,
            priceVal,
            commentsDisplay,
            shopUrl,
            imgUrl,
            deliveryDate: g.deliveryDate || ''
        };
    },

    /* --- [3] PERSISTÈNCIA LOCAL, COOKIE DE SUPORT I SINCRONITZACIÓ AMB GITHUB --- */
    setCookie: (name, value, days = 365) => {
        try {
            const d = new Date();
            d.setTime(d.getTime() + days * 86400000);
            document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
        } catch (e) {}
    },

    getCookie: (name) => {
        try {
            const parts = (`; ${document.cookie}`).split(`; ${name}=`);
            if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
        } catch (e) {}
        return '';
    },

    loadGithubConfig: () => {
        try {
            let saved = localStorage.getItem('nadalGhConfig');
            if (!saved) saved = core.getCookie('nadalGhConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                core.ghConfig = {
                    owner: parsed.owner || '',
                    repo: parsed.repo || '',
                    path: parsed.path || 'dades.json',
                    token: parsed.token || ''
                };
            }
        } catch (e) {}
    },

    persistGithubConfig: () => {
        const str = JSON.stringify(core.ghConfig);
        try { localStorage.setItem('nadalGhConfig', str); } catch (e) {}
        core.setCookie('nadalGhConfig', str, 365);
    },

    hasGithubConfig: () => Boolean(core.ghConfig.owner && core.ghConfig.repo && core.ghConfig.token),

    parseMagicLink: () => {
        const hash = window.location.hash || '';
        if (!hash.startsWith('#setup=')) return false;
        try {
            const b64 = decodeURIComponent(hash.slice(7));
            const jsonStr = decodeURIComponent(escape(atob(b64)));
            const parsed = JSON.parse(jsonStr);
            if (parsed.owner && parsed.repo && parsed.token) {
                core.ghConfig = {
                    owner: parsed.owner,
                    repo: parsed.repo,
                    path: parsed.path || 'dades.json',
                    token: parsed.token
                };
                core.persistGithubConfig();
                history.replaceState(null, '', window.location.pathname + window.location.search);
                return true;
            }
        } catch (e) {
            console.warn('Error llegint enllaç màgic:', e);
        }
        return false;
    },

    copyMagicLink: () => {
        const owner = document.getElementById('ghOwner').value.trim();
        const repo = document.getElementById('ghRepo').value.trim();
        const path = document.getElementById('ghPath').value.trim() || 'dades.json';
        const token = document.getElementById('ghToken').value.trim();
        if (!owner || !repo || !token) {
            alert('Omple primer Usuari, Repositori i Token per generar un Enllaç Màgic.');
            return;
        }
        const payload = JSON.stringify({ owner, repo, path, token });
        const b64 = btoa(unescape(encodeURIComponent(payload)));
        const baseUrl = window.location.href.split('#')[0];
        const link = `${baseUrl}#setup=${encodeURIComponent(b64)}`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(() => {
                alert('🔗 Enllaç Màgic copiat! Obre’l al mòbil (per WhatsApp privat) per configurar el núvol en 1 clic.');
            });
        } else {
            prompt('Copia aquest Enllaç Màgic:', link);
        }
    },

    loadLocalData: () => {
        try {
            const raw = localStorage.getItem('nadalDataV8') || localStorage.getItem('nadalData');
            if (raw) {
                const parsed = JSON.parse(raw);
                core.data = Object.assign({
                    gifts: [],
                    deletedIds: [],
                    advent: {},
                    adventPool: [],
                    budgets: {},
                    lastYear: {},
                    pins: {},
                    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
                    lastUpdate: ''
                }, parsed);
            }
        } catch (e) {}
        core.migrateExpenseCategories();
    },

    saveLocal: (triggerPush = true) => {
        core.data.lastUpdate = new Date().toLocaleString('ca-ES', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        try {
            const str = JSON.stringify(core.data);
            localStorage.setItem('nadalDataV8', str);
            localStorage.setItem('nadalData', str);
        } catch (e) {}

        const lastEl = document.getElementById('lastSync');
        if (lastEl) lastEl.innerText = core.data.lastUpdate;

        if (triggerPush && core.hasGithubConfig()) {
            try { localStorage.setItem('nadalPendingSync', '1'); } catch (e) {}
            clearTimeout(core.pushTimer);
            core.pushTimer = setTimeout(() => core.pushToGithub(), 650);
        }
    },

    updateCloudBadge: (state, msg) => {
        const dot = document.getElementById('cloudStatusDot');
        const shortEl = document.getElementById('cloudStatusShort');
        const badge = document.getElementById('cloudStatusBadge');
        if (!dot || !shortEl || !badge) return;

        const map = {
            local: { dot: '⚪', short: 'Local', full: '⚪ Mode Local (Núvol no configurat)' },
            syncing: { dot: '🟡', short: 'Sync...', full: '🟡 Sincronitzant amb GitHub...' },
            ok: { dot: '🟢', short: 'Núvol', full: '🟢 Connectat i sincronitzat' },
            offline: { dot: '🟠', short: 'Pendent', full: '🟠 Canvis locals pendents de pujar' },
            error: { dot: '🔴', short: 'Error', full: `🔴 Error de sincronització${msg ? ': ' + msg : ''}` }
        };
        const st = map[state] || map.local;
        dot.innerText = st.dot;
        shortEl.innerText = st.short;
        badge.innerText = msg && state !== 'error' ? `${st.dot} ${msg}` : st.full;
    },

    mergeDataObjects: (localObj, remoteObj) => {
        const mergedDeleted = Array.from(new Set([
            ...(localObj.deletedIds || []),
            ...(remoteObj.deletedIds || [])
        ]));
        const delSet = new Set(mergedDeleted);

        const giftMap = new Map();
        (remoteObj.gifts || []).forEach(g => { if (!delSet.has(g.id)) giftMap.set(g.id, g); });
        (localObj.gifts || []).forEach(g => {
            if (delSet.has(g.id)) return;
            const existing = giftMap.get(g.id);
            if (!existing || (g.updatedAt || 0) >= (existing.updatedAt || 0)) {
                giftMap.set(g.id, g);
            }
        });

        const mergedAdvent = Object.assign({}, remoteObj.advent || {});
        Object.entries(localObj.advent || {}).forEach(([day, item]) => {
            const rem = mergedAdvent[day];
            if (!rem || (item.updatedAt || 0) >= (rem.updatedAt || 0)) {
                mergedAdvent[day] = item;
            }
        });

        const poolMap = new Map();
        (remoteObj.adventPool || []).forEach(p => { if (!delSet.has(p.id)) poolMap.set(p.id, p); });
        (localObj.adventPool || []).forEach(p => {
            if (delSet.has(p.id)) return;
            const ex = poolMap.get(p.id);
            if (!ex || (p.updatedAt || 0) >= (ex.updatedAt || 0)) poolMap.set(p.id, p);
        });

        return {
            gifts: Array.from(giftMap.values()),
            deletedIds: mergedDeleted,
            advent: mergedAdvent,
            adventPool: Array.from(poolMap.values()),
            budgets: Object.assign({}, remoteObj.budgets || {}, localObj.budgets || {}),
            lastYear: Object.assign({}, remoteObj.lastYear || {}, localObj.lastYear || {}),
            pins: Object.assign({}, remoteObj.pins || {}, localObj.pins || {}),
            config: Object.assign(
                JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
                remoteObj.config || {},
                localObj.config || {}
            ),
            lastUpdate: localObj.lastUpdate || remoteObj.lastUpdate || ''
        };
    },

    getGithubApiUrl: () => {
        const { owner, repo, path } = core.ghConfig;
        return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
    },

    syncFromGithub: async (silent = false) => {
        if (!core.hasGithubConfig() || core.isSyncing) return;
        core.isSyncing = true;
        if (!silent) core.updateCloudBadge('syncing');

        try {
            const headers = {
                Authorization: `Bearer ${core.ghConfig.token}`,
                Accept: 'application/vnd.github+json'
            };
            if (core.ghEtag && silent) headers['If-None-Match'] = core.ghEtag;

            const resp = await fetch(core.getGithubApiUrl(), { headers, cache: 'no-store' });

            if (resp.status === 304) {
                core.updateCloudBadge('ok');
                core.isSyncing = false;
                return;
            }

            if (resp.status === 404) {
                core.isSyncing = false;
                await core.pushToGithub();
                return;
            }

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            core.ghEtag = resp.headers.get('ETag') || null;
            const json = await resp.json();
            core.ghSha = json.sha;

            const decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
            const remoteData = JSON.parse(decoded);

            const hasPending = localStorage.getItem('nadalPendingSync') === '1';
            if (hasPending) {
                core.data = core.mergeDataObjects(core.data, remoteData);
                core.migrateExpenseCategories();
                core.saveLocal(false);
                core.isSyncing = false;
                await core.pushToGithub();
                core.applyConfigToUI();
                core.renderAll();
                return;
            }

            core.data = Object.assign({
                gifts: [], deletedIds: [], advent: {}, adventPool: [],
                budgets: {}, lastYear: {}, pins: {},
                config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)), lastUpdate: ''
            }, remoteData);

            const migrated = core.migrateExpenseCategories();
            core.saveLocal(migrated);
            core.applyConfigToUI();
            core.renderAll();
            core.updateCloudBadge('ok');
        } catch (err) {
            console.warn('GitHub sync error:', err);
            const hasPending = localStorage.getItem('nadalPendingSync') === '1';
            core.updateCloudBadge(hasPending ? 'offline' : 'error', err.message);
        } finally {
            core.isSyncing = false;
        }
    },

    pushToGithub: async (retryOnConflict = true) => {
        if (!core.hasGithubConfig()) return;
        core.updateCloudBadge('syncing');

        try {
            const contentStr = JSON.stringify(core.data, null, 2);
            const contentB64 = btoa(unescape(encodeURIComponent(contentStr)));
            const body = {
                message: `Sync Nadal Tracker (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
                content: contentB64
            };
            if (core.ghSha) body.sha = core.ghSha;

            const resp = await fetch(core.getGithubApiUrl(), {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${core.ghConfig.token}`,
                    Accept: 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (resp.status === 409 && retryOnConflict) {
                // Conflicte SHA: llegim remot, fusionem i reintentem una vegada
                const getResp = await fetch(core.getGithubApiUrl(), {
                    headers: {
                        Authorization: `Bearer ${core.ghConfig.token}`,
                        Accept: 'application/vnd.github+json'
                    },
                    cache: 'no-store'
                });
                if (getResp.ok) {
                    const remJson = await getResp.json();
                    core.ghSha = remJson.sha;
                    const remData = JSON.parse(decodeURIComponent(escape(atob(remJson.content.replace(/\n/g, '')))));
                    core.data = core.mergeDataObjects(core.data, remData);
                    core.migrateExpenseCategories();
                    core.saveLocal(false);
                    core.applyConfigToUI();
                    core.renderAll();
                    return core.pushToGithub(false);
                }
            }

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const resJson = await resp.json();
            if (resJson.content && resJson.content.sha) core.ghSha = resJson.content.sha;
            core.ghEtag = null;
            localStorage.removeItem('nadalPendingSync');
            core.updateCloudBadge('ok');
        } catch (err) {
            console.warn('GitHub push error:', err);
            localStorage.setItem('nadalPendingSync', '1');
            core.updateCloudBadge('offline');
        }
    },

    manualSync: async () => {
        if (!core.hasGithubConfig()) {
            core.openConfigModal('github');
            return;
        }
        core.ghEtag = null;
        await core.syncFromGithub(false);
    },

    startPolling: () => {
        if (core.pollTimer) clearInterval(core.pollTimer);
        core.pollTimer = setInterval(() => {
            if (!core.hasGithubConfig() || document.hidden) return;
            const anyModalOpen = Array.from(document.querySelectorAll('.modal'))
                .some(m => m.style.display === 'block');
            if (!anyModalOpen) core.syncFromGithub(true);
        }, 15000);
    },

    /* --- [4] MOTOR ECONÒMIC JERÀRQUIC (3 NIVELLS) I MODAL DE CONTROL ECONÒMIC --- */
    getStoredEconVal: (store, key, fallbacks = []) => {
        if (!store) return 0;
        if (store[key] !== undefined && store[key] !== '') return parseFloat(store[key]) || 0;
        for (const fb of fallbacks) {
            if (fb && store[fb] !== undefined && store[fb] !== '') return parseFloat(store[fb]) || 0;
        }
        return 0;
    },

    computeEconomicTree: () => {
        const cfg = core.getConfig();
        const budgets = core.data.budgets || {};
        const lastYear = core.data.lastYear || {};
        const expenseCats = core.getExpenseCategories();

        const makeChild = (id, key, label, rawName, hasLimit, fallbacks = []) => ({
            id,
            key,
            label,
            rawName,
            hasLimit,
            limit: hasLimit ? core.getStoredEconVal(budgets, key, fallbacks) : 0,
            lastYear: hasLimit ? core.getStoredEconVal(lastYear, key, fallbacks) : 0,
            spent: 0,
            spentApprox: 0,
            planned: 0,
            items: []
        });

        const blocks = {
            casa: {
                id: 'casa',
                icon: '🏠',
                title: 'Nucli Familiar',
                limitMode: 'children',
                key: 'block:casa',
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0, limit: 0, lastYear: 0
            },
            dir1: {
                id: 'dir1',
                icon: '👨‍👩‍👧‍👦',
                title: cfg.dir1Name,
                limitMode: 'children',
                key: 'block:dir1',
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0, limit: 0, lastYear: 0
            },
            dir2: {
                id: 'dir2',
                icon: '👨‍👩‍👧‍👦',
                title: cfg.dir2Name,
                limitMode: 'children',
                key: 'block:dir2',
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0, limit: 0, lastYear: 0
            },
            ext1: {
                id: 'ext1',
                icon: '🌳',
                title: cfg.ext1Name,
                limitMode: 'block',
                key: 'block:ext1',
                fallbacks: [cfg.ext1Name],
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0,
                limit: core.getStoredEconVal(budgets, 'block:ext1', [cfg.ext1Name]),
                lastYear: core.getStoredEconVal(lastYear, 'block:ext1', [cfg.ext1Name])
            },
            ext2: {
                id: 'ext2',
                icon: '🌳',
                title: cfg.ext2Name,
                limitMode: 'block',
                key: 'block:ext2',
                fallbacks: [cfg.ext2Name],
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0,
                limit: core.getStoredEconVal(budgets, 'block:ext2', [cfg.ext2Name]),
                lastYear: core.getStoredEconVal(lastYear, 'block:ext2', [cfg.ext2Name])
            },
            expenses: {
                id: 'expenses',
                icon: '🎄',
                title: 'Despeses Nadalenques',
                limitMode: 'children',
                key: 'block:expenses',
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0, limit: 0, lastYear: 0
            },
            altres: {
                id: 'altres',
                icon: '✨',
                title: 'Altres / Amics',
                limitMode: 'block',
                key: 'block:altres',
                fallbacks: ['Altres / Amics', 'Altres'],
                childrenMap: new Map(),
                spent: 0, spentApprox: 0, planned: 0,
                limit: core.getStoredEconVal(budgets, 'block:altres', ['Altres / Amics', 'Altres']),
                lastYear: core.getStoredEconVal(lastYear, 'block:altres', ['Altres / Amics', 'Altres'])
            }
        };

        // Mapa prioritari persona -> bloc (evita duplicitats)
        const personToBlock = new Map();
        const registerMembers = (members, blockId, hasLimit) => {
            members.forEach(m => {
                if (!m || personToBlock.has(m)) return;
                personToBlock.set(m, blockId);
                blocks[blockId].childrenMap.set(
                    m,
                    makeChild(`${blockId}::${m}`, m, core.formatMemberLabel(m), m, hasLimit)
                );
            });
        };

        registerMembers(cfg.casaMembers, 'casa', true);
        registerMembers(cfg.dir1Members, 'dir1', true);
        registerMembers(cfg.dir2Members, 'dir2', true);
        registerMembers(cfg.ext1Members, 'ext1', false);
        registerMembers(cfg.ext2Members, 'ext2', false);

        expenseCats.forEach(cat => {
            blocks.expenses.childrenMap.set(
                cat,
                makeChild(`expenses::${cat}`, `exp:${cat}`, cat, cat, true, [cat])
            );
        });

        let lockedSecretsCount = 0;

        // 1) Processar regals i despeses de core.data.gifts
        (core.data.gifts || []).forEach(g => {
            const d = core.resolveGiftDisplay(g);

            if (d.isOthersSecret) {
                if (d.isPaidByUs) lockedSecretsCount++;
                return;
            }
            if (!d.isPaidByUs || d.isOtherHouse) return;

            const isSpent = d.isExpense
                ? !PLANNED_GIFT_STATES.includes(g.state)
                : SPENT_GIFT_STATES.includes(g.state);
            const isPlanned = PLANNED_GIFT_STATES.includes(g.state);
            if (!isSpent && !isPlanned) return;

            if (d.isExpense) {
                const rawCat = g.expenseCat || '🎉 Altres despeses nadalenques';
                const cat = LEGACY_EXPENSE_CAT_MAP[rawCat] || rawCat;
                if (!blocks.expenses.childrenMap.has(cat)) {
                    blocks.expenses.childrenMap.set(
                        cat,
                        makeChild(`expenses::${cat}`, `exp:${cat}`, cat, cat, true, [cat])
                    );
                }
                const node = blocks.expenses.childrenMap.get(cat);
                if (isSpent) {
                    node.spent += d.priceVal;
                    if (g.isApprox) node.spentApprox += d.priceVal;
                } else {
                    node.planned += d.priceVal;
                }
                node.items.push({
                    kind: 'gift',
                    id: g.id,
                    title: d.titleDisplay,
                    state: g.state,
                    event: g.event || '',
                    amount: d.priceVal,
                    totalPrice: d.priceVal,
                    splitCount: 1,
                    isApprox: Boolean(g.isApprox),
                    isSpent
                });
                return;
            }

            // Regals: repartiment proporcional entre destinataris
            const targets = d.recips.length > 0 ? d.recips : ['Altres / Sense assignar'];
            const splitCount = targets.length;
            const share = d.priceVal / splitCount;

            targets.forEach(person => {
                const blockId = personToBlock.get(person) || 'altres';
                const block = blocks[blockId];
                if (!block.childrenMap.has(person)) {
                    block.childrenMap.set(
                        person,
                        makeChild(`${blockId}::${person}`, person, core.formatMemberLabel(person), person, false)
                    );
                }
                const node = block.childrenMap.get(person);
                if (isSpent) {
                    node.spent += share;
                    if (g.isApprox) node.spentApprox += share;
                } else {
                    node.planned += share;
                }
                node.items.push({
                    kind: 'gift',
                    id: g.id,
                    title: d.titleDisplay,
                    state: g.state,
                    event: g.event || '❓ Per decidir',
                    amount: share,
                    totalPrice: d.priceVal,
                    splitCount,
                    isApprox: Boolean(g.isApprox),
                    isSpent
                });
            });
        });

        // 2) Integrar despeses del Calendari d'Advent (dies 1..24 + Bateria d'idees)
        const advCat = "🗓️ Calendari d'Advent";
        const advNode = blocks.expenses.childrenMap.get(advCat);
        if (advNode) {
            Object.entries(core.data.advent || {}).forEach(([dayStr, item]) => {
                if (!item || !item.title || !item.title.trim()) return;
                const p = parseFloat(String(item.price || '').replace(',', '.')) || 0;
                const isSpent = item.state === 'Comprat';
                if (p === 0 && !isSpent) return;
                if (isSpent) {
                    advNode.spent += p;
                    if (item.isApprox) advNode.spentApprox += p;
                } else {
                    advNode.planned += p;
                }
                advNode.items.push({
                    kind: 'adventDay',
                    id: String(dayStr),
                    title: `Dia ${dayStr} des. · ${item.title}`,
                    state: item.state || 'Idea',
                    event: advCat,
                    amount: p,
                    totalPrice: p,
                    splitCount: 1,
                    isApprox: Boolean(item.isApprox),
                    isSpent
                });
            });

            (core.data.adventPool || []).forEach(item => {
                if (!item || !item.title || !item.title.trim()) return;
                const p = parseFloat(String(item.price || '').replace(',', '.')) || 0;
                const isSpent = item.state === 'Comprat';
                if (p === 0 && !isSpent) return;
                if (isSpent) {
                    advNode.spent += p;
                    if (item.isApprox) advNode.spentApprox += p;
                } else {
                    advNode.planned += p;
                }
                advNode.items.push({
                    kind: 'adventPool',
                    id: item.id,
                    title: `🧺 ${item.title}`,
                    state: item.state || 'Idea',
                    event: advCat,
                    amount: p,
                    totalPrice: p,
                    splitCount: 1,
                    isApprox: Boolean(item.isApprox),
                    isSpent
                });
            });
        }

        // 3) Agregar subtotals per bloc i globals
        const blockOrder = ['casa', 'dir1', 'dir2', 'ext1', 'ext2', 'expenses', 'altres'];
        const totals = { spent: 0, spentApprox: 0, planned: 0, limit: 0, lastYear: 0, lockedSecretsCount };
        const blockList = [];

        blockOrder.forEach(bId => {
            const b = blocks[bId];
            b.children = Array.from(b.childrenMap.values());
            b.children.forEach(c => {
                b.spent += c.spent;
                b.spentApprox += c.spentApprox;
                b.planned += c.planned;
                if (b.limitMode === 'children') {
                    b.limit += c.limit;
                    b.lastYear += c.lastYear;
                }
            });

            // Per a blocs extensos i altres, amaguem membres amb 0 moviments a Ràtios (mantenim neteja)
            b.activeChildren = b.limitMode === 'block'
                ? b.children.filter(c => c.items.length > 0)
                : b.children;

            totals.spent += b.spent;
            totals.spentApprox += b.spentApprox;
            totals.planned += b.planned;
            totals.limit += b.limit;
            totals.lastYear += b.lastYear;

            blockList.push(b);
        });

        return { blocks: blockList, totals };
    },

    updateHeaderBudgets: () => {
        const { totals } = core.computeEconomicTree();
        const previstEl = document.getElementById('budgetPrevist');
        const gastatEl = document.getElementById('budgetGastat');
        const subEl = document.getElementById('budgetGastatSub');
        const pctEl = document.getElementById('budgetPct');
        const barEl = document.getElementById('headerProgressBar');

        if (previstEl) previstEl.innerText = core.formatMoney(totals.limit);
        if (gastatEl) gastatEl.innerText = core.formatMoney(totals.spent);

        if (subEl) {
            if (totals.spentApprox > 0) {
                const def = Math.max(0, totals.spent - totals.spentApprox);
                subEl.innerText = `Def: ${def.toFixed(0)}€ · ~${totals.spentApprox.toFixed(0)}€`;
                subEl.classList.remove('hidden');
            } else {
                subEl.classList.add('hidden');
            }
        }

        const pct = totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;
        if (pctEl) pctEl.innerText = `${pct}%`;
        if (barEl) {
            barEl.style.width = `${Math.min(100, pct)}%`;
            barEl.style.background = pct > 100 ? '#ff6b6b' : 'var(--c-gold)';
        }
    },

    openBudgetsModal: (tab = 'ratios') => {
        core.switchBudgetTab(tab);
        document.getElementById('budgetsModal').style.display = 'block';
    },

    switchBudgetTab: (tab) => {
        ['ratios', 'limits', 'lastYear'].forEach(t => {
            const btnId = t === 'ratios' ? 'tabBtnRatios' : (t === 'limits' ? 'tabBtnLimits' : 'tabBtnLastYear');
            const panelId = t === 'ratios' ? 'tabRatios' : (t === 'limits' ? 'tabLimits' : 'tabLastYear');
            document.getElementById(btnId)?.classList.toggle('active', t === tab);
            document.getElementById(panelId)?.classList.toggle('hidden', t !== tab);
        });

        if (tab === 'ratios') core.renderRatiosTab();
        else if (tab === 'limits') core.renderEconInputsTab('limits');
        else if (tab === 'lastYear') core.renderEconInputsTab('lastYear');
    },

    toggleEconNode: (nodeKey) => {
        core.econExpanded[nodeKey] = !core.econExpanded[nodeKey];
        core.renderRatiosTab();
    },

    setAllEconBlocks: (expand) => {
        const { blocks } = core.computeEconomicTree();
        blocks.forEach(b => {
            core.econExpanded[`blk:${b.id}`] = expand;
            if (!expand) {
                b.children.forEach(c => { core.econExpanded[`ch:${c.id}`] = false; });
            }
        });
        core.renderRatiosTab();
    },

    openFromEconItem: (kind, id) => {
        core.closeModal('budgetsModal');
        if (kind === 'gift') {
            core.openModal(id);
        } else if (kind === 'adventDay') {
            core.switchMainView('advent');
            if (core.views.advent) core.views.advent.openDayModal(Number(id));
        } else if (kind === 'adventPool') {
            core.switchMainView('advent');
            if (core.views.advent) core.views.advent.openPoolModal(id);
        }
    },

    buildDiffHtml: (current, lastYr) => {
        if (!lastYr || lastYr <= 0) return `<span class="econ-muted">Any passat: —</span>`;
        const diff = current - lastYr;
        const pct = Math.round((diff / lastYr) * 100);
        const sign = diff > 0 ? '+' : '';
        const cls = diff > 0.01 ? 'diff-up' : (diff < -0.01 ? 'diff-down' : 'econ-muted');
        return `<span>Any passat: <b>${core.formatMoney(lastYr)}</b> (<span class="${cls}">${sign}${core.formatMoney(diff)} · ${sign}${pct}%</span>)</span>`;
    },

    renderRatiosTab: () => {
        const { blocks, totals } = core.computeEconomicTree();
        const summaryBox = document.getElementById('ratiosSummaryBox');
        const listCont = document.getElementById('ratiosListContainer');
        const oldExpCont = document.getElementById('expenseBreakdownContainer');
        if (oldExpCont) oldExpCont.innerHTML = '';
        if (!summaryBox || !listCont) return;

        const pctTotal = totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;
        const remain = totals.limit - totals.spent;
        const approxNote = totals.spentApprox > 0
            ? ` <span class="badge approx">~${core.formatMoney(totals.spentApprox)} aprox.</span>`
            : '';
        const plannedNote = totals.planned > 0
            ? `<div class="econ-summary-line"><span>⏳ Previst (Idees / Decidits):</span><b>+${core.formatMoney(totals.planned)}</b></div>`
            : '';
        const secretNote = totals.lockedSecretsCount > 0
            ? `<div class="econ-secret-note">🔒 Hi ha ${totals.lockedSecretsCount} ${totals.lockedSecretsCount === 1 ? 'regal Top Secret bloquejat' : 'regals Top Secret bloquejats'} que no sumen fins a desbloquejar.</div>`
            : '';

        summaryBox.innerHTML = `
            <div class="econ-summary-line">
                <span>💰 <b>Gastat Enguany:</b></span>
                <span style="font-size:1.08em; font-weight:800; color:var(--c-red);">${core.formatMoney(totals.spent)}${approxNote}</span>
            </div>
            ${plannedNote}
            <div class="econ-summary-line">
                <span>🎯 Límit Total Enguany:</span>
                <b>${core.formatMoney(totals.limit)} (${pctTotal}%)</b>
            </div>
            ${totals.limit > 0 ? `
                <div class="ratio-bar-bg" style="height:10px; margin:7px 0;">
                    <div class="ratio-bar-fill ${pctTotal > 100 ? 'over' : ''}" style="width:${Math.min(100, pctTotal)}%;"></div>
                </div>
                <div class="econ-summary-line" style="font-size:0.86em;">
                    <span>${remain >= 0 ? '🟢 Marge disponible:' : '🔴 Excedit en:'}</span>
                    <b class="${remain < 0 ? 'diff-up' : 'diff-down'}">${core.formatMoney(Math.abs(remain))}</b>
                </div>
            ` : ''}
            <div class="econ-summary-line" style="margin-top:6px; padding-top:6px; border-top:1px dashed #d5dbdb; font-size:0.88em;">
                ${core.buildDiffHtml(totals.spent, totals.lastYear)}
            </div>
            ${secretNote}
            <div class="econ-expand-actions">
                <button type="button" class="preset-btn" onclick="app.setAllEconBlocks(true)">📂 Desplegar blocs</button>
                <button type="button" class="preset-btn" onclick="app.setAllEconBlocks(false)">📁 Plegar tot</button>
            </div>
        `;

        let html = '';
        blocks.forEach(b => {
            // Amaguem blocs buits sense membres ni diners (excepte Casa i Despeses)
            if (b.id !== 'casa' && b.id !== 'expenses' && b.children.length === 0 && b.spent === 0 && b.planned === 0 && b.limit === 0 && b.lastYear === 0) {
                return;
            }

            const blkKey = `blk:${b.id}`;
            const isOpen = Boolean(core.econExpanded[blkKey]);
            const pct = b.limit > 0 ? Math.round((b.spent / b.limit) * 100) : 0;
            const totalItems = b.children.reduce((acc, c) => acc + c.items.length, 0);
            const blockModeTag = b.limitMode === 'block'
                ? `<span class="econ-tag-pill">Límit per bloc</span>`
                : '';

            html += `
                <div class="econ-block-card ${isOpen ? 'is-open' : ''}">
                    <div class="econ-block-header" onclick="app.toggleEconNode('${blkKey}')">
                        <div class="econ-block-title-row">
                            <span class="econ-caret">${isOpen ? '▾' : '▸'}</span>
                            <span class="econ-block-title">${b.icon} ${core.escapeHtml(b.title)}</span>
                            ${blockModeTag}
                            <span class="econ-count-badge">${totalItems}</span>
                        </div>
                        <div class="econ-block-amount">
                            <b>${core.formatMoney(b.spent)}</b>
                            ${b.limit > 0 ? `<span class="econ-limit-sub">/ ${core.formatMoney(b.limit)} (${pct}%)</span>` : ''}
                        </div>
                    </div>
                    ${b.limit > 0 ? `
                        <div class="ratio-bar-bg" style="margin:6px 0 4px 0;">
                            <div class="ratio-bar-fill ${pct > 100 ? 'over' : ''}" style="width:${Math.min(100, pct)}%;"></div>
                        </div>
                    ` : ''}
                    <div class="ratio-details" style="margin-top:4px;">
                        ${core.buildDiffHtml(b.spent, b.lastYear)}
                        ${b.planned > 0 ? `<span class="econ-planned-tag">⏳ Previst: +${core.formatMoney(b.planned)}</span>` : ''}
                    </div>
            `;

            if (isOpen) {
                html += `<div class="econ-children-list">`;
                if (b.activeChildren.length === 0) {
                    html += `<div class="econ-empty-sub">Cap moviment registrat en aquest bloc.</div>`;
                } else {
                    b.activeChildren.forEach(c => {
                        const chKey = `ch:${c.id}`;
                        const chOpen = Boolean(core.econExpanded[chKey]);
                        const hasItems = c.items.length > 0;
                        const cPct = c.hasLimit && c.limit > 0 ? Math.round((c.spent / c.limit) * 100) : 0;
                        const safeChKey = chKey.replace(/'/g, "\\'");

                        html += `
                            <div class="econ-child-card ${chOpen ? 'is-open' : ''}">
                                <div class="econ-child-header ${hasItems ? 'clickable' : ''}" ${hasItems ? `onclick="app.toggleEconNode('${safeChKey}')"` : ''}>
                                    <div class="econ-child-left">
                                        <span class="econ-caret-sm">${hasItems ? (chOpen ? '▾' : '▸') : '·'}</span>
                                        <span class="econ-child-name">${core.escapeHtml(c.label)}</span>
                                        ${hasItems ? `<span class="econ-count-badge sm">${c.items.length}</span>` : ''}
                                    </div>
                                    <div class="econ-child-right">
                                        <b>${core.formatMoney(c.spent)}</b>
                                        ${c.hasLimit && c.limit > 0 ? `<span class="econ-limit-sub">/ ${core.formatMoney(c.limit)} (${cPct}%)</span>` : ''}
                                    </div>
                                </div>
                                ${c.hasLimit && c.limit > 0 ? `
                                    <div class="ratio-bar-bg slim">
                                        <div class="ratio-bar-fill ${cPct > 100 ? 'over' : ''}" style="width:${Math.min(100, cPct)}%;"></div>
                                    </div>
                                ` : ''}
                                <div class="econ-child-meta">
                                    ${c.hasLimit ? core.buildDiffHtml(c.spent, c.lastYear) : `<span class="econ-muted">Desglossament informatiu del bloc</span>`}
                                    ${c.planned > 0 ? `<span class="econ-planned-tag">⏳ +${core.formatMoney(c.planned)}</span>` : ''}
                                </div>
                        `;

                        if (chOpen && hasItems) {
                            const spentItems = c.items.filter(it => it.isSpent);
                            const plannedItems = c.items.filter(it => !it.isSpent);

                            html += `<div class="econ-items-list">`;
                            spentItems.forEach(it => { html += core.buildEconItemRowHtml(it); });
                            if (plannedItems.length > 0) {
                                html += `<div class="econ-items-divider">⏳ Previst / Idees (no suma a Gastat)</div>`;
                                plannedItems.forEach(it => { html += core.buildEconItemRowHtml(it); });
                            }
                            html += `</div>`;
                        }

                        html += `</div>`;
                    });
                }
                html += `</div>`;
            }

            html += `</div>`;
        });

        listCont.innerHTML = html;
    },

    buildEconItemRowHtml: (it) => {
        const safeId = String(it.id).replace(/'/g, "\\'");
        const splitTag = it.splitCount > 1
            ? `<span class="econ-split-pill" title="Import total: ${core.formatMoney(it.totalPrice)} repartit entre ${it.splitCount}">÷${it.splitCount}</span>`
            : '';
        const approxPrefix = it.isApprox ? '~' : '';
        const stateIcon = it.state === 'Embolicat' ? '🎁'
            : (it.state === 'El tenim' || it.state === 'Comprat' ? '✅'
            : (it.state === 'Comprat/Delivery' ? '🚚'
            : (it.state === 'Decidit' ? '🎯' : '💡')));

        return `
            <div class="econ-item-row ${it.isSpent ? '' : 'is-planned'}" onclick="app.openFromEconItem('${it.kind}', '${safeId}')">
                <div class="econ-item-main">
                    <span class="econ-item-title">${stateIcon} ${core.escapeHtml(it.title)}</span>
                    ${splitTag}
                </div>
                <div class="econ-item-price">${approxPrefix}${core.formatMoney(it.amount)}</div>
            </div>
        `;
    },

    renderEconInputsTab: (mode) => {
        const { blocks } = core.computeEconomicTree();
        const contId = mode === 'limits' ? 'budgetInputsContainer' : 'lastYearInputsContainer';
        const container = document.getElementById(contId);
        if (!container) return;

        const store = mode === 'limits' ? (core.data.budgets || {}) : (core.data.lastYear || {});
        const labelTitle = mode === 'limits' ? 'Total Límits Enguany' : 'Total Any Passat';

        let html = `
            <div class="econ-total-live-bar">
                <span>${labelTitle}:</span>
                <b id="econGrandTotal_${mode}">0,00 €</b>
            </div>
        `;

        blocks.forEach(b => {
            if (b.limitMode === 'children' && b.children.length === 0) return;

            if (b.limitMode === 'block') {
                const rawVal = core.getStoredEconVal(store, b.key, b.fallbacks || []);
                const displayVal = rawVal > 0 ? rawVal : '';
                const safeKey = core.escapeHtml(b.key);
                const hint = b.id === 'altres'
                    ? 'Amics, detalls puntuals o sense assignar'
                    : 'Import global del bloc (absorbeix amic invisible rotatiu)';

                html += `
                    <div class="econ-input-block">
                        <div class="econ-input-block-head is-single">
                            <div>
                                <div class="econ-input-block-title">${b.icon} ${core.escapeHtml(b.title)}</div>
                                <div class="cfg-hint">${hint}</div>
                            </div>
                            <input type="number" step="0.01" class="econ-num-input"
                                data-econ-mode="${mode}" data-econ-block="${b.id}" data-econ-key="${safeKey}"
                                value="${displayVal}" placeholder="0 €"
                                oninput="app.recalcEconInputSubtotals('${mode}')">
                        </div>
                    </div>
                `;
                return;
            }

            html += `
                <div class="econ-input-block">
                    <div class="econ-input-block-head">
                        <span class="econ-input-block-title">${b.icon} ${core.escapeHtml(b.title)}</span>
                        <span class="econ-input-subtotal" id="econSub_${mode}_${b.id}">0,00 €</span>
                    </div>
                    <div class="econ-input-rows">
            `;

            b.children.forEach(c => {
                const fallbacks = c.key.startsWith('exp:') ? [c.rawName] : [];
                const rawVal = core.getStoredEconVal(store, c.key, fallbacks);
                const displayVal = rawVal > 0 ? rawVal : '';
                const safeKey = core.escapeHtml(c.key);
                html += `
                    <div class="budget-row">
                        <span>${core.escapeHtml(c.label)}</span>
                        <input type="number" step="0.01" class="econ-num-input"
                            data-econ-mode="${mode}" data-econ-block="${b.id}" data-econ-key="${safeKey}"
                            value="${displayVal}" placeholder="0 €"
                            oninput="app.recalcEconInputSubtotals('${mode}')">
                    </div>
                `;
            });

            html += `</div></div>`;
        });

        container.innerHTML = html;
        core.recalcEconInputSubtotals(mode);
    },

    recalcEconInputSubtotals: (mode) => {
        const inputs = document.querySelectorAll(`input[data-econ-mode="${mode}"]`);
        const blockSums = {};
        let grandTotal = 0;

        inputs.forEach(inp => {
            const val = parseFloat(inp.value) || 0;
            const blk = inp.dataset.econBlock;
            blockSums[blk] = (blockSums[blk] || 0) + val;
            grandTotal += val;
        });

        Object.entries(blockSums).forEach(([blk, sum]) => {
            const el = document.getElementById(`econSub_${mode}_${blk}`);
            if (el) el.innerText = core.formatMoney(sum);
        });

        const totalEl = document.getElementById(`econGrandTotal_${mode}`);
        if (totalEl) totalEl.innerText = core.formatMoney(grandTotal);
    },

    saveBudgets: () => {
        const next = Object.assign({}, core.data.budgets || {});
        document.querySelectorAll('input[data-econ-mode="limits"]').forEach(inp => {
            const key = inp.dataset.econKey;
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val > 0) next[key] = Number(val.toFixed(2));
            else delete next[key];
        });
        core.data.budgets = next;
        core.saveLocal();
        core.updateHeaderBudgets();
        core.switchBudgetTab('ratios');
    },

    saveLastYear: () => {
        const next = Object.assign({}, core.data.lastYear || {});
        document.querySelectorAll('input[data-econ-mode="lastYear"]').forEach(inp => {
            const key = inp.dataset.econKey;
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val > 0) next[key] = Number(val.toFixed(2));
            else delete next[key];
        });
        core.data.lastYear = next;
        core.saveLocal();
        core.switchBudgetTab('ratios');
    },

    /* --- [5] FORMULARI DE REGALS / DESPESES (INCL. CATEGORIES ON-THE-FLY) --- */
    populateExpenseCatSelect: (selectedVal = '') => {
        const sel = document.getElementById('gExpenseCat');
        if (!sel) return;
        const cats = core.getExpenseCategories();
        sel.innerHTML = cats.map(c => `<option value="${core.escapeHtml(c)}">${core.escapeHtml(c)}</option>`).join('');
        if (selectedVal && cats.includes(selectedVal)) sel.value = selectedVal;
    },

    addCustomExpenseCategory: () => {
        const raw = prompt('Nom de la nova categoria de despesa (pots incloure un emoji al principi, ex: 🎀 Embolcalls):');
        if (!raw) return;
        const clean = raw.trim();
        if (!clean) return;

        if (!core.data.config) core.data.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        const current = core.getExpenseCategories();
        if (!current.includes(clean)) {
            current.push(clean);
            core.data.config.expenseCategories = current;
            core.saveLocal();
        }
        core.populateExpenseCatSelect(clean);
    },

    buildCheckboxGroups: (containerId, groups, checkedValues = []) => {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        const checkedSet = new Set(checkedValues);
        let html = '';

        Object.entries(groups).forEach(([groupTitle, members]) => {
            if (!members || members.length === 0) return;
            html += `<div class="multi-group-title">${core.escapeHtml(groupTitle)}</div>`;
            members.forEach(m => {
                const isChk = checkedSet.has(m) ? 'checked' : '';
                html += `
                    <label class="multi-item">
                        <input type="checkbox" value="${core.escapeHtml(m)}" ${isChk}>
                        <span>${core.escapeHtml(core.formatMemberLabel(m))}</span>
                    </label>
                `;
            });
        });
        cont.innerHTML = html;
    },

    populateGiftFormLists: (selectedRecips = [], selectedFroms = []) => {
        const cfg = core.getConfig();
        core.buildCheckboxGroups('gRecipientsContainer', {
            'Casa': cfg.casaMembers,
            [cfg.dir1Name]: cfg.dir1Members,
            [cfg.dir2Name]: cfg.dir2Members,
            [cfg.ext1Name]: cfg.ext1Members,
            [cfg.ext2Name]: cfg.ext2Members,
            'Especials': ['Amics/Altres', 'Tió', 'Reis Mags']
        }, selectedRecips);

        core.buildCheckboxGroups('gFromContainer', {
            'Casa i Tradició': ['Nosaltres', 'Tió', 'Pare Noel', 'Reis Mags'],
            'Unitats Familiars': [cfg.dir1Name, cfg.dir2Name, cfg.ext1Name, cfg.ext2Name].filter(Boolean),
            'Membres': [...cfg.dir1Members, ...cfg.dir2Members]
        }, selectedFroms);

        const evSel = document.getElementById('gEvent');
        if (evSel) {
            evSel.innerHTML = core.getOrderedEvents()
                .map(ev => `<option value="${core.escapeHtml(ev)}">${core.escapeHtml(ev)}</option>`)
                .join('');
        }

        const rSel = document.getElementById('gRound');
        if (rSel) {
            rSel.innerHTML = '<option value="">(Sense ronda)</option>' +
                cfg.rounds.map(r => `<option value="${core.escapeHtml(r)}">${core.escapeHtml(r)}</option>`).join('');
        }

        core.populateExpenseCatSelect();
    },

    setItemType: (type, defaultState = null) => {
        document.getElementById('gType').value = type;
        document.getElementById('typeBtnGift')?.classList.toggle('active', type === 'gift');
        document.getElementById('typeBtnExpense')?.classList.toggle('active-green', type === 'expense');
        document.getElementById('typeBtnExpense')?.classList.remove('active');

        const isExp = type === 'expense';
        document.getElementById('expenseFields')?.classList.toggle('hidden', !isExp);
        document.getElementById('giftOnlyFields')?.classList.toggle('hidden', isExp);
        document.getElementById('secretWrapper')?.classList.toggle('hidden', isExp);

        const titleLbl = document.getElementById('lblTitle');
        const titleInp = document.getElementById('gTitle');
        if (titleLbl) titleLbl.innerText = isExp ? 'Concepte de la despesa:' : 'Descripció (Què és?):';
        if (titleInp) titleInp.placeholder = isExp ? 'Ex: Paper d\'embolicar, Neules, Llums...' : 'Ex: Bicicleta vermella';

        core.populateStateSelect(type, defaultState);
        core.toggleDeliveryField();
    },

    populateStateSelect: (type, desiredState = null) => {
        const sel = document.getElementById('gState');
        if (!sel) return;
        const prev = desiredState || sel.value;

        let options = [];
        if (type === 'expense') {
            options = [
                { value: 'Idea', label: '💡 Idea / Pressupostat' },
                { value: 'Decidit', label: '🎯 Decidit (Pendent de pagar)' },
                { value: 'El tenim', label: '✅ Comprat / Pagat' }
            ];
        } else {
            const paidByUs = document.getElementById('gPaidByUs')?.checked !== false;
            options = paidByUs
                ? [
                    { value: 'Idea', label: '💡 Idea' },
                    { value: 'Decidit', label: '🎯 Decidit' },
                    { value: 'Comprat/Delivery', label: '🚚 Comprat/Delivery' },
                    { value: 'El tenim', label: '✅ El tenim' },
                    { value: 'Embolicat', label: '🎁 Embolicat' }
                ]
                : [
                    { value: 'Idea', label: '💡 Idea (per proposar)' },
                    { value: 'Confirmat', label: '🏡 Confirmat (ho porten ells)' }
                ];
        }

        sel.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        if (options.some(o => o.value === prev)) sel.value = prev;
        else sel.value = options[0].value;
    },

    onPaidByUsChange: () => {
        const paid = document.getElementById('gPaidByUs')?.checked !== false;
        const lbl = document.getElementById('paidByUsLabel');
        const txt = document.getElementById('paidByUsText');
        const priceLbl = document.getElementById('lblPrice');

        if (lbl) lbl.classList.toggle('is-other-house', !paid);
        if (txt) {
            txt.innerText = paid
                ? '💰 Ho paguem nosaltres (Anotar la nostra aportació)'
                : "🏡 Ho paga una altra casa (No suma al nostre pressupost)";
        }
        if (priceLbl) {
            priceLbl.innerText = paid
                ? 'Preu (€ — nostra part) i Tipus d\'Import:'
                : 'Preu orientatiu (€ — opcional, no suma al pressupost):';
        }
        core.populateStateSelect('gift', paid ? 'Idea' : 'Confirmat');
        core.toggleDeliveryField();
    },

    toggleRounds: () => {
        const cfg = core.getConfig();
        const ev = document.getElementById('gEvent')?.value || '';
        const show = ev === cfg.bigTioName && cfg.rounds.length > 0;
        document.getElementById('roundContainer')?.classList.toggle('hidden', !show);
    },

    toggleDeliveryField: () => {
        const isExp = document.getElementById('gType')?.value === 'expense';
        const paid = document.getElementById('gPaidByUs')?.checked !== false;
        const st = document.getElementById('gState')?.value || '';
        const show = !isExp && paid && (st === 'Comprat/Delivery' || st === 'Decidit' || st === 'El tenim');
        document.getElementById('deliveryDateContainer')?.classList.toggle('hidden', !show);
    },

    openModal: (id = null) => {
        core.isDuplicating = false;
        document.getElementById('dupBanner')?.classList.add('hidden');

        const g = id ? core.data.gifts.find(x => x.id === id) : null;
        const d = g ? core.resolveGiftDisplay(g) : null;

        document.getElementById('giftId').value = g ? g.id : '';
        document.getElementById('modalTitle').innerText = g ? 'Editar Element ✏️' : 'Nou Element 🎁';
        document.getElementById('btnDuplicate')?.classList.toggle('hidden', !g);
        document.getElementById('btnDelete')?.classList.toggle('hidden', !g);

        const recips = d ? d.recips : [];
        const froms = d ? d.froms : ['Nosaltres'];
        core.populateGiftFormLists(recips, froms);

        const type = g ? (g.type || 'gift') : 'gift';
        document.getElementById('gPaidByUs').checked = g ? (g.paidByUs !== false) : true;
        core.setItemType(type, g ? g.state : 'Idea');
        if (type === 'gift') core.onPaidByUsChange();
        if (g) document.getElementById('gState').value = g.state;

        document.getElementById('gTitle').value = d ? d.titleDisplay : '';
        if (type === 'expense') {
            core.populateExpenseCatSelect(g.expenseCat || DEFAULT_EXPENSE_CATEGORIES[0]);
        }
        document.getElementById('gEvent').value = (g && g.event) ? g.event : (type === 'expense' ? '✨ General Festes' : '🪵 Tió Casa');
        core.toggleRounds();
        if (g && g.round) document.getElementById('gRound').value = g.round;

        document.getElementById('gDeliveryDate').value = d ? d.deliveryDate : '';
        core.toggleDeliveryField();

        document.getElementById('gPrice').value = (d && d.priceVal > 0) ? d.priceVal : '';
        document.getElementById('gPriceType').value = (g && g.isApprox) ? 'approx' : 'definitive';
        document.getElementById('gUrl').value = d ? d.shopUrl : '';
        document.getElementById('gImage').value = d ? d.imgUrl : '';
        document.getElementById('gComments').value = d ? d.commentsDisplay : '';

        const secCont = document.getElementById('secretContainer');
        const secWarn = document.getElementById('secretWarning');
        const secChk = document.getElementById('gSecret');
        if (core.currentUser) {
            secCont.style.display = 'block';
            secWarn.style.display = 'none';
            secChk.checked = Boolean(g && g.isSecret);
        } else {
            secCont.style.display = 'none';
            secWarn.style.display = 'block';
            secChk.checked = false;
        }

        document.getElementById('giftModal').style.display = 'block';
    },

    openModalForTarget: (targetType, targetVal) => {
        core.openModal(null);
        const cfg = core.getConfig();
        let preselect = [];
        if (targetType === 'person' && targetVal) preselect = [targetVal];
        else if (targetType === 'casa4') preselect = [...cfg.casaMembers];

        if (preselect.length > 0) {
            document.querySelectorAll('#gRecipientsContainer input[type="checkbox"]').forEach(cb => {
                cb.checked = preselect.includes(cb.value);
            });
        }
    },

    saveGift: () => {
        const type = document.getElementById('gType').value || 'gift';
        const title = document.getElementById('gTitle').value.trim();
        if (!title) {
            alert('Escriu una descripció o concepte.');
            return;
        }

        const isExpense = type === 'expense';
        const isSecret = !isExpense && Boolean(core.currentUser) && document.getElementById('gSecret').checked;
        const paidByUs = isExpense ? true : document.getElementById('gPaidByUs').checked;

        const recips = isExpense
            ? []
            : Array.from(document.querySelectorAll('#gRecipientsContainer input:checked')).map(cb => cb.value);
        const froms = isExpense
            ? []
            : Array.from(document.querySelectorAll('#gFromContainer input:checked')).map(cb => cb.value);

        if (!isExpense && recips.length === 0) {
            alert('Marca almenys una persona a "Per a qui?".');
            return;
        }

        const cfg = core.getConfig();
        const ev = document.getElementById('gEvent').value;
        const roundVal = (ev === cfg.bigTioName) ? (document.getElementById('gRound').value || null) : null;
        const state = document.getElementById('gState').value;
        const deliveryDate = document.getElementById('gDeliveryDate').value || '';
        const priceRaw = document.getElementById('gPrice').value.trim();
        const isApprox = document.getElementById('gPriceType').value === 'approx';
        const urlRaw = document.getElementById('gUrl').value.trim();
        const imgRaw = document.getElementById('gImage').value.trim();
        const commRaw = document.getElementById('gComments').value.trim();

        const existingId = document.getElementById('giftId').value;
        const id = existingId || Date.now().toString();

        const obj = {
            id,
            type,
            expenseCat: isExpense ? document.getElementById('gExpenseCat').value : null,
            title: isSecret ? core.encryptSecret(title, core.currentPin) : title,
            price: isSecret ? (priceRaw ? core.encryptSecret(priceRaw, core.currentPin) : '') : priceRaw,
            isApprox,
            deliveryDate: isExpense ? '' : deliveryDate,
            url: isSecret ? (urlRaw ? core.encryptSecret(urlRaw, core.currentPin) : '') : urlRaw,
            image: isSecret ? (imgRaw ? core.encryptSecret(imgRaw, core.currentPin) : '') : imgRaw,
            comments: isSecret ? (commRaw ? core.encryptSecret(commRaw, core.currentPin) : '') : commRaw,
            isSecret,
            paidByUs,
            recipients: recips,
            froms,
            event: ev,
            round: roundVal,
            state,
            createdBy: isSecret ? core.currentUser : (existingId ? (core.data.gifts.find(x => x.id === existingId)?.createdBy || 'Familiar') : 'Familiar'),
            updatedAt: Date.now()
        };

        const idx = core.data.gifts.findIndex(x => x.id === id);
        if (idx > -1) core.data.gifts[idx] = obj;
        else core.data.gifts.unshift(obj);

        core.saveLocal();
        core.closeModal('giftModal');
        core.renderAll();
    },

    duplicateGift: () => {
        core.isDuplicating = true;
        document.getElementById('giftId').value = '';
        document.getElementById('modalTitle').innerText = 'Duplicar Element 📋';
        document.getElementById('dupBanner')?.classList.remove('hidden');
        document.getElementById('gState').value = 'Idea';
        document.getElementById('btnDuplicate')?.classList.add('hidden');
        document.getElementById('btnDelete')?.classList.add('hidden');
        core.toggleDeliveryField();
    },

    deleteGift: () => {
        const id = document.getElementById('giftId').value;
        if (!id || !confirm('Segur que vols eliminar aquest element?')) return;
        core.data.gifts = core.data.gifts.filter(x => x.id !== id);
        if (!core.data.deletedIds) core.data.deletedIds = [];
        if (!core.data.deletedIds.includes(id)) core.data.deletedIds.push(id);
        core.saveLocal();
        core.closeModal('giftModal');
        core.renderAll();
    },

    /* --- [6] SESSIÓ PIN (TOP SECRET), CONFIGURACIÓ I WHATSAPP --- */
    openUnlockModal: () => {
        const cfg = core.getConfig();
        const sel = document.getElementById('unlockUser');
        if (sel) {
            sel.innerHTML = cfg.parents.map(p => `<option value="${core.escapeHtml(p)}">${core.escapeHtml(p)}</option>`).join('');
        }
        document.getElementById('unlockPin').value = '';
        document.getElementById('unlockModal').style.display = 'block';
        setTimeout(() => document.getElementById('unlockPin')?.focus(), 80);
    },

    unlock: () => {
        const user = document.getElementById('unlockUser').value;
        const pin = document.getElementById('unlockPin').value.trim();
        if (!pin) {
            alert('Introdueix el teu PIN.');
            return;
        }
        if (!core.data.pins) core.data.pins = {};

        if (!core.data.pins[user]) {
            if (!confirm(`És la primera vegada que configures un PIN per a ${user}. Vols desar aquest PIN per xifrar els teus regals Top Secret?`)) return;
            core.data.pins[user] = core.encryptSecret('OK_' + user, pin);
            core.saveLocal();
        } else {
            const check = core.decryptSecret(core.data.pins[user], pin);
            if (check !== 'OK_' + user) {
                alert('PIN incorrecte.');
                return;
            }
        }

        core.currentUser = user;
        core.currentPin = pin;
        document.getElementById('userStatus').innerText = `🔓 ${user}`;
        document.getElementById('btnUnlock').classList.add('hidden');
        document.getElementById('btnLock').classList.remove('hidden');
        core.closeModal('unlockModal');
        core.renderAll();
    },

    lock: () => {
        core.currentUser = null;
        core.currentPin = null;
        document.getElementById('userStatus').innerText = '👨‍👩‍👧‍👧 Vista Familiar';
        document.getElementById('btnUnlock').classList.remove('hidden');
        document.getElementById('btnLock').classList.add('hidden');
        core.renderAll();
    },

    openConfigModal: (tab = 'github') => {
        document.getElementById('ghOwner').value = core.ghConfig.owner || '';
        document.getElementById('ghRepo').value = core.ghConfig.repo || '';
        document.getElementById('ghPath').value = core.ghConfig.path || 'dades.json';
        document.getElementById('ghToken').value = core.ghConfig.token || '';

        const cfg = core.getConfig();
        document.getElementById('cfgParents').value = cfg.parents.join(', ');
        document.getElementById('cfgCasa').value = cfg.casaMembers.join(', ');
        document.getElementById('cfgDir1Name').value = cfg.dir1Name;
        document.getElementById('cfgDir1Members').value = cfg.dir1Members.join(', ');
        document.getElementById('cfgDir2Name').value = cfg.dir2Name;
        document.getElementById('cfgDir2Members').value = cfg.dir2Members.join(', ');
        document.getElementById('cfgExt1Name').value = cfg.ext1Name;
        document.getElementById('cfgExt1Members').value = cfg.ext1Members.join(', ');
        document.getElementById('cfgExt2Name').value = cfg.ext2Name;
        document.getElementById('cfgExt2Members').value = cfg.ext2Members.join(', ');
        document.getElementById('cfgBigTioName').value = cfg.bigTioName;
        document.getElementById('cfgRounds').value = cfg.rounds.join(', ');

        const expCatsEl = document.getElementById('cfgExpenseCats');
        if (expCatsEl) expCatsEl.value = core.getExpenseCategories().join(', ');

        core.switchConfigTab(tab);
        document.getElementById('configModal').style.display = 'block';
    },

    switchConfigTab: (tab) => {
        document.getElementById('tabBtnCfgGithub')?.classList.toggle('active', tab === 'github');
        document.getElementById('tabBtnCfgFamily')?.classList.toggle('active', tab === 'family');
        document.getElementById('tabCfgGithub')?.classList.toggle('hidden', tab !== 'github');
        document.getElementById('tabCfgFamily')?.classList.toggle('hidden', tab !== 'family');
    },

    saveGithubConfig: async () => {
        core.ghConfig = {
            owner: document.getElementById('ghOwner').value.trim(),
            repo: document.getElementById('ghRepo').value.trim(),
            path: document.getElementById('ghPath').value.trim() || 'dades.json',
            token: document.getElementById('ghToken').value.trim()
        };
        core.persistGithubConfig();
        core.closeModal('configModal');
        if (core.hasGithubConfig()) {
            core.ghEtag = null;
            await core.syncFromGithub(false);
            core.startPolling();
        } else {
            core.updateCloudBadge('local');
        }
    },

    saveFamilyConfig: () => {
        const expCatsEl = document.getElementById('cfgExpenseCats');
        const expenseCategories = expCatsEl
            ? core.parseCommaList(expCatsEl.value)
            : core.getExpenseCategories();

        core.data.config = {
            parents: core.parseCommaList(document.getElementById('cfgParents').value),
            casaMembers: core.parseCommaList(document.getElementById('cfgCasa').value),
            dir1Name: document.getElementById('cfgDir1Name').value.trim() || DEFAULT_CONFIG.dir1Name,
            dir1Members: core.parseCommaList(document.getElementById('cfgDir1Members').value),
            dir2Name: document.getElementById('cfgDir2Name').value.trim() || DEFAULT_CONFIG.dir2Name,
            dir2Members: core.parseCommaList(document.getElementById('cfgDir2Members').value),
            ext1Name: document.getElementById('cfgExt1Name').value.trim() || DEFAULT_CONFIG.ext1Name,
            ext1Members: core.parseCommaList(document.getElementById('cfgExt1Members').value),
            ext2Name: document.getElementById('cfgExt2Name').value.trim() || DEFAULT_CONFIG.ext2Name,
            ext2Members: core.parseCommaList(document.getElementById('cfgExt2Members').value),
            bigTioName: document.getElementById('cfgBigTioName').value.trim() || DEFAULT_CONFIG.bigTioName,
            rounds: core.parseCommaList(document.getElementById('cfgRounds').value),
            expenseCategories: expenseCategories.length ? expenseCategories : [...DEFAULT_EXPENSE_CATEGORIES]
        };
        core.saveLocal();
        core.applyConfigToUI();
        core.closeModal('configModal');
        core.renderAll();
    },

    openShareModal: () => {
        const cfg = core.getConfig();
        core.buildCheckboxGroups('sharePeopleContainer', {
            'Casa': cfg.casaMembers,
            [cfg.dir1Name]: cfg.dir1Members,
            [cfg.dir2Name]: cfg.dir2Members,
            [cfg.ext1Name]: cfg.ext1Members,
            [cfg.ext2Name]: cfg.ext2Members
        }, core.getKidsList());

        document.querySelectorAll('#sharePeopleContainer input[type="checkbox"]').forEach(cb => {
            cb.onchange = () => core.generateShareText();
        });
        core.generateShareText();
        document.getElementById('shareModal').style.display = 'block';
    },

    selectSharePreset: (preset) => {
        const cfg = core.getConfig();
        const kids = core.getKidsList();
        document.querySelectorAll('#sharePeopleContainer input[type="checkbox"]').forEach(cb => {
            if (preset === 'kids') cb.checked = kids.includes(cb.value);
            else if (preset === 'casa') cb.checked = cfg.casaMembers.includes(cb.value);
            else cb.checked = false;
        });
        core.generateShareText();
    },

    generateShareText: () => {
        const selectedPeople = Array.from(document.querySelectorAll('#sharePeopleContainer input:checked')).map(cb => cb.value);
        const incIdeas = document.getElementById('shareIncIdeas')?.checked;
        const incOurs = document.getElementById('shareIncConfirmedOurs')?.checked;
        const incOthers = document.getElementById('shareIncConfirmedOthers')?.checked;
        const incPrice = document.getElementById('shareIncPrice')?.checked;
        const incUrl = document.getElementById('shareIncUrl')?.checked;
        const incComments = document.getElementById('shareIncComments')?.checked;
        const incEvent = document.getElementById('shareIncEvent')?.checked;

        const area = document.getElementById('shareTextArea');
        if (!area) return;
        if (selectedPeople.length === 0) {
            area.value = '';
            return;
        }

        const lines = ['🎄 *Llista de Regals de Nadal*'];
        let totalFound = 0;

        selectedPeople.forEach(person => {
            const matching = core.data.gifts.filter(g => {
                if ((g.type || 'gift') !== 'gift' || g.isSecret) return false;
                const d = core.resolveGiftDisplay(g);
                if (!d.recips.includes(person)) return false;

                if (g.state === 'Idea') return incIdeas;
                if (d.isOtherHouse || g.state === 'Confirmat') return incOthers;
                return incOurs;
            });

            if (matching.length === 0) return;
            totalFound += matching.length;
            lines.push(`\n👤 *${core.formatMemberLabel(person)}*`);

            matching.forEach(g => {
                const d = core.resolveGiftDisplay(g);
                let line = `• ${d.titleDisplay}`;
                if (incPrice && d.priceVal > 0) line += ` (${g.isApprox ? '~' : ''}${d.priceVal} €)`;
                if (incEvent && g.event) line += ` [${g.event}]`;
                if (d.isOtherHouse && d.froms.length > 0) line += ` — _${d.froms.join(', ')}_`;
                lines.push(line);
                if (incComments && d.commentsDisplay) lines.push(`  📝 ${d.commentsDisplay}`);
                if (incUrl && d.shopUrl) lines.push(`  🔗 ${d.shopUrl}`);
            });
        });

        area.value = totalFound > 0 ? lines.join('\n') : 'No hi ha cap regal que compleixi aquests filtres.';
    },

    copyShareText: () => {
        const text = document.getElementById('shareTextArea').value;
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('btnCopyShare');
                if (btn) {
                    const orig = btn.innerText;
                    btn.innerText = '✅ Copiat!';
                    setTimeout(() => { btn.innerText = orig; }, 1600);
                }
            });
        } else {
            document.getElementById('shareTextArea').select();
            document.execCommand('copy');
        }
    },

    exportData: () => {
        const blob = new Blob([JSON.stringify(core.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nadal-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData: (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!confirm('Això substituirà les dades locals actuals per les del fitxer importat. Continuar?')) return;
                core.data = imported;
                core.migrateExpenseCategories();
                core.saveLocal(true);
                core.applyConfigToUI();
                core.renderAll();
            } catch (err) {
                alert('El fitxer seleccionat no és un JSON vàlid.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    },

    /* --- [7] NAVEGACIÓ ENTRE PESTANYES, PWA, SMART-STICKY I ARRENCADA --- */
    toggleCloudDrawer: (forceState = null) => {
        const drawer = document.getElementById('cloudDrawer');
        if (!drawer) return;
        if (forceState === true) drawer.classList.remove('hidden');
        else if (forceState === false) drawer.classList.add('hidden');
        else drawer.classList.toggle('hidden');
    },

    closeModal: (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    },

    switchMainView: (view) => {
        core.activeMainView = view;
        const navMap = {
            list: 'navBtnList',
            board: 'navBtnBoard',
            advent: 'navBtnAdvent',
            santallucia: 'navBtnSantaLlucia'
        };

        Object.entries(core.views).forEach(([key, mod]) => {
            const sec = document.getElementById(mod.sectionId);
            if (sec) sec.classList.toggle('hidden', key !== view);
            document.getElementById(navMap[key])?.classList.toggle('active', key === view);
        });

        const wideViews = ['list', 'board', 'advent'];
        const mainCont = document.getElementById('mainContainer');
        mainCont.classList.toggle('wide-view', wideViews.includes(view));
        if (view !== 'list') mainCont.classList.remove('kanban-wide');

        const activeMod = core.views[view];
        const hideBtn = activeMod && typeof activeMod.hideFloatingBtn === 'function' ? activeMod.hideFloatingBtn() : false;
        document.getElementById('floatingAddBtn')?.classList.toggle('hidden', hideBtn);

        core.renderAll();
    },

    applyConfigToUI: () => {
        const cfg = core.getConfig();
        Object.values(core.views).forEach(mod => {
            if (typeof mod.onConfigChange === 'function') mod.onConfigChange(cfg);
        });
    },

    renderAll: () => {
        core.updateCountdown();
        core.updateHeaderBudgets();
        const activeMod = core.views[core.activeMainView];
        if (activeMod && typeof activeMod.render === 'function') activeMod.render();
    },

    updateCountdown: () => {
        const el = document.getElementById('xmasCountdown');
        if (!el) return;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const year = core.getChristmasYear();
        const xmas = new Date(year, 11, 25);
        const reis = new Date(year + 1, 0, 6);

        const diffXmas = Math.round((xmas - today) / 86400000);
        const diffReis = Math.round((reis - today) / 86400000);

        if (diffXmas > 0) el.innerText = `🎄 Faltan ${diffXmas} ${diffXmas === 1 ? 'dia' : 'dies'} per Nadal`;
        else if (diffXmas === 0) el.innerText = '🎄 Bon Nadal! ✨';
        else if (diffReis > 0) el.innerText = `👑 Falten ${diffReis} ${diffReis === 1 ? 'dia' : 'dies'} per Reis`;
        else if (diffReis === 0) el.innerText = '👑 Feliç Dia de Reis! ✨';
        else el.innerText = `🎄 Planificant Nadal ${year + 1}`;
    },

    generateAppleTouchIcon: () => {
        const link = document.getElementById('appleTouchIcon');
        if (!link) return;
        try {
            const c = document.createElement('canvas');
            c.width = 180;
            c.height = 180;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#b3000c';
            ctx.fillRect(0, 0, 180, 180);
            ctx.font = '112px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🎄', 90, 98);
            link.href = c.toDataURL('image/png');
        } catch (e) {}
    },

    setupUxInteractions: () => {
        // 1. Smart Sticky Header
        let lastY = window.scrollY;
        const header = document.getElementById('appHeader');
        window.addEventListener('scroll', () => {
            if (!header) return;
            const currY = window.scrollY;
            if (currY > 90 && currY > lastY + 8) header.classList.add('header-hidden');
            else if (currY < lastY - 8 || currY <= 40) header.classList.remove('header-hidden');
            lastY = currY;
        }, { passive: true });

        // 2. Swipe-down refresh al mòbil
        let touchStartY = 0;
        let pulling = false;
        const ind = document.getElementById('pullRefreshIndicator');

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0 && e.touches.length === 1) {
                touchStartY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!pulling || !ind) return;
            const delta = e.touches[0].clientY - touchStartY;
            if (delta > 55) {
                ind.classList.remove('hidden');
                ind.innerText = delta > 105 ? '🔄 Deixa anar per sincronitzar' : '⬇️ Estira avall per sincronitzar';
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (!pulling) return;
            pulling = false;
            const delta = (e.changedTouches[0]?.clientY || 0) - touchStartY;
            if (ind) ind.classList.add('hidden');
            if (delta > 105) core.manualSync();
        }, { passive: true });

        // 3. Tancar modals en clicar fora i dreceres de teclat
        window.addEventListener('click', (e) => {
            if (!e.target.classList.contains('modal')) return;
            if (e.target.id === 'adventModal' && core.views.advent) {
                core.views.advent.handleBackdrop();
            } else {
                core.closeModal(e.target.id);
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal').forEach(m => { m.style.display = 'none'; });
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (document.getElementById('giftModal')?.style.display === 'block') core.saveGift();
                else if (document.getElementById('adventModal')?.style.display === 'block' && core.views.advent) core.views.advent.saveModal();
            }
        });

        window.addEventListener('online', () => {
            if (localStorage.getItem('nadalPendingSync') === '1') core.syncFromGithub(false);
        });
    },

    init: async () => {
        core.generateAppleTouchIcon();
        const fromMagic = core.parseMagicLink();
        if (!fromMagic) core.loadGithubConfig();
        core.loadLocalData();

        Object.values(core.views).forEach(mod => {
            if (typeof mod.mount === 'function') mod.mount();
        });

        core.applyConfigToUI();
        core.setupUxInteractions();
        core.switchMainView('list');

        const lastEl = document.getElementById('lastSync');
        if (lastEl && core.data.lastUpdate) lastEl.innerText = core.data.lastUpdate;

        if (core.hasGithubConfig()) {
            await core.syncFromGithub(false);
            core.startPolling();
        } else {
            core.updateCloudBadge('local');
        }
    }
};

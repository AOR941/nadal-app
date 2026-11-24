/* ==========================================================================
 * NADAL TRACKER - JS/CORE.JS (Índex de blocs)
 * [1] Configuració per defecte i estat global
 * [2] Helpers d'esdeveniments, rondes, pressupostos i Base64/UTF-8
 * [3] Criptografia Top Secret (UTF-8 + fallback Latin-1)
 * [4] Migració de dades antigues i fusió en cas de conflicte
 * [5] Sincronització amb GitHub REST API i cua offline
 * [6] Inici, persistència local i configuració (Núvol / Família)
 * [7] Navegació entre vistes, modals, teclat i swipe-down refresh
 * [8] Càlcul econòmic, pressupostos, any passat i compartir WhatsApp
 * [9] Formulari de regals/despeses (deliveryDate + regals conjunts)
 * ========================================================================== */

/* --- [1] CONFIGURACIÓ PER DEFECTE I ESTAT GLOBAL --- */
export const DEFAULT_FAMILY_CONFIG = {
    parents: ["Mare", "Pare"],
    casaMembers: ["Fill/a 1", "Fill/a 2", "Mare", "Pare"],
    dir1Name: "Família 1",
    dir1Members: ["Avi 1", "Àvia 1"],
    dir2Name: "Família 2",
    dir2Members: ["Avi 2", "Àvia 2"],
    ext1Name: "Família Extensa 1",
    ext1Members: ["Tiet/a 1"],
    ext2Name: "Família Extensa 2",
    ext2Members: ["Tiet/a 2"],
    bigTioName: "🪵 Tió Família",
    rounds: ["Ronda 1", "Ronda 2"]
};

export const ALL_MODAL_IDS = ['giftModal', 'budgetsModal', 'configModal', 'shareModal', 'unlockModal', 'adventModal'];

export const EVENT_CHRONOLOGICAL_ORDER = [
    "🎄 Tió Casa",
    "🪵 Tió Família",
    "🎅 Pare Noel",
    "👑 Reis",
    "✨ General Festes",
    "❓ Per decidir"
];

export const STATE_PROGRESS_ORDER = [
    "Idea",
    "Decidit",
    "Comprat/Delivery",
    "El tenim",
    "Embolicat",
    "Confirmat"
];

export const core = {
    data: {
        gifts: [],
        deletedIds: [],
        advent: {},
        adventPool: [],
        budgets: {},
        lastYear: {},
        pins: {},
        config: null,
        lastUpdate: 'Mai'
    },
    ghConfig: { owner: '', repo: 'nadal-dades', path: 'dades.json', token: '' },
    ghSha: null,
    ghEtag: null,
    isSyncing: false,
    queuedPush: false,
    pollTimer: null,

    currentUser: null,
    pin: null,
    activeMainView: 'list',
    activeBudgetTab: 'ratios',
    activeConfigTab: 'github',

    // Referència als controladors de pestanyes (registrats a main.js)
    views: {},

    allGiftStates: [
        { value: 'Idea', label: '💡 Idea' },
        { value: 'Decidit', label: '🎯 Decidit' },
        { value: 'Comprat/Delivery', label: '🚚 Comprat/Delivery' },
        { value: 'El tenim', label: '✅ El tenim' },
        { value: 'Embolicat', label: '🎀 Embolicat' },
        { value: 'Confirmat', label: '🤝 Confirmat' }
    ],

    expenseCategories: [
        "🍲 Dinar de Santa Llúcia",
        "🗓️ Calendari d'Advent",
        "🍽️ Àpats i Begudes",
        "✨ Decoració i Arbre",
        "🪵 Tradicions (Tió, Reis, Pessebre)",
        "✉️ Postals de Nadal",
        "🎉 Altres despeses nadalenques"
    ],

    /* --- [2] HELPERS D'ESDEVENIMENTS, RONDES, PRESSUPOSTOS I BASE64/UTF-8 --- */
    getConfig: () => Object.assign({}, DEFAULT_FAMILY_CONFIG, core.data.config || {}),

    getKidsList: () => {
        const cfg = core.getConfig();
        return cfg.casaMembers.filter(m => !cfg.parents.includes(m));
    },

    getChristmasYear: () => {
        const now = new Date();
        return (now.getMonth() === 0 && now.getDate() <= 6) ? now.getFullYear() - 1 : now.getFullYear();
    },

    getOrderedEvents: () => {
        const cfg = core.getConfig();
        return [
            "🎄 Tió Casa",
            cfg.bigTioName,
            "🎅 Pare Noel",
            "👑 Reis",
            "✨ General Festes",
            "❓ Per decidir"
        ];
    },

    getEventRank: (evName) => {
        const cfg = core.getConfig();
        const val = evName || '❓ Per decidir';
        if (val === '🎄 Tió Casa') return 1;
        if (val === cfg.bigTioName || val.startsWith('🪵 ')) return 2;
        if (val === '🎅 Pare Noel') return 3;
        if (val === '👑 Reis') return 4;
        if (val === '✨ General Festes') return 5;
        if (val === '❓ Per decidir') return 6;
        return 5;
    },

    getStateRank: (st) => {
        const idx = STATE_PROGRESS_ORDER.indexOf(st);
        return idx === -1 ? 99 : idx;
    },

    getBudgetCategories: () => {
        const cfg = core.getConfig();
        const extLabel = `Família Extensa (${cfg.ext1Name} / ${cfg.ext2Name})`;
        return [
            ...cfg.casaMembers,
            cfg.dir1Name,
            cfg.dir2Name,
            extLabel,
            "Altres / Amics",
            "🎄 Altres Despeses (Àpats, Deco...)"
        ];
    },

    getEventShortBadges: () => {
        const cfg = core.getConfig();
        const bigTioIcon = (cfg.bigTioName || "🪵 Tió Família").split(' ')[0];
        return [
            { name: "🎄 Tió Casa", icon: "🎄" },
            { name: cfg.bigTioName, icon: bigTioIcon },
            { name: "🎅 Pare Noel", icon: "🎅" },
            { name: "👑 Reis", icon: "👑" },
            { name: "❓ Per decidir", icon: "❓" }
        ];
    },

    getHouseholdUnitKey: (person) => {
        const cfg = core.getConfig();
        if (cfg.casaMembers.includes(person)) return 'casa';
        if (cfg.dir1Members.includes(person)) return `dir1:${cfg.dir1Name}`;
        if (cfg.dir2Members.includes(person)) return `dir2:${cfg.dir2Name}`;
        if (cfg.ext1Members.includes(person)) return `ext1:${cfg.ext1Name}`;
        if (cfg.ext2Members.includes(person)) return `ext2:${cfg.ext2Name}`;
        return `other:${person}`;
    },

    // Retorna les persones d'altres unitats familiars quan el regal és compartit amb casa
    getJointContributors: (froms, isPaidByUs) => {
        const cfg = core.getConfig();
        const list = Array.isArray(froms) ? froms : [];
        if (list.length <= 1) return [];
        const hasCasaGiver = isPaidByUs || list.some(p => cfg.casaMembers.includes(p));
        if (!hasCasaGiver) return [];
        return list.filter(p => !cfg.casaMembers.includes(p));
    },

    ghEncodeBase64: (str) => {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    },

    ghDecodeBase64: (b64) => {
        const clean = b64.replace(/\s/g, '');
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    },

    /* --- [3] CRIPTOGRAFIA TOP SECRET (UTF-8 + FALLBACK LATIN-1) --- */
    crypt: (text, key) => {
        if (!text) return '';
        const encoder = new TextEncoder();
        const textBytes = encoder.encode(text);
        const keyBytes = encoder.encode(key);
        let bin = '';
        for (let i = 0; i < textBytes.length; i++) {
            bin += String.fromCharCode(textBytes[i] ^ keyBytes[i % keyBytes.length]);
        }
        return btoa(bin);
    },

    decrypt: (base64, key) => {
        if (!base64) return '';
        try {
            const raw = atob(base64);
            const cipherBytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) cipherBytes[i] = raw.charCodeAt(i);
            const keyBytes = new TextEncoder().encode(key);
            const plainBytes = new Uint8Array(cipherBytes.length);
            for (let i = 0; i < cipherBytes.length; i++) {
                plainBytes[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
            }
            try {
                return new TextDecoder('utf-8', { fatal: true }).decode(plainBytes);
            } catch (utf8Err) {
                let res = '';
                for (let i = 0; i < raw.length; i++) {
                    res += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                }
                return res;
            }
        } catch (e) { return ''; }
    },

    /* --- [4] MIGRACIÓ DE DADES ANTIGUES I FUSIÓ EN CAS DE CONFLICTE --- */
    inferConfigFromLegacyData: (imported) => {
        const cfg = JSON.parse(JSON.stringify(DEFAULT_FAMILY_CONFIG));
        const pinUsers = Object.keys(imported.pins || {});
        if (pinUsers.length >= 2) cfg.parents = pinUsers.slice(0, 2);

        const budgetKeys = Object.keys(imported.budgets || {});
        const knownCasa = budgetKeys.filter(k => !k.startsWith('Família') && !k.startsWith('Altres') && !k.startsWith('🎄'));
        if (knownCasa.length >= 2) cfg.casaMembers = knownCasa;

        const foundRounds = new Set();
        let foundBigTio = null;
        const allPeople = new Set();

        (imported.gifts || []).forEach(g => {
            if (g.round) foundRounds.add(g.round);
            if (g.event && g.event.startsWith('🪵 ')) foundBigTio = g.event;
            (g.recipients || []).forEach(p => {
                if (!['Tió', 'Reis Mags', 'Amics/Altres'].includes(p)) allPeople.add(p);
            });
        });

        if (foundBigTio) cfg.bigTioName = foundBigTio;
        if (foundRounds.size > 0) cfg.rounds = Array.from(foundRounds);

        const others = Array.from(allPeople).filter(p => !cfg.casaMembers.includes(p));
        if (others.length > 0) {
            const mid = Math.ceil(others.length / 2);
            cfg.dir1Name = "Família 1";
            cfg.dir1Members = others.slice(0, mid);
            cfg.dir2Name = "Família 2";
            cfg.dir2Members = others.slice(mid);
        }
        return cfg;
    },

    mapPersonToBudgetCat: (person) => {
        const cfg = core.getConfig();
        if (cfg.casaMembers.includes(person)) return person;
        if (cfg.dir1Members.includes(person)) return cfg.dir1Name;
        if (cfg.dir2Members.includes(person)) return cfg.dir2Name;
        if (cfg.ext1Members.includes(person) || cfg.ext2Members.includes(person)) {
            return `Família Extensa (${cfg.ext1Name} / ${cfg.ext2Name})`;
        }
        return "Altres / Amics";
    },

    mergeDataObjects: (remote, local, preferLocalBudgets = false) => {
        const mergedDeleted = new Set([...(remote.deletedIds || []), ...(local.deletedIds || [])]);
        const giftsMap = new Map();

        (remote.gifts || []).forEach(g => {
            if (!mergedDeleted.has(g.id)) giftsMap.set(g.id, g);
        });
        (local.gifts || []).forEach(g => {
            if (mergedDeleted.has(g.id)) return;
            const existing = giftsMap.get(g.id);
            if (!existing || (g.updatedAt || 0) >= (existing.updatedAt || 0)) {
                giftsMap.set(g.id, g);
            }
        });

        const mergedAdvent = {};
        const remoteAdv = remote.advent || {};
        const localAdv = local.advent || {};
        for (let d = 1; d <= 24; d++) {
            const key = String(d);
            const rItem = remoteAdv[key];
            const lItem = localAdv[key];
            if (rItem && lItem) {
                mergedAdvent[key] = (lItem.updatedAt || 0) >= (rItem.updatedAt || 0) ? lItem : rItem;
            } else if (lItem) {
                mergedAdvent[key] = lItem;
            } else if (rItem) {
                mergedAdvent[key] = rItem;
            }
        }

        const poolMap = new Map();
        (remote.adventPool || []).forEach(item => {
            if (item && item.id && !mergedDeleted.has(item.id)) poolMap.set(item.id, item);
        });
        (local.adventPool || []).forEach(item => {
            if (!item || !item.id || mergedDeleted.has(item.id)) return;
            const existing = poolMap.get(item.id);
            if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
                poolMap.set(item.id, item);
            }
        });

        return {
            gifts: Array.from(giftsMap.values()),
            deletedIds: Array.from(mergedDeleted),
            advent: mergedAdvent,
            adventPool: Array.from(poolMap.values()),
            budgets: preferLocalBudgets ? Object.assign({}, local.budgets || {}) : Object.assign({}, remote.budgets || {}, local.budgets || {}),
            lastYear: preferLocalBudgets ? Object.assign({}, local.lastYear || {}) : Object.assign({}, remote.lastYear || {}, local.lastYear || {}),
            pins: Object.assign({}, remote.pins || {}, local.pins || {}),
            config: local.config || remote.config || null,
            lastUpdate: new Date().toLocaleString('ca-ES')
        };
    },

    /* --- [5] SINCRONITZACIÓ AMB GITHUB REST API I CUA OFFLINE --- */
    isGithubConfigured: () => Boolean(core.ghConfig.owner && core.ghConfig.repo && core.ghConfig.token),

    setCloudStatus: (state, text) => {
        const icons = { local: '⚪', syncing: '🟡', ok: '🟢', error: '🔴' };
        const shortLabels = { local: 'Local', syncing: 'Sincro...', ok: 'Núvol', error: 'Error' };
        const icon = icons[state] || '⚪';

        const badge = document.getElementById('cloudStatusBadge');
        if (badge) badge.innerText = `${icon} ${text}`;

        const dot = document.getElementById('cloudStatusDot');
        const shortEl = document.getElementById('cloudStatusShort');
        if (dot) dot.innerText = icon;
        if (shortEl) shortEl.innerText = shortLabels[state] || 'Local';
    },

    persistGithubConfig: () => {
        const jsonStr = JSON.stringify(core.ghConfig);
        try { localStorage.setItem('nadalGithubConfig', jsonStr); } catch (e) {}
        const encoded = encodeURIComponent(core.ghEncodeBase64(jsonStr));
        document.cookie = `nadalGhCfg=${encoded}; max-age=31536000; path=/; SameSite=Lax`;
    },

    loadGithubConfig: () => {
        const hash = window.location.hash || '';
        if (hash.startsWith('#setup=')) {
            try {
                const b64 = decodeURIComponent(hash.slice(7));
                const parsed = JSON.parse(core.ghDecodeBase64(b64));
                if (parsed && parsed.owner && parsed.token) {
                    core.ghConfig = Object.assign({}, core.ghConfig, parsed);
                    core.persistGithubConfig();
                    history.replaceState(null, '', window.location.pathname);
                    return;
                }
            } catch (e) {}
        }

        const raw = localStorage.getItem('nadalGithubConfig');
        if (raw) {
            try {
                core.ghConfig = Object.assign({}, core.ghConfig, JSON.parse(raw));
                return;
            } catch (e) {}
        }

        const cookieMatch = document.cookie.match(/(?:^|;\s*)nadalGhCfg=([^;]+)/);
        if (cookieMatch) {
            try {
                const parsed = JSON.parse(core.ghDecodeBase64(decodeURIComponent(cookieMatch[1])));
                if (parsed && parsed.owner && parsed.token) {
                    core.ghConfig = Object.assign({}, core.ghConfig, parsed);
                    try { localStorage.setItem('nadalGithubConfig', JSON.stringify(core.ghConfig)); } catch (e) {}
                }
            } catch (e) {}
        }
    },

    copyMagicLink: () => {
        const cfg = {
            owner: document.getElementById('ghOwner').value.trim() || core.ghConfig.owner,
            repo: document.getElementById('ghRepo').value.trim() || core.ghConfig.repo || 'nadal-dades',
            path: document.getElementById('ghPath').value.trim() || core.ghConfig.path || 'dades.json',
            token: document.getElementById('ghToken').value.trim() || core.ghConfig.token
        };
        if (!cfg.owner || !cfg.token) {
            return alert("Primer escriu l'usuari i el Token de GitHub!");
        }
        const baseUrl = window.location.origin + window.location.pathname;
        const payload = encodeURIComponent(core.ghEncodeBase64(JSON.stringify(cfg)));
        const magicUrl = `${baseUrl}#setup=${payload}`;

        const btn = document.getElementById('btnMagicLink');
        const markDone = () => {
            btn.innerText = '✅ Enllaç Màgic copiat!';
            setTimeout(() => { btn.innerText = '🔗 Copiar Enllaç Màgic (per al mòbil)'; }, 2500);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(magicUrl).then(markDone).catch(() => prompt("Copia aquest enllaç màgic:", magicUrl));
        } else {
            prompt("Copia aquest enllaç màgic:", magicUrl);
        }
    },

    getGithubApiUrl: () => {
        const owner = encodeURIComponent(core.ghConfig.owner.trim());
        const repo = encodeURIComponent(core.ghConfig.repo.trim());
        const path = core.ghConfig.path.trim().split('/').map(encodeURIComponent).join('/');
        return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    },

    pullFromGithub: async (silent = false) => {
        if (!core.isGithubConfigured() || core.isSyncing) return false;
        core.isSyncing = true;
        if (!silent) core.setCloudStatus('syncing', 'Sincronitzant amb GitHub...');

        const finishPull = (ok) => {
            core.isSyncing = false;
            const hasPending = (localStorage.getItem('nadalPendingSync') === '1');
            if (core.queuedPush || (ok && hasPending)) {
                core.queuedPush = false;
                core.pushToGithub();
            }
            return ok;
        };

        try {
            const headers = {
                'Authorization': `Bearer ${core.ghConfig.token.trim()}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            };
            if (core.ghEtag && silent) headers['If-None-Match'] = core.ghEtag;

            const res = await fetch(core.getGithubApiUrl(), { method: 'GET', headers, cache: 'no-store' });

            if (res.status === 304) {
                const nowTime = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                core.setCloudStatus('ok', `Connectat (${nowTime})`);
                return finishPull(true);
            }

            if (res.status === 404) {
                core.ghSha = null;
                core.setCloudStatus('ok', 'Núvol connectat (arxiu nou)');
                return finishPull(true);
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const newEtag = res.headers.get('ETag');
            if (newEtag) core.ghEtag = newEtag;

            const payload = await res.json();
            const remoteChanged = (payload.sha !== core.ghSha);
            core.ghSha = payload.sha;
            const hasPendingSync = (localStorage.getItem('nadalPendingSync') === '1');

            if (payload.content && (remoteChanged || hasPendingSync)) {
                const decodedStr = core.ghDecodeBase64(payload.content);
                const remoteData = JSON.parse(decodedStr);
                if (hasPendingSync) {
                    core.data = core.mergeDataObjects(remoteData, core.data, true);
                } else {
                    core.data = Object.assign({ gifts: [], deletedIds: [], advent: {}, adventPool: [], budgets: {}, lastYear: {}, pins: {}, config: null }, remoteData);
                }
                localStorage.setItem('nadalData', JSON.stringify(core.data));
                document.getElementById('lastSync').innerText = core.data.lastUpdate || 'Ara';
                core.buildDynamicUI();
                core.renderAll();
            }

            const nowTime = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            core.setCloudStatus('ok', `Sincronitzat (${nowTime})`);
            return finishPull(true);
        } catch (err) {
            core.setCloudStatus('error', `Error núvol (${err.message})`);
            return finishPull(false);
        }
    },

    pushToGithub: async (retryCount = 0) => {
        if (!core.isGithubConfigured()) return;
        if (core.isSyncing) {
            core.queuedPush = true;
            return;
        }
        core.isSyncing = true;
        core.queuedPush = false;
        core.setCloudStatus('syncing', 'Guardant al núvol...');

        try {
            const jsonStr = JSON.stringify(core.data, null, 2);
            const body = {
                message: `Actualització Nadal Tracker (${core.data.lastUpdate})`,
                content: core.ghEncodeBase64(jsonStr)
            };
            if (core.ghSha) body.sha = core.ghSha;

            const res = await fetch(core.getGithubApiUrl(), {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${core.ghConfig.token.trim()}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: JSON.stringify(body)
            });

            if ((res.status === 409 || res.status === 422) && retryCount < 2) {
                const getRes = await fetch(core.getGithubApiUrl(), {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${core.ghConfig.token.trim()}`,
                        'Accept': 'application/vnd.github+json'
                    },
                    cache: 'no-store'
                });
                if (getRes.ok) {
                    const remotePayload = await getRes.json();
                    core.ghSha = remotePayload.sha;
                    const remoteData = JSON.parse(core.ghDecodeBase64(remotePayload.content));
                    core.data = core.mergeDataObjects(remoteData, core.data, true);
                    localStorage.setItem('nadalData', JSON.stringify(core.data));
                    core.isSyncing = false;
                    return core.pushToGithub(retryCount + 1);
                }
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const result = await res.json();
            if (result.content && result.content.sha) {
                core.ghSha = result.content.sha;
                core.ghEtag = null;
            }

            const nowTime = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            core.setCloudStatus('ok', `Guardat al núvol (${nowTime})`);
            core.isSyncing = false;

            if (core.queuedPush) {
                core.queuedPush = false;
                core.pushToGithub();
            } else {
                try { localStorage.removeItem('nadalPendingSync'); } catch (e) {}
            }
        } catch (err) {
            core.setCloudStatus('error', `Error guardant (${err.message}) — Desat en local`);
            core.isSyncing = false;
            if (core.queuedPush) {
                core.queuedPush = false;
                core.pushToGithub();
            }
        }
    },

    manualSync: async () => {
        if (!core.isGithubConfigured()) {
            core.openConfigModal('github');
            return;
        }
        await core.pullFromGithub(false);
    },

    startPolling: () => {
        if (core.pollTimer) clearInterval(core.pollTimer);
        core.pollTimer = setInterval(() => {
            if (!core.isGithubConfigured() || document.hidden) return;
            const anyModalOpen = ALL_MODAL_IDS.some(id => document.getElementById(id).style.display === 'block');
            if (!anyModalOpen) core.pullFromGithub(true);
        }, 15000);
    },

    /* --- [6] INICI, PERSISTÈNCIA LOCAL I CONFIGURACIÓ (NÚVOL / FAMÍLIA) --- */
    init: async () => {
        core.loadGithubConfig();
        const saved = localStorage.getItem('nadalData');
        if (saved) {
            core.data = Object.assign({ gifts: [], deletedIds: [], advent: {}, adventPool: [], budgets: {}, lastYear: {}, pins: {}, config: null }, JSON.parse(saved));
            document.getElementById('lastSync').innerText = core.data.lastUpdate || 'Mai';
        }

        // Inicialitza les pestanyes registrades
        for (const v of Object.values(core.views)) {
            if (typeof v.mount === 'function') v.mount();
        }

        core.buildDynamicUI();
        core.setupSmartHeader();
        core.setupPullToRefresh();
        core.setupModalBackdropClicks();
        core.setupKeyboardShortcuts();
        core.renderCountdown();
        core.generatePngIcons();
        core.renderAll();

        if (core.isGithubConfigured()) {
            await core.pullFromGithub(false);
            core.startPolling();
        } else {
            core.setCloudStatus('local', 'Mode Local (Núvol no configurat)');
        }
    },

    saveLocal: () => {
        core.data.lastUpdate = new Date().toLocaleString('ca-ES');
        localStorage.setItem('nadalData', JSON.stringify(core.data));
        document.getElementById('lastSync').innerText = core.data.lastUpdate;
        if (core.isGithubConfigured()) {
            try { localStorage.setItem('nadalPendingSync', '1'); } catch (e) {}
            core.pushToGithub();
        }
    },

    buildDynamicUI: () => {
        const cfg = core.getConfig();

        const unlockSel = document.getElementById('unlockUser');
        const prevUser = unlockSel.value;
        unlockSel.innerHTML = '';
        cfg.parents.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.innerText = p;
            unlockSel.appendChild(opt);
        });
        if (cfg.parents.includes(prevUser)) unlockSel.value = prevUser;

        const events = core.getOrderedEvents();
        const gEv = document.getElementById('gEvent');
        const prevGEv = gEv.value;
        gEv.innerHTML = '';
        events.forEach(ev => {
            gEv.innerHTML += `<option value="${ev}">${ev}</option>`;
        });
        if (prevGEv && events.includes(prevGEv)) gEv.value = prevGEv;

        const gRound = document.getElementById('gRound');
        const prevRound = gRound.value;
        gRound.innerHTML = '';
        cfg.rounds.forEach(r => {
            gRound.innerHTML += `<option value="${r}">${r}</option>`;
        });
        if (prevRound && cfg.rounds.includes(prevRound)) gRound.value = prevRound;

        const kids = core.getKidsList();
        document.getElementById('presetKidsBtn').innerText = kids.length > 0 ? `👧👦 ${kids.join(' i ')}` : '👧👦 Fills';

        const tree = {
            "Casa": cfg.casaMembers,
            [cfg.dir1Name]: cfg.dir1Members,
            [cfg.dir2Name]: cfg.dir2Members,
            [cfg.ext1Name]: cfg.ext1Members,
            [cfg.ext2Name]: cfg.ext2Members,
            "Especials": ["Tió", "Reis Mags", "Amics/Altres"]
        };

        const recipsBox = document.getElementById('gRecipientsContainer');
        const fromsBox = document.getElementById('gFromContainer');
        const shareBox = document.getElementById('sharePeopleContainer');
        const expSelect = document.getElementById('gExpenseCat');

        recipsBox.innerHTML = '';
        fromsBox.innerHTML = '';
        shareBox.innerHTML = '';
        expSelect.innerHTML = '';

        core.expenseCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat; opt.innerText = cat;
            expSelect.appendChild(opt);
        });

        Object.entries(tree).forEach(([group, members]) => {
            if (!members || members.length === 0) return;
            recipsBox.innerHTML += `<div class="multi-group-title">${group}</div>`;
            fromsBox.innerHTML += `<div class="multi-group-title">${group}</div>`;
            if (group !== "Especials") shareBox.innerHTML += `<div class="multi-group-title">${group}</div>`;

            members.forEach(m => {
                const htmlItem = (nameAttr, onChg = '') => `
                    <label class="multi-item">
                        <input type="checkbox" name="${nameAttr}" value="${m}" ${onChg}>
                        <span>${m}</span>
                    </label>`;
                recipsBox.innerHTML += htmlItem('gRecipCheck');
                fromsBox.innerHTML += htmlItem('gFromCheck');
                if (group !== "Especials") shareBox.innerHTML += htmlItem('sharePersonCheck', 'onchange="app.generateShareText()"');
            });
        });

        for (const v of Object.values(core.views)) {
            if (typeof v.onConfigChange === 'function') v.onConfigChange(cfg);
        }
    },

    openConfigModal: (defaultTab = 'github') => {
        document.getElementById('ghOwner').value = core.ghConfig.owner || '';
        document.getElementById('ghRepo').value = core.ghConfig.repo || 'nadal-dades';
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

        core.switchConfigTab(defaultTab);
        document.getElementById('configModal').style.display = 'block';
    },

    switchConfigTab: (tabName) => {
        core.activeConfigTab = tabName;
        ['Github', 'Family'].forEach(t => {
            const lower = t.toLowerCase();
            document.getElementById('tabCfg' + t).classList.toggle('hidden', lower !== tabName);
            document.getElementById('tabBtnCfg' + t).classList.toggle('active', lower === tabName);
        });
    },

    saveGithubConfig: async () => {
        core.ghConfig = {
            owner: document.getElementById('ghOwner').value.trim(),
            repo: document.getElementById('ghRepo').value.trim() || 'nadal-dades',
            path: document.getElementById('ghPath').value.trim() || 'dades.json',
            token: document.getElementById('ghToken').value.trim()
        };
        core.persistGithubConfig();
        if (window.location.hash.startsWith('#setup=')) {
            history.replaceState(null, '', window.location.pathname);
        }
        core.ghSha = null;
        core.ghEtag = null;
        core.closeModal('configModal');

        if (core.isGithubConfigured()) {
            const ok = await core.pullFromGithub(false);
            const hasLocalContent = core.data.gifts.length > 0 || Object.keys(core.data.advent || {}).length > 0 || (core.data.adventPool || []).length > 0;
            if (ok && core.ghSha === null && hasLocalContent) await core.pushToGithub();
            core.startPolling();
        } else {
            core.setCloudStatus('local', 'Mode Local (Núvol no configurat)');
        }
    },

    saveFamilyConfig: () => {
        const splitClean = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
        const parents = splitClean(document.getElementById('cfgParents').value);
        const casa = splitClean(document.getElementById('cfgCasa').value);

        if (parents.length === 0 || casa.length === 0) {
            return alert("Cal posar almenys un usuari amb PIN i els membres de casa.");
        }

        core.data.config = {
            parents,
            casaMembers: casa,
            dir1Name: document.getElementById('cfgDir1Name').value.trim() || 'Família 1',
            dir1Members: splitClean(document.getElementById('cfgDir1Members').value),
            dir2Name: document.getElementById('cfgDir2Name').value.trim() || 'Família 2',
            dir2Members: splitClean(document.getElementById('cfgDir2Members').value),
            ext1Name: document.getElementById('cfgExt1Name').value.trim() || 'Família Extensa 1',
            ext1Members: splitClean(document.getElementById('cfgExt1Members').value),
            ext2Name: document.getElementById('cfgExt2Name').value.trim() || 'Família Extensa 2',
            ext2Members: splitClean(document.getElementById('cfgExt2Members').value),
            bigTioName: document.getElementById('cfgBigTioName').value.trim() || '🪵 Tió Família',
            rounds: splitClean(document.getElementById('cfgRounds').value)
        };

        core.buildDynamicUI();
        core.saveLocal();
        core.closeModal('configModal');
        core.renderAll();
    },

    exportData: () => {
        const str = JSON.stringify(core.data, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `nadal_regals_${Date.now()}.json`; a.click();
    },

    importData: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (!imported.budgets) imported.budgets = {};
                if (!imported.lastYear) imported.lastYear = {};
                if (!imported.pins) imported.pins = {};
                if (!imported.deletedIds) imported.deletedIds = [];
                if (!imported.advent) imported.advent = {};
                if (!imported.adventPool) imported.adventPool = [];

                const wasMissingConfig = !imported.config;
                if (wasMissingConfig) imported.config = core.inferConfigFromLegacyData(imported);

                core.data = imported;
                core.buildDynamicUI();
                core.saveLocal();
                core.renderAll();

                if (wasMissingConfig) {
                    alert("Dades carregades! Revisa l'ordre dels grups familiars si cal. 🎅");
                    core.openConfigModal('family');
                } else {
                    alert("Dades carregades i sincronitzades a la perfecció! 🎅");
                }
            } catch (err) { alert("Error llegint l'arxiu."); }
        };
        reader.readAsText(file);
        e.target.value = '';
    },

    openUnlockModal: () => document.getElementById('unlockModal').style.display = 'block',
    unlock: () => {
        const u = document.getElementById('unlockUser').value;
        const p = document.getElementById('unlockPin').value;
        if (!p) return alert("Has de posar un PIN!");

        if (!core.data.pins[u]) {
            core.data.pins[u] = p;
            core.saveLocal();
            alert(`PIN guardat per a ${u}. Si l'oblides, el pots llegir exportant l'arxiu.`);
        } else if (core.data.pins[u] !== p) {
            return alert("PIN incorrecte! 🛑");
        }

        core.currentUser = u; core.pin = p;
        document.getElementById('userStatus').innerHTML = `🕵️‍♂️ Sessió: <b>${u}</b>`;
        document.getElementById('btnUnlock').classList.add('hidden');
        document.getElementById('btnLock').classList.remove('hidden');
        core.closeModal('unlockModal');
        core.renderAll();
    },

    lock: () => {
        core.currentUser = null; core.pin = null;
        document.getElementById('userStatus').innerHTML = `👨‍👩‍👧‍👧 Vista Familiar`;
        document.getElementById('btnUnlock').classList.remove('hidden');
        document.getElementById('btnLock').classList.add('hidden');
        document.getElementById('unlockPin').value = '';
        core.renderAll();
    },

    /* --- [7] NAVEGACIÓ ENTRE VISTES, MODALS, TECLAT I SWIPE-DOWN REFRESH --- */
    switchMainView: (view) => {
        core.activeMainView = view;

        const navMap = {
            list: 'navBtnList',
            board: 'navBtnBoard',
            advent: 'navBtnAdvent',
            santallucia: 'navBtnSantaLlucia'
        };
        Object.entries(navMap).forEach(([k, btnId]) => {
            const el = document.getElementById(btnId);
            if (el) el.classList.toggle('active', k === view);
        });

        Object.entries(core.views).forEach(([key, v]) => {
            if (v && v.sectionId) {
                const sec = document.getElementById(v.sectionId);
                if (sec) sec.classList.toggle('hidden', key !== view);
            }
        });

        const wideViews = ['board', 'advent'];
        document.getElementById('mainContainer').classList.toggle('wide-view', wideViews.includes(view));

        const activeViewObj = core.views[view];
        const hideFab = activeViewObj && typeof activeViewObj.hideFloatingBtn === 'function' ? activeViewObj.hideFloatingBtn() : false;
        document.getElementById('floatingAddBtn').classList.toggle('hidden', hideFab);

        document.getElementById('appHeader').classList.remove('header-hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (activeViewObj && typeof activeViewObj.render === 'function') activeViewObj.render();
    },

    renderAll: () => {
        core.updateBudgetHeader();
        if (core.views.list && typeof core.views.list.renderFilterPills === 'function') {
            core.views.list.renderFilterPills();
        }
        if (core.views.list && typeof core.views.list.render === 'function') {
            core.views.list.render();
        }
        if (core.activeMainView !== 'list' && core.views[core.activeMainView] && typeof core.views[core.activeMainView].render === 'function') {
            core.views[core.activeMainView].render();
        }
    },

    setupSmartHeader: () => {
        const header = document.getElementById('appHeader');
        if (!header) return;

        let lastScrollY = window.scrollY || 0;
        let ticking = false;

        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const currentY = Math.max(0, window.scrollY || 0);
                    const drawerOpen = !document.getElementById('cloudDrawer').classList.contains('hidden');
                    const anyModalOpen = ALL_MODAL_IDS.some(id => document.getElementById(id).style.display === 'block');

                    if (currentY <= 15 || drawerOpen || anyModalOpen) {
                        header.classList.remove('header-hidden');
                    } else if (currentY > lastScrollY + 10 && currentY > 80) {
                        header.classList.add('header-hidden');
                    } else if (currentY < lastScrollY - 8) {
                        header.classList.remove('header-hidden');
                    }

                    lastScrollY = currentY;
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        document.addEventListener('click', (e) => {
            const drawer = document.getElementById('cloudDrawer');
            if (!drawer.classList.contains('hidden') && !header.contains(e.target)) {
                drawer.classList.add('hidden');
            }
        });
    },

    setupPullToRefresh: () => {
        const indicator = document.getElementById('pullRefreshIndicator');
        let startY = 0;
        let pulling = false;
        let triggered = false;

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY > 2) return;
            const anyModalOpen = ALL_MODAL_IDS.some(id => document.getElementById(id).style.display === 'block');
            if (anyModalOpen || !e.touches || e.touches.length !== 1) return;
            startY = e.touches[0].clientY;
            pulling = true;
            triggered = false;
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!pulling || window.scrollY > 2) return;
            const deltaY = e.touches[0].clientY - startY;
            if (deltaY > 18 && !triggered && indicator) {
                indicator.classList.remove('hidden');
                indicator.innerText = deltaY > 85 ? '🔄 Deixa anar per sincronitzar...' : '⬇️ Estira avall per sincronitzar';
            }
        }, { passive: true });

        window.addEventListener('touchend', async (e) => {
            if (!pulling) return;
            pulling = false;
            const endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
            const deltaY = endY - startY;
            if (deltaY > 85 && window.scrollY <= 2) {
                triggered = true;
                if (indicator) {
                    indicator.classList.remove('hidden');
                    indicator.innerText = '🟡 Sincronitzant...';
                }
                await core.manualSync();
            }
            if (indicator) {
                setTimeout(() => indicator.classList.add('hidden'), 600);
            }
        }, { passive: true });
    },

    toggleCloudDrawer: (forceState = null) => {
        const drawer = document.getElementById('cloudDrawer');
        if (forceState === true) drawer.classList.remove('hidden');
        else if (forceState === false) drawer.classList.add('hidden');
        else drawer.classList.toggle('hidden');
    },

    setupModalBackdropClicks: () => {
        ALL_MODAL_IDS.forEach(modalId => {
            const el = document.getElementById(modalId);
            if (!el) return;
            let downOnBackdrop = false;
            el.addEventListener('mousedown', (e) => { downOnBackdrop = (e.target === el); });
            el.addEventListener('mouseup', (e) => {
                if (downOnBackdrop && e.target === el) core.handleBackdropClick(modalId);
                downOnBackdrop = false;
            });
        });
    },

    handleBackdropClick: (modalId) => {
        if (modalId === 'unlockModal' || modalId === 'shareModal' || modalId === 'configModal') {
            core.closeModal(modalId);
            return;
        }
        if (modalId === 'budgetsModal') {
            if (core.activeBudgetTab === 'limits') core.saveBudgets(true);
            else if (core.activeBudgetTab === 'lastYear') core.saveLastYear(true);
            else core.closeModal('budgetsModal');
            return;
        }
        if (modalId === 'giftModal') {
            const id = document.getElementById('giftId').value;
            const title = document.getElementById('gTitle').value.trim();
            if (!id && !title) {
                core.closeModal('giftModal');
                return;
            }
            core.saveGift();
            return;
        }
        if (modalId === 'adventModal' && core.views.advent && typeof core.views.advent.handleBackdrop === 'function') {
            core.views.advent.handleBackdrop();
        }
    },

    setupKeyboardShortcuts: () => {
        document.addEventListener('keydown', (e) => {
            const openModalId = ALL_MODAL_IDS.find(id => {
                const el = document.getElementById(id);
                return el && el.style.display === 'block';
            });
            if (!openModalId) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                core.closeModal(openModalId);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (openModalId === 'giftModal') core.saveGift();
                else if (openModalId === 'adventModal' && core.views.advent) core.views.advent.saveModal();
                else if (openModalId === 'budgetsModal') {
                    if (core.activeBudgetTab === 'limits') core.saveBudgets(true);
                    else if (core.activeBudgetTab === 'lastYear') core.saveLastYear(true);
                    else core.closeModal('budgetsModal');
                } else if (openModalId === 'configModal') {
                    if (core.activeConfigTab === 'github') core.saveGithubConfig();
                    else core.saveFamilyConfig();
                } else if (openModalId === 'unlockModal') core.unlock();
                else if (openModalId === 'shareModal') {
                    core.copyShareText();
                    core.closeModal('shareModal');
                }
            }
        });
    },

    renderCountdown: () => {
        const el = document.getElementById('xmasCountdown');
        if (!el) return;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const year = core.getChristmasYear();

        const diffDays = (target) => Math.round((target - today) / 86400000);
        const dTio = diffDays(new Date(year, 11, 24));
        const dNadal = diffDays(new Date(year, 11, 25));
        const dReis = diffDays(new Date(year + 1, 0, 6));

        if (dTio === 0) el.innerText = "🪵 Avui fem cagar el Tió!";
        else if (dNadal === 0) el.innerText = "🎄 Bon Nadal a tota la família!";
        else if (dReis === 0) el.innerText = "👑 Feliç Dia de Reis!";
        else if (dTio > 0) el.innerText = `⏳ ${dTio} dies per al Tió · ${dNadal} per Nadal · ${dReis} per Reis`;
        else if (dReis > 0) el.innerText = `⏳ Queden ${dReis} dies per a l'arribada dels Reis 👑`;
        else el.innerText = "✨ Planificació Nadalenca Activa";
    },

    generatePngIcons: () => {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#b3000c';
        ctx.fillRect(0, 0, 180, 180);

        ctx.font = '105px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎄', 90, 98);

        const appleIcon = document.getElementById('appleTouchIcon');
        if (appleIcon) appleIcon.href = canvas.toDataURL('image/png');
    },

    /* --- [8] CÀLCUL ECONÒMIC, PRESSUPOSTOS, ANY PASSAT I COMPARTIR WHATSAPP --- */
    calculateSpendingBreakdown: () => {
        const budgetCats = core.getBudgetCategories();
        const spentByCat = {};
        const approxByCat = {};
        budgetCats.forEach(c => {
            spentByCat[c] = 0;
            approxByCat[c] = 0;
        });

        const spentByExpenseCat = {};
        const pendingByExpenseCat = {};
        core.expenseCategories.forEach(ec => {
            spentByExpenseCat[ec] = 0;
            pendingByExpenseCat[ec] = 0;
        });

        let totalSpent = 0;
        let totalSpentDefinitive = 0;
        let totalSpentApprox = 0;

        core.data.gifts.forEach(g => {
            const isExpense = (g.type === 'expense');
            const isOthersSecret = (!isExpense && g.isSecret && g.createdBy !== core.currentUser);
            const priceVal = isOthersSecret ? 0 : parseFloat(g.isSecret ? core.decrypt(g.price, core.pin) : g.price) || 0;
            const isPaidByUs = isExpense ? true : (g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from));
            const isApprox = Boolean(g.isApprox);

            if (isExpense) {
                const expCat = g.expenseCat || "🎉 Altres despeses nadalenques";
                if (spentByExpenseCat[expCat] === undefined) spentByExpenseCat[expCat] = 0;
                if (pendingByExpenseCat[expCat] === undefined) pendingByExpenseCat[expCat] = 0;

                if (g.state !== 'Idea' && g.state !== 'Decidit' && priceVal > 0) {
                    totalSpent += priceVal;
                    if (isApprox) totalSpentApprox += priceVal;
                    else totalSpentDefinitive += priceVal;

                    spentByCat["🎄 Altres Despeses (Àpats, Deco...)"] += priceVal;
                    if (isApprox) approxByCat["🎄 Altres Despeses (Àpats, Deco...)"] += priceVal;
                    spentByExpenseCat[expCat] += priceVal;
                } else if ((g.state === 'Idea' || g.state === 'Decidit') && priceVal > 0) {
                    pendingByExpenseCat[expCat] += priceVal;
                }
            } else {
                if (g.state !== 'Idea' && g.state !== 'Decidit' && g.state !== 'Confirmat' && isPaidByUs && priceVal > 0) {
                    totalSpent += priceVal;
                    if (isApprox) totalSpentApprox += priceVal;
                    else totalSpentDefinitive += priceVal;

                    const recips = g.recipients || (g.recipient ? [g.recipient] : []);
                    if (recips.length > 0) {
                        const share = priceVal / recips.length;
                        recips.forEach(person => {
                            const cat = core.mapPersonToBudgetCat(person);
                            spentByCat[cat] = (spentByCat[cat] || 0) + share;
                            if (isApprox) approxByCat[cat] = (approxByCat[cat] || 0) + share;
                        });
                    } else {
                        spentByCat["Altres / Amics"] += priceVal;
                        if (isApprox) approxByCat["Altres / Amics"] += priceVal;
                    }
                }
            }
        });

        const adventCat = "🗓️ Calendari d'Advent";
        const allAdventItems = [...Object.values(core.data.advent || {}), ...(core.data.adventPool || [])];
        allAdventItems.forEach(item => {
            if (!item || !item.title || !item.title.trim()) return;
            const p = parseFloat(item.price) || 0;
            if (p <= 0) return;
            const isApprox = Boolean(item.isApprox);

            if (item.state === 'Comprat') {
                totalSpent += p;
                if (isApprox) totalSpentApprox += p;
                else totalSpentDefinitive += p;

                spentByCat["🎄 Altres Despeses (Àpats, Deco...)"] += p;
                if (isApprox) approxByCat["🎄 Altres Despeses (Àpats, Deco...)"] += p;
                spentByExpenseCat[adventCat] = (spentByExpenseCat[adventCat] || 0) + p;
            } else {
                pendingByExpenseCat[adventCat] = (pendingByExpenseCat[adventCat] || 0) + p;
            }
        });

        return { totalSpent, totalSpentDefinitive, totalSpentApprox, spentByCat, approxByCat, spentByExpenseCat, pendingByExpenseCat };
    },

    updateBudgetHeader: () => {
        let previst = 0;
        Object.values(core.data.budgets || {}).forEach(v => previst += (parseFloat(v) || 0));
        const { totalSpent, totalSpentDefinitive, totalSpentApprox } = core.calculateSpendingBreakdown();

        const execPct = previst > 0 ? Math.round((totalSpent / previst) * 100) : 0;
        document.getElementById('budgetPrevist').innerText = previst.toFixed(0) + ' €';
        document.getElementById('budgetGastat').innerText = totalSpent.toFixed(2) + ' €';

        const subEl = document.getElementById('budgetGastatSub');
        if (totalSpentApprox > 0) {
            subEl.innerText = `Def: ${totalSpentDefinitive.toFixed(0)}€ · ~Aprox: ${totalSpentApprox.toFixed(0)}€`;
            subEl.classList.remove('hidden');
        } else {
            subEl.classList.add('hidden');
        }

        document.getElementById('budgetPct').innerText = execPct + '%';
        document.getElementById('headerProgressBar').style.width = Math.min(execPct, 100) + '%';
    },

    openBudgetsModal: (defaultTab = 'ratios') => {
        const budgetCats = core.getBudgetCategories();
        const contLimits = document.getElementById('budgetInputsContainer');
        contLimits.innerHTML = '';
        budgetCats.forEach((cat, i) => {
            const val = core.data.budgets[cat] || '';
            contLimits.innerHTML += `
                <div class="budget-row">
                    <span>${cat}</span>
                    <div><input type="number" id="b_cat_${i}" value="${val}" placeholder="0"> €</div>
                </div>`;
        });

        const contLast = document.getElementById('lastYearInputsContainer');
        contLast.innerHTML = '';
        budgetCats.forEach((cat, i) => {
            const val = core.data.lastYear[cat] || '';
            contLast.innerHTML += `
                <div class="budget-row">
                    <span>${cat}</span>
                    <div><input type="number" id="ly_cat_${i}" value="${val}" placeholder="0"> €</div>
                </div>`;
        });

        core.renderRatiosTab();
        core.switchBudgetTab(defaultTab);
        document.getElementById('budgetsModal').style.display = 'block';
    },

    switchBudgetTab: (tabName) => {
        core.activeBudgetTab = tabName;
        ['Ratios', 'Limits', 'LastYear'].forEach(t => {
            const lower = t.charAt(0).toLowerCase() + t.slice(1);
            document.getElementById('tab' + t).classList.toggle('hidden', lower !== tabName);
            document.getElementById('tabBtn' + t).classList.toggle('active', lower === tabName);
        });
    },

    renderRatiosTab: () => {
        const budgetCats = core.getBudgetCategories();
        const { totalSpent, totalSpentDefinitive, totalSpentApprox, spentByCat, approxByCat, spentByExpenseCat, pendingByExpenseCat } = core.calculateSpendingBreakdown();
        let totalBudget = 0;
        Object.values(core.data.budgets || {}).forEach(v => totalBudget += (parseFloat(v) || 0));

        let totalLastYear = 0;
        Object.values(core.data.lastYear || {}).forEach(v => totalLastYear += (parseFloat(v) || 0));

        const globalPct = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0;
        const diffTotal = totalSpent - totalLastYear;
        const diffTotalPct = totalLastYear > 0 ? ((diffTotal / totalLastYear) * 100).toFixed(1) : null;

        let summaryHtml = `
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span><b>Execució Global:</b> ${totalSpent.toFixed(2)} € / ${totalBudget.toFixed(2)} €</span>
                <span style="font-weight:bold; color:${globalPct > 100 ? 'var(--c-red)' : 'var(--c-green)'};">${globalPct}%</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.85em; color:#555; margin-bottom:6px;">
                <span>✅ Definitiu: <b>${totalSpentDefinitive.toFixed(2)} €</b></span>
                <span>~ Aproximat: <b>${totalSpentApprox.toFixed(2)} €</b></span>
            </div>
        `;
        if (totalLastYear > 0) {
            const sign = diffTotal > 0 ? '+' : '';
            const cls = diffTotal > 0 ? 'diff-up' : 'diff-down';
            summaryHtml += `
                <div style="border-top:1px solid #ddd; padding-top:6px; margin-top:6px; display:flex; justify-content:space-between;">
                    <span><b>Vs. Any Passat (${totalLastYear.toFixed(2)} €):</b></span>
                    <span class="${cls}">${sign}${diffTotal.toFixed(2)} € (${sign}${diffTotalPct}%)</span>
                </div>
            `;
        } else {
            summaryHtml += `<div style="font-size:0.8em; color:#666; margin-top:4px;">💡 Omple la pestanya "📅 Any Passat" per veure la comparativa anual.</div>`;
        }
        document.getElementById('ratiosSummaryBox').innerHTML = summaryHtml;

        const listCont = document.getElementById('ratiosListContainer');
        listCont.innerHTML = '';

        budgetCats.forEach(cat => {
            const spent = spentByCat[cat] || 0;
            const approxPart = approxByCat[cat] || 0;
            const limit = parseFloat(core.data.budgets[cat]) || 0;
            const ly = parseFloat(core.data.lastYear[cat]) || 0;

            if (spent === 0 && limit === 0 && ly === 0) return;

            const pct = limit > 0 ? Math.round((spent / limit) * 100) : (spent > 0 ? 100 : 0);
            const barWidth = Math.min(pct, 100);
            const isOver = limit > 0 && spent > limit;

            let lyHtml = '';
            if (ly > 0) {
                const d = spent - ly;
                const sign = d > 0 ? '+' : '';
                const cls = d > 0 ? 'diff-up' : 'diff-down';
                lyHtml = `<span>Any passat: ${ly} € (<span class="${cls}">${sign}${d.toFixed(0)} €</span>)</span>`;
            }

            const approxNote = approxPart > 0 ? ` <span style="color:#9a7d0a; font-weight:normal; font-size:0.85em;">(incl. ~${approxPart.toFixed(0)}€ aprox.)</span>` : '';

            listCont.innerHTML += `
                <div class="ratio-card">
                    <div class="ratio-top">
                        <span>${cat}</span>
                        <span>${spent.toFixed(2)} €${approxNote} ${limit > 0 ? '/ ' + limit + ' € (' + pct + '%)' : ''}</span>
                    </div>
                    ${limit > 0 ? `<div class="ratio-bar-bg"><div class="ratio-bar-fill ${isOver ? 'over' : ''}" style="width:${barWidth}%"></div></div>` : ''}
                    <div class="ratio-details">
                        <span>${limit > 0 ? (limit - spent >= 0 ? 'Queden: ' + (limit - spent).toFixed(2) + ' €' : 'Excedit: ' + Math.abs(limit - spent).toFixed(2) + ' €') : 'Sense límit fixat'}</span>
                        ${lyHtml}
                    </div>
                </div>
            `;
        });

        const expCont = document.getElementById('expenseBreakdownContainer');
        const totalExpensesSpent = spentByCat["🎄 Altres Despeses (Àpats, Deco...)"] || 0;
        const allExpenseCats = Array.from(new Set([...core.expenseCategories, ...Object.keys(spentByExpenseCat)]));
        const hasAnyExpenseActivity = totalExpensesSpent > 0 || Object.values(pendingByExpenseCat).some(v => v > 0);

        if (hasAnyExpenseActivity) {
            let rowsHtml = '';
            allExpenseCats.forEach(ec => {
                const sp = spentByExpenseCat[ec] || 0;
                const pend = pendingByExpenseCat[ec] || 0;
                const sharePct = totalExpensesSpent > 0 ? Math.round((sp / totalExpensesSpent) * 100) : 0;

                rowsHtml += `
                    <div class="expense-detail-row" style="${sp === 0 && pend === 0 ? 'opacity:0.55;' : ''}">
                        <div>
                            <span>${ec}</span>
                            ${pend > 0 ? `<span class="expense-cat-pending">⏳ Previst / Idees: ${pend.toFixed(2)} €</span>` : ''}
                        </div>
                        <div style="text-align:right;">
                            <b>${sp.toFixed(2)} €</b>
                            ${sp > 0 ? `<span style="font-size:0.8em; color:var(--c-green); margin-left:4px;">(${sharePct}%)</span>` : ''}
                        </div>
                    </div>
                `;
            });

            expCont.innerHTML = `
                <div class="expense-detail-box">
                    <div class="expense-detail-title">
                        <span>🎄 Detall Despeses Nadalenques</span>
                        <span>${totalExpensesSpent.toFixed(2)} €</span>
                    </div>
                    ${rowsHtml}
                </div>
            `;
        } else {
            expCont.innerHTML = '';
        }
    },

    saveBudgets: (closeAfter = false) => {
        const budgetCats = core.getBudgetCategories();
        budgetCats.forEach((cat, i) => {
            const val = document.getElementById('b_cat_' + i).value;
            if (val) core.data.budgets[cat] = parseFloat(val);
            else delete core.data.budgets[cat];
        });
        core.saveLocal();
        core.renderRatiosTab();
        core.renderAll();
        if (closeAfter) core.closeModal('budgetsModal');
        else core.switchBudgetTab('ratios');
    },

    saveLastYear: (closeAfter = false) => {
        const budgetCats = core.getBudgetCategories();
        budgetCats.forEach((cat, i) => {
            const val = document.getElementById('ly_cat_' + i).value;
            if (val) core.data.lastYear[cat] = parseFloat(val);
            else delete core.data.lastYear[cat];
        });
        core.saveLocal();
        core.renderRatiosTab();
        if (closeAfter) core.closeModal('budgetsModal');
        else core.switchBudgetTab('ratios');
    },

    openShareModal: () => {
        document.getElementById('btnCopyShare').innerText = '📋 Copiar text';
        core.generateShareText();
        document.getElementById('shareModal').style.display = 'block';
    },

    selectSharePreset: (preset) => {
        const cfg = core.getConfig();
        const checks = document.querySelectorAll('input[name="sharePersonCheck"]');
        const kids = core.getKidsList();
        const casa = cfg.casaMembers;

        checks.forEach(c => {
            if (preset === 'kids') c.checked = kids.includes(c.value);
            else if (preset === 'casa') c.checked = casa.includes(c.value);
            else c.checked = false;
        });
        core.generateShareText();
    },

    generateShareText: () => {
        const selectedPeople = Array.from(document.querySelectorAll('input[name="sharePersonCheck"]:checked')).map(c => c.value);
        const area = document.getElementById('shareTextArea');

        if (selectedPeople.length === 0) {
            area.value = '';
            return;
        }

        const incIdeas = document.getElementById('shareIncIdeas').checked;
        const incConfirmedOurs = document.getElementById('shareIncConfirmedOurs').checked;
        const incConfirmedOthers = document.getElementById('shareIncConfirmedOthers').checked;

        const incPrice = document.getElementById('shareIncPrice').checked;
        const incUrl = document.getElementById('shareIncUrl').checked;
        const incComments = document.getElementById('shareIncComments').checked;
        const incEvent = document.getElementById('shareIncEvent').checked;

        const publicGifts = core.data.gifts.filter(g => (g.type || 'gift') === 'gift' && !g.isSecret);

        const formatGiftLine = (g, prefixBullet = '•', extraMeta = '') => {
            let line = `${prefixBullet} ${g.title}`;
            const priceVal = parseFloat(g.price) || 0;
            if (incPrice && priceVal > 0) line += ` (${g.isApprox ? '~' : ''}${priceVal} €)`;
            if (incEvent && g.event && g.event !== '❓ Per decidir') line += ` — _${g.event}_`;
            if (extraMeta) line += ` ${extraMeta}`;
            const out = [line];
            if (incUrl && g.url && g.url.trim()) out.push(`  🔗 ${g.url.trim()}`);
            if (incComments && g.comments && g.comments.trim()) out.push(`  📝 ${g.comments.trim().replace(/\n+/g, ' ')}`);
            return out;
        };

        let lines = ['🎁 *RESUM DE REGALS* 🎄'];
        let totalFound = 0;

        selectedPeople.forEach(person => {
            const forPerson = publicGifts.filter(g => {
                const r = g.recipients || (g.recipient ? [g.recipient] : []);
                return r.includes(person);
            });

            const ideas = incIdeas ? forPerson.filter(g => g.state === 'Idea') : [];
            const oursConfirmed = incConfirmedOurs ? forPerson.filter(g => {
                const isPaid = g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from);
                return isPaid && g.state !== 'Idea';
            }) : [];
            const othersConfirmed = incConfirmedOthers ? forPerson.filter(g => {
                const isPaid = g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from);
                return !isPaid && g.state !== 'Idea';
            }) : [];

            if (ideas.length > 0 || oursConfirmed.length > 0 || othersConfirmed.length > 0) {
                lines.push('');
                lines.push(`👤 *${person.toUpperCase()}*`);

                ideas.forEach(g => {
                    totalFound++;
                    lines.push(...formatGiftLine(g, '💡'));
                });

                oursConfirmed.forEach(g => {
                    totalFound++;
                    lines.push(...formatGiftLine(g, '🏠', `_[${g.state}]_`));
                });

                othersConfirmed.forEach(g => {
                    totalFound++;
                    const froms = g.froms || (g.from ? [g.from] : []);
                    const fromLabel = froms.length > 0 ? `_(De: ${froms.join(', ')})_` : '_(Altra casa)_';
                    lines.push(...formatGiftLine(g, '🏡', fromLabel));
                });
            }
        });

        if (totalFound === 0) {
            area.value = `No hi ha cap element coincident amb els criteris marcats per a: ${selectedPeople.join(', ')}.`;
        } else {
            area.value = lines.join('\n');
        }
    },

    copyShareText: () => {
        const area = document.getElementById('shareTextArea');
        if (!area.value.trim()) return alert("No hi ha cap text per copiar.");

        const btn = document.getElementById('btnCopyShare');
        const markCopied = () => {
            btn.innerText = '✅ Copiat al porta-retalls!';
            btn.style.background = 'var(--c-green)';
            setTimeout(() => {
                btn.innerText = '📋 Copiar text';
                btn.style.background = '#2471a3';
            }, 2200);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(area.value).then(markCopied).catch(() => {
                area.select();
                document.execCommand('copy');
                markCopied();
            });
        } else {
            area.select();
            document.execCommand('copy');
            markCopied();
        }
    },

    /* --- [9] FORMULARI DE REGALS/DESPESES (DELIVERYDATE + REGALS CONJUNTS) --- */
    closeModal: (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    },

    toggleDeliveryField: () => {
        const isGift = document.getElementById('gType').value === 'gift';
        const stateVal = document.getElementById('gState').value;
        const wrap = document.getElementById('deliveryDateContainer');
        if (!wrap) return;
        const show = isGift && (stateVal === 'Comprat/Delivery' || Boolean(document.getElementById('gDeliveryDate').value));
        wrap.classList.toggle('hidden', !show);
    },

    updateStateOptions: (desiredState = null) => {
        const isGift = document.getElementById('gType').value === 'gift';
        const isPaidByUs = !isGift || document.getElementById('gPaidByUs').checked;
        const stateSel = document.getElementById('gState');
        const lblState = document.getElementById('lblState');
        const lblPrice = document.getElementById('lblPrice');
        const paidBox = document.getElementById('paidByUsLabel');
        const paidText = document.getElementById('paidByUsText');

        if (isGift && !isPaidByUs) {
            paidBox.classList.add('is-other-house');
            paidText.innerText = "🏡 D'una altra casa (No suma al nostre pressupost)";
            lblState.innerText = "Estat (Regal d'una altra casa):";
            lblPrice.innerText = "Preu orientatiu (€) (Opcional, no suma):";

            stateSel.innerHTML = `
                <option value="Idea">💡 Idea / Proposta</option>
                <option value="Confirmat">🤝 Confirmat</option>
            `;
            stateSel.value = (desiredState && ['Idea', 'Confirmat'].includes(desiredState)) ? desiredState : 'Confirmat';
        } else {
            paidBox.classList.remove('is-other-house');
            paidText.innerText = "💰 Ho paguem nosaltres (Anotar la nostra aportació)";
            lblState.innerText = "Estat (Idees i Decidits no sumen a Gastat):";
            lblPrice.innerText = "Preu (€ — nostra part) i Tipus d'Import:";

            stateSel.innerHTML = `
                <option value="Idea">💡 Idea / Previst (No suma despesa)</option>
                <option value="Decidit">🎯 Decidit, pendent de comprar</option>
                <option value="Comprat/Delivery">🚚 Comprat / Pagat</option>
                <option value="El tenim">✅ El tenim</option>
                <option value="Embolicat">🎀 Embolicat</option>
            `;
            if (desiredState && ['Idea', 'Decidit', 'Comprat/Delivery', 'El tenim', 'Embolicat'].includes(desiredState)) {
                stateSel.value = desiredState;
            } else if (desiredState === 'Confirmat') {
                stateSel.value = 'Decidit';
            } else {
                stateSel.value = 'Idea';
            }
        }
        core.toggleDeliveryField();
    },

    onPaidByUsChange: () => {
        core.updateStateOptions(document.getElementById('gState').value);
    },

    setItemType: (type, preserveState = null) => {
        document.getElementById('gType').value = type;
        const isGift = (type === 'gift');

        document.getElementById('typeBtnGift').classList.toggle('active', isGift);
        document.getElementById('typeBtnExpense').classList.toggle('active-green', !isGift);

        document.getElementById('giftOnlyFields').classList.toggle('hidden', !isGift);
        document.getElementById('secretWrapper').classList.toggle('hidden', !isGift);
        document.getElementById('expenseFields').classList.toggle('hidden', isGift);

        if (!isGift) {
            document.getElementById('gEvent').value = '✨ General Festes';
            document.getElementById('roundContainer').classList.add('hidden');
        } else {
            if (document.getElementById('gEvent').value === '✨ General Festes') {
                document.getElementById('gEvent').value = '❓ Per decidir';
            }
            core.toggleRounds();
        }

        document.getElementById('lblTitle').innerText = isGift ? "Descripció (Què és?):" : "Concepte de la despesa:";
        document.getElementById('gTitle').placeholder = isGift ? "Ex: Bicicleta vermella" : "Ex: Dinar Santa Llúcia, Torrons, Arbre...";
        core.updateStateOptions(preserveState || document.getElementById('gState').value);
    },

    toggleRounds: () => {
        const cfg = core.getConfig();
        const isGift = document.getElementById('gType').value === 'gift';
        const ev = document.getElementById('gEvent').value;
        const rc = document.getElementById('roundContainer');
        if (isGift && ev === cfg.bigTioName && cfg.rounds.length > 0) rc.classList.remove('hidden');
        else rc.classList.add('hidden');
    },

    openModalForTarget: (targetType, targetValue = null) => {
        const cfg = core.getConfig();
        core.openModal(null);
        const recipChecks = document.querySelectorAll('input[name="gRecipCheck"]');

        if (targetType === 'person' && targetValue) {
            recipChecks.forEach(c => { if (c.value === targetValue) c.checked = true; });
        } else if (targetType === 'casa4') {
            recipChecks.forEach(c => { if (cfg.casaMembers.includes(c.value)) c.checked = true; });
        }

        const boardEvEl = document.getElementById('boardEventFilter');
        if (boardEvEl && boardEvEl.value && boardEvEl.value !== 'all') {
            document.getElementById('gEvent').value = boardEvEl.value;
            core.toggleRounds();
        }
    },

    openModal: (id = null) => {
        const cfg = core.getConfig();
        const isNew = (id === null);
        document.getElementById('modalTitle').innerText = isNew ? "Nou Element ✨" : "Editar Element ✏️";
        document.getElementById('btnDelete').classList.toggle('hidden', isNew);
        document.getElementById('btnDuplicate').classList.toggle('hidden', isNew);
        document.getElementById('dupBanner').classList.add('hidden');

        if (core.currentUser) {
            document.getElementById('secretContainer').style.display = 'block';
            document.getElementById('secretWarning').style.display = 'none';
        } else {
            document.getElementById('secretContainer').style.display = 'none';
            document.getElementById('secretWarning').style.display = 'block';
        }

        const recipChecks = document.querySelectorAll('input[name="gRecipCheck"]');
        const fromChecks = document.querySelectorAll('input[name="gFromCheck"]');
        recipChecks.forEach(c => c.checked = false);
        fromChecks.forEach(c => c.checked = false);

        if (isNew) {
            document.getElementById('gPaidByUs').checked = true;
            if (core.activeMainView === 'santallucia') {
                core.setItemType('expense', 'Idea');
                document.getElementById('gExpenseCat').value = '🍲 Dinar de Santa Llúcia';
            } else {
                core.setItemType('gift', 'Idea');
                document.getElementById('gEvent').value = '❓ Per decidir';
            }
            document.getElementById('giftId').value = '';
            document.getElementById('gTitle').value = '';
            document.getElementById('gPrice').value = '';
            document.getElementById('gPriceType').value = 'definitive';
            document.getElementById('gDeliveryDate').value = '';
            document.getElementById('gUrl').value = '';
            document.getElementById('gImage').value = '';
            document.getElementById('gComments').value = '';
            document.getElementById('gSecret').checked = false;
            fromChecks.forEach(c => { if (cfg.parents.includes(c.value)) c.checked = true; });
        } else {
            const g = core.data.gifts.find(x => x.id === id);
            const itemType = g.type || 'gift';

            if (itemType === 'expense') {
                document.getElementById('gPaidByUs').checked = true;
                document.getElementById('gExpenseCat').value = g.expenseCat || '🍲 Dinar de Santa Llúcia';
                document.getElementById('gDeliveryDate').value = '';
            } else {
                const recips = g.recipients || (g.recipient ? [g.recipient] : []);
                recipChecks.forEach(c => { if (recips.includes(c.value)) c.checked = true; });

                const froms = g.froms || (g.from && g.from !== 'Nosaltres' ? [g.from] : cfg.parents);
                fromChecks.forEach(c => { if (froms.includes(c.value)) c.checked = true; });

                const isPaid = g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from);
                document.getElementById('gPaidByUs').checked = isPaid;
                document.getElementById('gDeliveryDate').value = g.deliveryDate || '';
            }

            core.setItemType(itemType, g.state);
            document.getElementById('giftId').value = g.id;
            document.getElementById('gEvent').value = g.event || (itemType === 'expense' ? '✨ General Festes' : '❓ Per decidir');
            if (g.round) document.getElementById('gRound').value = g.round;
            document.getElementById('gPriceType').value = g.isApprox ? 'approx' : 'definitive';
            document.getElementById('gSecret').checked = g.isSecret;

            if (g.isSecret && itemType === 'gift') {
                document.getElementById('gTitle').value = core.decrypt(g.title, core.pin);
                document.getElementById('gPrice').value = core.decrypt(g.price, core.pin);
                document.getElementById('gUrl').value = core.decrypt(g.url, core.pin);
                document.getElementById('gImage').value = core.decrypt(g.image, core.pin);
                document.getElementById('gComments').value = core.decrypt(g.comments || '', core.pin);
            } else {
                document.getElementById('gTitle').value = g.title;
                document.getElementById('gPrice').value = g.price;
                document.getElementById('gUrl').value = g.url;
                document.getElementById('gImage').value = g.image;
                document.getElementById('gComments').value = g.comments || '';
            }
        }
        core.toggleRounds();
        core.toggleDeliveryField();
        document.getElementById('giftModal').style.display = 'block';
    },

    buildItemFromForm: (forceId = null, forceState = null) => {
        const cfg = core.getConfig();
        const itemType = document.getElementById('gType').value;
        let title = document.getElementById('gTitle').value.trim();
        if (!title) {
            alert("Escriu una descripció!");
            return null;
        }

        let selectedRecips = [];
        let selectedFroms = [];
        let isSecret = false;
        let paidByUs = true;
        let expenseCat = null;
        let deliveryDate = '';

        if (itemType === 'gift') {
            selectedRecips = Array.from(document.querySelectorAll('input[name="gRecipCheck"]:checked')).map(c => c.value);
            if (selectedRecips.length === 0) {
                alert("Ei! Marca almenys una persona a 'Per a qui?'");
                return null;
            }
            selectedFroms = Array.from(document.querySelectorAll('input[name="gFromCheck"]:checked')).map(c => c.value);
            isSecret = document.getElementById('gSecret').checked;
            paidByUs = document.getElementById('gPaidByUs').checked;
            deliveryDate = document.getElementById('gDeliveryDate').value || '';
        } else {
            expenseCat = document.getElementById('gExpenseCat').value;
        }

        const id = forceId || document.getElementById('giftId').value || Date.now().toString();
        let price = document.getElementById('gPrice').value;
        const isApprox = document.getElementById('gPriceType').value === 'approx';
        let url = document.getElementById('gUrl').value;
        let image = document.getElementById('gImage').value;
        let comments = document.getElementById('gComments').value;

        if (isSecret && core.currentUser && itemType === 'gift') {
            title = core.crypt(title, core.pin);
            price = core.crypt(price, core.pin);
            url = core.crypt(url, core.pin);
            image = core.crypt(image, core.pin);
            comments = core.crypt(comments, core.pin);
        }

        const chosenEvent = document.getElementById('gEvent').value;

        return {
            id,
            type: itemType,
            expenseCat,
            title,
            price,
            isApprox,
            deliveryDate,
            url,
            image,
            comments,
            isSecret,
            paidByUs,
            recipients: selectedRecips,
            froms: selectedFroms,
            event: chosenEvent,
            round: (itemType === 'gift' && chosenEvent === cfg.bigTioName) ? document.getElementById('gRound').value : null,
            state: forceState || document.getElementById('gState').value,
            createdBy: core.currentUser || 'Família',
            updatedAt: Date.now()
        };
    },

    saveGift: () => {
        const newItem = core.buildItemFromForm();
        if (!newItem) return;

        const idx = core.data.gifts.findIndex(x => x.id === newItem.id);
        if (idx > -1) core.data.gifts[idx] = newItem;
        else core.data.gifts.push(newItem);

        core.saveLocal();
        core.closeModal('giftModal');
        core.renderAll();
    },

    duplicateGift: () => {
        const newId = Date.now().toString();
        const duplicatedItem = core.buildItemFromForm(newId, 'Idea');
        if (!duplicatedItem) return;

        core.data.gifts.push(duplicatedItem);
        core.saveLocal();
        core.renderAll();

        document.getElementById('giftId').value = newId;
        core.updateStateOptions('Idea');
        document.getElementById('modalTitle').innerText = "Editar Còpia 📋";
        document.getElementById('dupBanner').classList.remove('hidden');
    },

    deleteGift: () => {
        if (confirm("Segur que vols eliminar aquest element?")) {
            const id = document.getElementById('giftId').value;
            core.data.gifts = core.data.gifts.filter(x => x.id !== id);
            if (!core.data.deletedIds) core.data.deletedIds = [];
            if (!core.data.deletedIds.includes(id)) core.data.deletedIds.push(id);
            core.saveLocal();
            core.closeModal('giftModal');
            core.renderAll();
        }
    },

    resolveGiftDisplay: (g) => {
        const cfg = core.getConfig();
        const isExpense = (g.type === 'expense');
        const isOthersSecret = (!isExpense && g.isSecret && g.createdBy !== core.currentUser);
        const titleDisplay = isOthersSecret ? "🎁 Sorpresa de " + g.createdBy : (g.isSecret ? core.decrypt(g.title, core.pin) : g.title);
        const priceVal = isOthersSecret ? 0 : parseFloat(g.isSecret ? core.decrypt(g.price, core.pin) : g.price) || 0;
        const imgUrl = isOthersSecret ? null : (g.isSecret ? core.decrypt(g.image, core.pin) : g.image);
        const shopUrl = isOthersSecret ? null : (g.isSecret ? core.decrypt(g.url, core.pin) : g.url);
        const commentsDisplay = isOthersSecret ? '' : (g.isSecret ? core.decrypt(g.comments || '', core.pin) : (g.comments || ''));

        const recips = g.recipients || (g.recipient ? [g.recipient] : []);
        const froms = g.froms || (g.from && g.from !== 'Nosaltres' ? [g.from] : cfg.parents);
        const isPaidByUs = isExpense ? true : (g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from));

        const hasUsAsGiver = cfg.parents.some(p => froms.includes(p));
        const isReceivedFromOthers = !isExpense && !isPaidByUs && !hasUsAsGiver;
        const isOtherHouse = !isExpense && !isPaidByUs;
        const jointContributors = !isExpense ? core.getJointContributors(froms, isPaidByUs) : [];
        const deliveryDate = !isExpense ? (g.deliveryDate || '') : '';

        return {
            isExpense,
            isOthersSecret,
            titleDisplay,
            priceVal,
            imgUrl,
            shopUrl,
            commentsDisplay,
            recips,
            froms,
            isPaidByUs,
            isReceivedFromOthers,
            isOtherHouse,
            jointContributors,
            deliveryDate
        };
    }
};

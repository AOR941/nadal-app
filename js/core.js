/* ==========================================================================
 * NADAL TRACKER - JS/CORE.JS (Índex de blocs)
 * [1] Configuració per defecte i estat global
 * [2] Helpers d'esdeveniments, rondes, categories i Base64/UTF-8
 * [3] Criptografia Top Secret (UTF-8 + fallback Latin-1)
 * [4] Migració de dades antigues i fusió en cas de conflicte
 * [5] Sincronització amb GitHub REST API i cua offline
 * [6] Inici, persistència local i configuració (Núvol / Família)
 * [7] Navegació entre vistes, modals, teclat i swipe-down refresh
 * [8] Control econòmic jeràrquic (3 nivells), pressupostos i WhatsApp
 * [9] Formulari de regals/despeses (deliveryDate + regals conjunts + categories)
 * ========================================================================== */

/* --- [1] CONFIGURACIÓ PER DEFECTE I ESTAT GLOBAL --- */
export const DEFAULT_EXPENSE_CATEGORIES = [
    "🍲 Dinar de Santa Llúcia",
    "🗓️ Calendari d'Advent",
    "🍽️ Àpats i Begudes",
    "✨ Decoració i Tradicions",
    "📦 Logística i Preparatius",
    "✉️ Postals de Nadal",
    "🎉 Altres despeses nadalenques"
];

const LEGACY_EXPENSE_CAT_MAP = {
    "✨ Decoració i Arbre": "✨ Decoració i Tradicions",
    "🪵 Tradicions (Tió, Reis, Pessebre)": "✨ Decoració i Tradicions"
};

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
    rounds: ["Ronda 1", "Ronda 2"],
    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES]
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
    "Confirmat",
    "Descartat"
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
    supersededShas: new Set(),
    lastPushAt: 0,

    currentUser: null,
    pin: null,
    activeMainView: 'gifts',
    activeBudgetTab: 'ratios',
    activeConfigTab: 'github',
    econExpanded: {},

    // Referència als controladors de pestanyes (registrats a main.js)
    views: {},

    allGiftStates: [
        { value: 'Idea', label: '💡 Idea' },
        { value: 'Decidit', label: '🎯 Decidit' },
        { value: 'Comprat/Delivery', label: '🚚 Comprat/Delivery' },
        { value: 'El tenim', label: '✅ El tenim' },
        { value: 'Embolicat', label: '🎀 Embolicat' },
        { value: 'Confirmat', label: '🤝 Confirmat' },
        { value: 'Descartat', label: '🚫 Descartat' }
    ],

    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],

    /* --- [2] HELPERS D'ESDEVENIMENTS, RONDES, CATEGORIES I BASE64/UTF-8 --- */
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

    parseMoneyInput: (raw) => {
        if (raw === null || raw === undefined) return NaN;
        let s = String(raw).trim().replace(/[€\s]/g, '');
        if (!s) return NaN;
        if (s.includes('.') && s.includes(',')) {
            s = s.lastIndexOf(',') > s.lastIndexOf('.')
                ? s.replace(/\./g, '').replace(',', '.')
                : s.replace(/,/g, '');
        } else {
            s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : NaN;
    },

    formatMemberLabel: (name) => {
        if (!name) return '';
        return /\(gos/i.test(name)
            ? `🐶 ${name.replace(/\s*\(gos.*?\)/i, '').trim()}`
            : name;
    },

    getConfig: () => Object.assign({}, DEFAULT_FAMILY_CONFIG, core.data.config || {}),

    getExpenseCategories: () => {
        const cfg = core.getConfig();
        const rawList = Array.isArray(cfg.expenseCategories) && cfg.expenseCategories.length > 0
            ? cfg.expenseCategories
            : DEFAULT_EXPENSE_CATEGORIES;

        const set = new Set();
        rawList.forEach(cat => {
            const mapped = LEGACY_EXPENSE_CAT_MAP[cat] || cat;
            if (mapped && mapped.trim()) set.add(mapped.trim());
        });

        set.add("🍲 Dinar de Santa Llúcia");
        set.add("🗓️ Calendari d'Advent");

        (core.data.gifts || []).forEach(g => {
            if ((g.type || 'gift') === 'expense' && g.expenseCat) {
                const mapped = LEGACY_EXPENSE_CAT_MAP[g.expenseCat] || g.expenseCat;
                if (mapped && mapped.trim()) set.add(mapped.trim());
            }
        });

        return Array.from(set);
    },

    migrateExpenseCategories: () => {
        if (core.data.config && Array.isArray(core.data.config.expenseCategories)) {
            const cleaned = [];
            let hadLegacy = false;
            core.data.config.expenseCategories.forEach(cat => {
                const mapped = LEGACY_EXPENSE_CAT_MAP[cat] || cat;
                if (mapped !== cat) hadLegacy = true;
                if (mapped && !cleaned.includes(mapped)) cleaned.push(mapped);
            });
            if (hadLegacy && !cleaned.includes("📦 Logística i Preparatius")) {
                const idx = cleaned.indexOf("✨ Decoració i Tradicions");
                if (idx > -1) cleaned.splice(idx + 1, 0, "📦 Logística i Preparatius");
                else cleaned.push("📦 Logística i Preparatius");
            }
            core.data.config.expenseCategories = cleaned;
        }

        (core.data.gifts || []).forEach(g => {
            if ((g.type || 'gift') === 'expense' && g.expenseCat && LEGACY_EXPENSE_CAT_MAP[g.expenseCat]) {
                g.expenseCat = LEGACY_EXPENSE_CAT_MAP[g.expenseCat];
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
                    }
                });
            });
        });

        core.expenseCategories = core.getExpenseCategories();
    },

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

    getStateCssKey: (st) => {
        const map = {
            'Idea': 'idea',
            'Decidit': 'decidit',
            'Comprat/Delivery': 'delivery',
            'El tenim': 'tenim',
            'Embolicat': 'embolicat',
            'Confirmat': 'confirmat',
            'Descartat': 'descartat'
        };
        return map[st] || 'idea';
    },

    getTodayIsoDate: () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    formatShortDate: (isoStr) => {
        if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr || '';
        const [, m, d] = isoStr.split('-');
        const months = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'];
        const idx = parseInt(m, 10) - 1;
        return `${parseInt(d, 10)} ${months[idx] || m}`;
    },

    getDeliveryMeta: (g, d) => {
        if (d.isExpense || !d.deliveryDate) return null;
        if (g.state === 'El tenim' || g.state === 'Embolicat') {
            return { date: d.deliveryDate, status: 'done', label: `📦 Entrega: ${core.formatShortDate(d.deliveryDate)}` };
        }
        const todayStr = core.getTodayIsoDate();
        if (d.deliveryDate < todayStr) {
            return { date: d.deliveryDate, status: 'overdue', label: `⚠️ Retard (${core.formatShortDate(d.deliveryDate)})` };
        }
        if (d.deliveryDate === todayStr) {
            return { date: d.deliveryDate, status: 'today', label: `🚚 Arriba avui` };
        }
        return { date: d.deliveryDate, status: 'upcoming', label: `🚚 Entrega: ${core.formatShortDate(d.deliveryDate)}` };
    },

    createCardElement: (g, opts = {}) => {
        const cfg = core.getConfig();
        const d = core.resolveGiftDisplay(g);
        const stateKey = core.getStateCssKey(g.state);

        const div = document.createElement('div');
        const extClass = d.isExpense ? 'expense' : (d.isOthersSecret ? 'secret' : (d.isOtherHouse ? 'altres' : ''));
        const stateClass = d.isOthersSecret ? '' : `state-${stateKey}`;
        div.className = `card ${extClass} ${stateClass}`.trim();
        div.dataset.giftId = g.id;

        if (opts.draggable && !d.isOthersSecret) {
            div.draggable = true;
            div.addEventListener('dragstart', (e) => {
                div.classList.add('dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', g.id);
                }
                if (typeof opts.onDragStart === 'function') opts.onDragStart(g, e);
            });
            div.addEventListener('dragend', (e) => {
                div.classList.remove('dragging');
                if (typeof opts.onDragEnd === 'function') opts.onDragEnd(g, e);
            });
        }

        div.onclick = () => {
            if (!d.isOthersSecret) core.openModal(g.id);
            else core.openUnlockModal(g.createdBy);
        };

        const subtitleParts = [];
        if (d.isExpense) {
            if (!opts.hideExpenseCat) {
                subtitleParts.push(`<span class="badge expense-cat">${core.escapeHtml(g.expenseCat || '🎄 Despesa')}</span>`);
            }
            if (!opts.hideEvent && g.event && g.event !== '✨ General Festes') {
                subtitleParts.push(core.escapeHtml(g.event));
            }
        } else {
            const formattedList = d.recips.map(core.formatMemberLabel);
            const fullRecipsStr = formattedList.join(', ');
            const compactRecips = formattedList.length > 3
                ? `${formattedList.slice(0, 2).join(', ')} +${formattedList.length - 2}`
                : fullRecipsStr;

            if (opts.boxPerson) {
                if (d.recips.length > 3) {
                    subtitleParts.push(`<span title="${core.escapeHtml(fullRecipsStr)}">👥 <b>Compartit (${d.recips.length})</b></span>`);
                } else if (d.recips.length > 1 || d.recips[0] !== opts.boxPerson) {
                    subtitleParts.push(`👥 <b>${core.escapeHtml(fullRecipsStr)}</b>`);
                }
            } else if (opts.isCasaAllBox) {
                const isExactCasa = cfg.casaMembers.length > 1
                    && d.recips.length === cfg.casaMembers.length
                    && cfg.casaMembers.every(m => d.recips.includes(m));
                if (!isExactCasa && compactRecips) {
                    subtitleParts.push(`<span title="${core.escapeHtml(fullRecipsStr)}">👤 <b>${core.escapeHtml(compactRecips)}</b></span>`);
                }
            } else if (compactRecips) {
                subtitleParts.push(`<span title="${core.escapeHtml(fullRecipsStr)}">👤 <b>${core.escapeHtml(compactRecips)}</b></span>`);
            }

            if (!opts.hideEvent) {
                const evText = core.escapeHtml(g.event || '❓ Per decidir');
                const roundText = (g.round && !opts.hideRound) ? ` (${core.escapeHtml(g.round)})` : '';
                subtitleParts.push(`${evText}${roundText}`);
            } else if (g.round && !opts.hideRound) {
                subtitleParts.push(`<span class="badge round-badge">🪵 ${core.escapeHtml(g.round)}</span>`);
            }
        }

        const trackingIconHtml = (!d.isOthersSecret && d.tracking)
            ? `<span class="card-tracking-icon" title="Tracking actiu">🎯</span>`
            : '';

        const stateBadgeHtml = opts.hideStateBadge
            ? ''
            : `<span class="badge ${stateKey}">${core.escapeHtml(g.state)}</span>`;

        const headerRightHtml = (trackingIconHtml || stateBadgeHtml)
            ? `<div class="card-header-right">${trackingIconHtml}${stateBadgeHtml}</div>`
            : '';

        const subtitleHtml = subtitleParts.length > 0
            ? `<div class="card-subtitle">${subtitleParts.join(' <span class="card-sep">·</span> ')}</div>`
            : '';

        let content = `
            <div class="card-header">
                <div class="card-title">${d.isExpense ? '🎄 ' : ''}${core.escapeHtml(d.titleDisplay)}</div>
                ${headerRightHtml}
            </div>
            ${subtitleHtml}
        `;

        if (!d.isOthersSecret) {
            const delivMeta = core.getDeliveryMeta(g, d);
            if (delivMeta) {
                content += `<div class="card-meta-row"><span class="badge delivery-badge ${delivMeta.status}">${core.escapeHtml(delivMeta.label)}</span></div>`;
            }

            const fromsText = d.froms.map(core.formatMemberLabel).join(', ');
            const priceFormatted = d.priceVal > 0
                ? `${g.isApprox ? '~' : ''}${Number(d.priceVal.toFixed(2)).toLocaleString('ca-ES')} €`
                : '';

            if (d.isOtherHouse) {
                if (priceFormatted) {
                    content += `<div class="card-price is-other">${priceFormatted} <span class="card-price-note">(orientatiu)</span></div>`;
                }
                const houseBadge = opts.hideOtherHouseBadge ? '' : `<span class="badge other-house">🏡 D'una altra casa</span>`;
                content += `<div class="card-from-row">${houseBadge}🤝 De part de: <b>${core.escapeHtml(fromsText || 'Altres')}</b></div>`;
            } else {
                if (priceFormatted) {
                    const approxTag = g.isApprox ? `<span class="badge approx">Aproximat</span>` : '';
                    content += `<div class="card-price ${d.isExpense ? 'is-expense' : ''}">${priceFormatted}${approxTag}</div>`;
                }

                if (!d.isExpense) {
                    const parents = cfg.parents || [];
                    const isDefaultParentsOnly = parents.length > 0
                        && d.froms.length === parents.length
                        && parents.every(p => d.froms.includes(p));
                    const isJointWithDefaultParents = d.jointContributors.length > 0
                        && parents.every(p => d.froms.includes(p))
                        && d.froms.length === parents.length + d.jointContributors.length;

                    if (fromsText && !isDefaultParentsOnly && !isJointWithDefaultParents) {
                        content += `<div class="card-from-row">🤝 De part de: <b>${core.escapeHtml(fromsText)}</b></div>`;
                    }
                    if (d.jointContributors.length > 0) {
                        const jointStr = d.jointContributors.map(core.formatMemberLabel).join(', ');
                        content += `<div class="card-meta-row"><span class="badge joint-badge">🤝 Conjunt amb: ${core.escapeHtml(jointStr)}</span></div>`;
                    }
                }
            }

            if (d.commentsDisplay && d.commentsDisplay.trim()) {
                content += `<div class="card-comment-preview">📝 ${core.escapeHtml(d.commentsDisplay.trim())}</div>`;
            }
            if (d.shopUrl && d.shopUrl.trim()) {
                content += `<div class="card-link-row"><a href="${core.escapeHtml(d.shopUrl.trim())}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="card-shop-link">🛒 Veure enllaç</a></div>`;
            }
        }

        div.innerHTML = content;
        return div;
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
        const knownCasa = budgetKeys.filter(k => !k.startsWith('Família') && !k.startsWith('Altres') && !k.startsWith('🎄') && !k.startsWith('block:') && !k.startsWith('exp:'));
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
        if (silent && Date.now() - core.lastPushAt < 25000) return true;
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
            if (payload.sha && core.supersededShas.has(payload.sha)) {
                return finishPull(true);
            }
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
                core.migrateExpenseCategories();
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
                    core.migrateExpenseCategories();
                    localStorage.setItem('nadalData', JSON.stringify(core.data));
                    core.isSyncing = false;
                    return core.pushToGithub(retryCount + 1);
                }
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const result = await res.json();
            if (result.content && result.content.sha) {
                if (core.ghSha && core.ghSha !== result.content.sha) {
                    core.supersededShas.add(core.ghSha);
                }
                core.ghSha = result.content.sha;
                core.ghEtag = null;
                core.lastPushAt = Date.now();
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
            core.migrateExpenseCategories();
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

    populateExpenseCatSelect: (selectedVal = '') => {
        const expSelect = document.getElementById('gExpenseCat');
        if (!expSelect) return;
        const cats = core.getExpenseCategories();
        core.expenseCategories = cats;
        const prev = selectedVal || expSelect.value;
        expSelect.innerHTML = '';
        cats.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.innerText = cat;
            expSelect.appendChild(opt);
        });
        if (prev && cats.includes(prev)) expSelect.value = prev;
    },

    addCustomExpenseCategory: () => {
        const raw = prompt("Nom de la nova categoria de despesa (pots incloure un emoji al principi, ex: 🎀 Embolcalls):");
        if (!raw) return;
        const clean = raw.trim();
        if (!clean) return;

        const cfg = core.getConfig();
        const current = core.getExpenseCategories();
        if (!current.includes(clean)) {
            current.push(clean);
            core.data.config = Object.assign({}, cfg, { expenseCategories: current });
            core.expenseCategories = current;
            core.saveLocal();
        }
        core.populateExpenseCatSelect(clean);
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

        recipsBox.innerHTML = '';
        fromsBox.innerHTML = '';
        shareBox.innerHTML = '';
        core.populateExpenseCatSelect();

        Object.entries(tree).forEach(([group, members]) => {
            if (!members || members.length === 0) return;

            const buildChipsGroup = (nameAttr) => `
                <div class="chip-group">
                    <div class="chip-group-title">${core.escapeHtml(group)}</div>
                    <div class="chip-group-list">
                        ${members.map(m => `
                            <label class="person-chip">
                                <input type="checkbox" name="${nameAttr}" value="${core.escapeHtml(m)}">
                                <span>${core.escapeHtml(core.formatMemberLabel(m))}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;

            recipsBox.innerHTML += buildChipsGroup('gRecipCheck');
            fromsBox.innerHTML += buildChipsGroup('gFromCheck');

            if (group !== "Especials") {
                shareBox.innerHTML += `<div class="multi-group-title">${core.escapeHtml(group)}</div>`;
                members.forEach(m => {
                    shareBox.innerHTML += `
                        <label class="multi-item">
                            <input type="checkbox" name="sharePersonCheck" value="${core.escapeHtml(m)}" onchange="app.generateShareText()">
                            <span>${core.escapeHtml(core.formatMemberLabel(m))}</span>
                        </label>`;
                });
            }
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

        const expCatsEl = document.getElementById('cfgExpenseCats');
        if (expCatsEl) expCatsEl.value = core.getExpenseCategories().join(', ');

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

        const expCatsEl = document.getElementById('cfgExpenseCats');
        const expenseCategories = expCatsEl
            ? splitClean(expCatsEl.value)
            : core.getExpenseCategories();

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
            rounds: splitClean(document.getElementById('cfgRounds').value),
            expenseCategories: expenseCategories.length ? expenseCategories : [...DEFAULT_EXPENSE_CATEGORIES]
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
                core.migrateExpenseCategories();
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

  selectUnlockUser: (userName) => {
        const sel = document.getElementById('unlockUser');
        if (sel) sel.value = userName;
        document.querySelectorAll('#unlockUserChips .unlock-user-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.user === userName);
        });
        const pinEl = document.getElementById('unlockPin');
        if (pinEl) {
            pinEl.focus();
            pinEl.select();
        }
    },

    openUnlockModal: (preselectUser = null) => {
        const cfg = core.getConfig();
        const parents = cfg.parents || [];
        const pins = core.data.pins || {};

        let chosen = preselectUser && parents.includes(preselectUser) ? preselectUser : null;
        if (!chosen && core.currentUser && parents.length > 1) {
            chosen = parents.find(p => p !== core.currentUser) || parents[0];
        }
        if (!chosen) chosen = parents[0] || '';

        const chipsWrap = document.getElementById('unlockUserChips');
        if (chipsWrap) {
            chipsWrap.innerHTML = parents.map(u => {
                const isActive = u === chosen;
                const safeArg = u.replace(/'/g, "\\'");
                return `<button type="button" class="unlock-user-chip ${isActive ? 'active' : ''}" data-user="${core.escapeHtml(u)}" onclick="app.selectUnlockUser('${safeArg}')">👤 ${core.escapeHtml(u)}</button>`;
            }).join('');
        }

        const sel = document.getElementById('unlockUser');
        if (sel && chosen) sel.value = chosen;

        const errEl = document.getElementById('unlockError');
        if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

        const allHavePins = parents.length > 0 && parents.every(u => Boolean(pins[u]));
        const hintEl = document.getElementById('unlockHint');
        if (hintEl) {
            hintEl.textContent = allHavePins
                ? "Escriu el teu PIN: l'app et reconeixerà automàticament."
                : "Selecciona qui ets, escriu el PIN i prem Enter.";
        }

        const pinEl = document.getElementById('unlockPin');
        if (pinEl) pinEl.value = '';

        document.getElementById('unlockModal').style.display = 'block';
        setTimeout(() => { if (pinEl) pinEl.focus(); }, 30);
    },

    completeUnlock: (u, p) => {
        core.currentUser = u;
        core.pin = p;
        document.getElementById('userStatus').innerHTML = `🕵️‍♂️ <b>${core.escapeHtml(u)}</b>`;
        document.getElementById('btnUnlock').classList.add('hidden');
        document.getElementById('btnLock').classList.remove('hidden');
        const pinEl = document.getElementById('unlockPin');
        if (pinEl) pinEl.value = '';
        core.closeModal('unlockModal');
        core.renderAll();
    },

    onUnlockPinInput: () => {
        const errEl = document.getElementById('unlockError');
        if (errEl) errEl.classList.add('hidden');

        const pinEl = document.getElementById('unlockPin');
        const p = (pinEl?.value || '').trim();
        if (!p) return;

        const cfg = core.getConfig();
        const parents = cfg.parents || [];
        const pins = core.data.pins || {};
        const selectedUser = document.getElementById('unlockUser')?.value || '';
        const allHavePins = parents.length > 0 && parents.every(u => Boolean(pins[u]));

        // Si s'està creant un PIN nou per a un usuari sense PIN, esperar a prémer Enter
        if (!allHavePins && selectedUser && !pins[selectedUser]) return;

        const exactMatches = parents.filter(u => pins[u] && String(pins[u]) === p);
        const longerPrefixMatches = parents.filter(u =>
            pins[u] && String(pins[u]).startsWith(p) && String(pins[u]).length > p.length
        );

        if (exactMatches.length === 1 && longerPrefixMatches.length === 0) {
            core.completeUnlock(exactMatches[0], p);
        }
    },

    unlock: () => {
        const cfg = core.getConfig();
        const parents = cfg.parents || [];
        if (!core.data.pins) core.data.pins = {};

        const u = document.getElementById('unlockUser')?.value || parents[0] || '';
        const pinEl = document.getElementById('unlockPin');
        const p = (pinEl?.value || '').trim();
        const errEl = document.getElementById('unlockError');

        const showErr = (msg) => {
            if (errEl) {
                errEl.textContent = msg;
                errEl.classList.remove('hidden');
            }
            if (pinEl) {
                pinEl.value = '';
                pinEl.focus();
            }
        };

        if (!p) return showErr("Escriu el teu PIN numèric.");

        // 1. Si l'usuari seleccionat encara no té PIN, el guardem comprovant que no estigui repetit
        if (!core.data.pins[u]) {
            const duplicateUser = parents.find(other => other !== u && core.data.pins[other] && String(core.data.pins[other]) === p);
            if (duplicateUser) {
                return showErr("Aquest PIN ja el fa servir un altre usuari. Tria'n un de diferent.");
            }
            core.data.pins[u] = p;
            core.saveLocal();
            return core.completeUnlock(u, p);
        }

        // 2. Comprovació contra l'usuari seleccionat
        if (String(core.data.pins[u]) === p) {
            return core.completeUnlock(u, p);
        }

        // 3. Si coincideix de manera única amb l'altre usuari, hi entrem directament
        const otherMatches = parents.filter(other => core.data.pins[other] && String(core.data.pins[other]) === p);
        if (otherMatches.length === 1) {
            return core.completeUnlock(otherMatches[0], p);
        }

        showErr("PIN incorrecte 🛑");
    },

    lock: () => {
        core.currentUser = null;
        core.pin = null;
        document.getElementById('userStatus').innerHTML = `👨‍👩‍👧‍👧 Vista Familiar`;
        document.getElementById('btnUnlock').classList.remove('hidden');
        document.getElementById('btnLock').classList.add('hidden');
        const pinEl = document.getElementById('unlockPin');
        if (pinEl) pinEl.value = '';
        core.renderAll();
    },

    /* --- [7] NAVEGACIÓ ENTRE VISTES, MODALS, TECLAT I SWIPE-DOWN REFRESH --- */
switchMainView: (view) => {
        if (view === 'list' || view === 'board') view = 'gifts';
        core.activeMainView = view;

        const navMap = {
            gifts: 'navBtnGifts',
            expenses: 'navBtnExpenses',
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

        const wideViews = ['gifts', 'expenses', 'advent'];
        const mainCont = document.getElementById('mainContainer');
        mainCont.classList.toggle('wide-view', wideViews.includes(view));
        if (view !== 'gifts' && view !== 'expenses') mainCont.classList.remove('kanban-wide');

        const activeViewObj = core.views[view];
        const hideFab = activeViewObj && typeof activeViewObj.hideFloatingBtn === 'function' ? activeViewObj.hideFloatingBtn() : false;
        document.getElementById('floatingAddBtn').classList.toggle('hidden', hideFab);

        document.getElementById('appHeader').classList.remove('header-hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (activeViewObj && typeof activeViewObj.render === 'function') activeViewObj.render();
    },

    renderAll: () => {
        core.updateBudgetHeader();
        if (core.views.gifts && typeof core.views.gifts.renderFilterPills === 'function') {
            core.views.gifts.renderFilterPills();
        }
        const activeViewObj = core.views[core.activeMainView];
        if (activeViewObj && typeof activeViewObj.render === 'function') {
            activeViewObj.render();
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

    /* --- [8] CONTROL ECONÒMIC JERÀRQUIC (3 NIVELLS), PRESSUPOSTOS I WHATSAPP --- */
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

        const personToBlock = new Map();
        const registerMembers = (members, blockId, hasLimit) => {
            (members || []).forEach(m => {
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

        // 1) Processar regals i despeses
        (core.data.gifts || []).forEach(g => {
            const d = core.resolveGiftDisplay(g);

            if (d.isOthersSecret) {
                if (d.isPaidByUs) lockedSecretsCount++;
                return;
            }
            if (!d.isPaidByUs || d.isOtherHouse) return;
            if (g.state === 'Descartat') return;

            const isPlanned = (g.state === 'Idea' || g.state === 'Decidit');
            const isSpent = d.isExpense
                ? !isPlanned
                : (!isPlanned && g.state !== 'Confirmat');

            if (!isSpent && !isPlanned) return;

            if (d.isExpense) {
                const rawCat = g.expenseCat || "🎉 Altres despeses nadalenques";
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

        // 2) Integrar Calendari d'Advent (dies 1..24 + Bateria d'idees)
        const advCat = "🗓️ Calendari d'Advent";
        const advNode = blocks.expenses.childrenMap.get(advCat);
        if (advNode) {
            Object.entries(core.data.advent || {}).forEach(([dayStr, item]) => {
                if (!item || !item.title || !item.title.trim()) return;
                const p = parseFloat(item.price) || 0;
                const isSpent = (item.state === 'Comprat');
                if (p <= 0 && !isSpent) return;
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
                const p = parseFloat(item.price) || 0;
                const isSpent = (item.state === 'Comprat');
                if (p <= 0 && !isSpent) return;
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
        const totals = {
            spent: 0,
            spentDefinitive: 0,
            spentApprox: 0,
            planned: 0,
            limit: 0,
            lastYear: 0,
            lockedSecretsCount
        };
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

        totals.spentDefinitive = Math.max(0, totals.spent - totals.spentApprox);

        return { blocks: blockList, totals };
    },

    updateBudgetHeader: () => {
        const { totals } = core.computeEconomicTree();
        const execPct = totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;

        const pctEl = document.getElementById('budgetPct');
        if (pctEl) pctEl.innerText = `${execPct}%`;

        const pillEl = document.getElementById('budgetPillBtn');
        if (pillEl) pillEl.classList.toggle('is-over', execPct > 100);

        const barEl = document.getElementById('headerProgressBar');
        if (barEl) {
            barEl.style.width = `${Math.min(execPct, 100)}%`;
            barEl.classList.toggle('is-over', execPct > 100);
        }
    },

    openBudgetsModal: (defaultTab = 'ratios') => {
        core.renderEconInputsTab('limits');
        core.renderEconInputsTab('lastYear');
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
        if (tabName === 'ratios') core.renderRatiosTab();
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
            ? `<div class="econ-secret-note">🔒 Hi ha ${totals.lockedSecretsCount} ${totals.lockedSecretsCount === 1 ? 'regal sorpresa bloquejat' : 'regals sorpresa bloquejats'} que no sumen fins a desbloquejar.</div>`
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
        const stateIcon = it.state === 'Embolicat' ? '🎀'
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

    getLimitDeltaMeta: (limitVal, lyVal) => {
        if (!limitVal || limitVal <= 0) return { text: '', cls: '', inputCls: '' };
        if (!lyVal || lyVal <= 0) return { text: 'Nou', cls: 'is-new', inputCls: '' };

        const diff = limitVal - lyVal;
        if (Math.abs(diff) < 0.01) {
            return { text: '= Igual', cls: 'is-same', inputCls: 'is-same' };
        }
        const pct = Math.round((diff / lyVal) * 100);
        const pctStr = pct !== 0 ? ` (${diff > 0 ? '+' : ''}${pct}%)` : '';
        if (diff > 0) {
            return {
                text: `▲ +${core.formatMoney(diff)}${pctStr}`,
                cls: 'is-higher',
                inputCls: 'is-higher'
            };
        }
        return {
            text: `▼ -${core.formatMoney(Math.abs(diff))}${pctStr}`,
            cls: 'is-lower',
            inputCls: 'is-lower'
        };
    },

    renderEconInputsTab: (mode) => {
        const { blocks, totals } = core.computeEconomicTree();
        const contId = mode === 'limits' ? 'budgetInputsContainer' : 'lastYearInputsContainer';
        const container = document.getElementById(contId);
        if (!container) return;

        const isLimits = (mode === 'limits');
        const store = isLimits ? (core.data.budgets || {}) : (core.data.lastYear || {});
        const labelTitle = isLimits ? 'Total Límits Enguany' : 'Total Any Passat';

        let html = `
            <div class="econ-total-live-bar">
                <div class="econ-bar-main">
                    <span>${labelTitle}:</span>
                    <b id="econGrandTotal_${mode}" data-grand-ly="${totals.lastYear}">0,00 €</b>
                </div>
                ${isLimits && totals.lastYear > 0 ? `
                    <div class="econ-bar-sub">
                        <span>📅 Any passat: ${core.formatMoney(totals.lastYear)}</span>
                        <span id="econGrandDiff_${mode}" class="econ-bar-delta"></span>
                    </div>
                ` : ''}
            </div>
        `;

        blocks.forEach(b => {
            if (b.limitMode === 'children' && b.children.length === 0) return;

            if (b.limitMode === 'block') {
                const rawVal = core.getStoredEconVal(store, b.key, b.fallbacks || []);
                const displayVal = rawVal > 0 ? String(rawVal).replace('.', ',') : '';
                const safeKey = core.escapeHtml(b.key);
                const hint = b.id === 'altres'
                    ? 'Amics, detalls puntuals o sense assignar'
                    : 'Import global del bloc (absorbeix amic invisible rotatiu)';
                const refHtml = isLimits
                    ? `<div class="econ-ref-line">
                            <span class="econ-ref-ly">📅 Any passat: ${b.lastYear > 0 ? core.formatMoney(b.lastYear) : '—'}</span>
                            <span class="econ-ref-delta"></span>
                       </div>`
                    : '';

                html += `
                    <div class="econ-input-block">
                        <div class="econ-input-block-head is-single">
                            <div class="econ-row-info">
                                <div class="econ-input-block-title">${b.icon} ${core.escapeHtml(b.title)}</div>
                                <div class="cfg-hint">${hint}</div>
                                ${refHtml}
                            </div>
                            <input type="text" inputmode="decimal" class="econ-num-input"
                                data-econ-mode="${mode}" data-econ-block="${b.id}" data-econ-key="${safeKey}"
                                data-last-year="${b.lastYear}"
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
                        <div>
                            <span class="econ-input-block-title">${b.icon} ${core.escapeHtml(b.title)}</span>
                            ${isLimits && b.lastYear > 0 ? `<div class="econ-head-ly">📅 Any passat: ${core.formatMoney(b.lastYear)}</div>` : ''}
                        </div>
                        <div class="econ-head-right">
                            <span class="econ-input-subtotal" id="econSub_${mode}_${b.id}" data-block-ly="${b.lastYear}">0,00 €</span>
                            ${isLimits ? `<span class="econ-ref-delta" id="econSubDiff_${mode}_${b.id}"></span>` : ''}
                        </div>
                    </div>
                    <div class="econ-input-rows">
            `;

            b.children.forEach(c => {
                const fallbacks = c.key.startsWith('exp:') ? [c.rawName] : [];
                const rawVal = core.getStoredEconVal(store, c.key, fallbacks);
                const displayVal = rawVal > 0 ? String(rawVal).replace('.', ',') : '';
                const safeKey = core.escapeHtml(c.key);
                const refHtml = isLimits
                    ? `<div class="econ-ref-line">
                            <span class="econ-ref-ly">📅 ${c.lastYear > 0 ? core.formatMoney(c.lastYear) : '0,00 €'}</span>
                            <span class="econ-ref-delta"></span>
                       </div>`
                    : '';

                html += `
                    <div class="budget-row">
                        <div class="econ-row-info">
                            <span class="econ-row-label">${core.escapeHtml(c.label)}</span>
                            ${refHtml}
                        </div>
                        <input type="text" inputmode="decimal" class="econ-num-input"
                            data-econ-mode="${mode}" data-econ-block="${b.id}" data-econ-key="${safeKey}"
                            data-last-year="${c.lastYear}"
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
        const isLimits = (mode === 'limits');
        const inputs = document.querySelectorAll(`input[data-econ-mode="${mode}"]`);
        const blockSums = {};
        let grandTotal = 0;

        inputs.forEach(inp => {
            const parsed = core.parseMoneyInput(inp.value);
            const val = Number.isNaN(parsed) ? 0 : parsed;
            const blk = inp.dataset.econBlock;
            blockSums[blk] = (blockSums[blk] || 0) + val;
            grandTotal += val;

            if (isLimits) {
                const ly = parseFloat(inp.dataset.lastYear) || 0;
                const meta = core.getLimitDeltaMeta(val, ly);
                inp.classList.remove('is-higher', 'is-lower', 'is-same');
                if (meta.inputCls) inp.classList.add(meta.inputCls);

                const row = inp.closest('.budget-row, .econ-input-block-head');
                const deltaEl = row ? row.querySelector('.econ-ref-delta') : null;
                if (deltaEl) {
                    deltaEl.innerText = meta.text;
                    deltaEl.className = `econ-ref-delta ${meta.cls}`.trim();
                }
            }
        });

        Object.entries(blockSums).forEach(([blk, sum]) => {
            const el = document.getElementById(`econSub_${mode}_${blk}`);
            if (el) {
                el.innerText = core.formatMoney(sum);
                if (isLimits) {
                    const bLy = parseFloat(el.dataset.blockLy) || 0;
                    const meta = core.getLimitDeltaMeta(sum, bLy);
                    const diffEl = document.getElementById(`econSubDiff_${mode}_${blk}`);
                    if (diffEl) {
                        diffEl.innerText = meta.text;
                        diffEl.className = `econ-ref-delta ${meta.cls}`.trim();
                    }
                }
            }
        });

        const totalEl = document.getElementById(`econGrandTotal_${mode}`);
        if (totalEl) {
            totalEl.innerText = core.formatMoney(grandTotal);
            if (isLimits) {
                const gLy = parseFloat(totalEl.dataset.grandLy) || 0;
                const meta = core.getLimitDeltaMeta(grandTotal, gLy);
                const gDiffEl = document.getElementById(`econGrandDiff_${mode}`);
                if (gDiffEl) {
                    gDiffEl.innerText = meta.text;
                    gDiffEl.className = `econ-bar-delta ${meta.cls}`.trim();
                }
            }
        }
    },

    saveBudgets: (closeAfter = false) => {
        const next = Object.assign({}, core.data.budgets || {});
        document.querySelectorAll('input[data-econ-mode="limits"]').forEach(inp => {
            const key = inp.dataset.econKey;
            const val = core.parseMoneyInput(inp.value);
            if (!Number.isNaN(val) && val > 0) next[key] = Number(val.toFixed(2));
            else delete next[key];
        });
        core.data.budgets = next;
        core.saveLocal();
        core.renderEconInputsTab('limits');
        core.renderRatiosTab();
        core.renderAll();
        if (closeAfter) core.closeModal('budgetsModal');
        else core.switchBudgetTab('ratios');
    },

    saveLastYear: (closeAfter = false) => {
        const next = Object.assign({}, core.data.lastYear || {});
        document.querySelectorAll('input[data-econ-mode="lastYear"]').forEach(inp => {
            const key = inp.dataset.econKey;
            const val = core.parseMoneyInput(inp.value);
            if (!Number.isNaN(val) && val > 0) next[key] = Number(val.toFixed(2));
            else delete next[key];
        });
        core.data.lastYear = next;
        core.saveLocal();
        core.renderEconInputsTab('lastYear');
        core.renderEconInputsTab('limits');
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

        const publicGifts = core.data.gifts.filter(g => (g.type || 'gift') === 'gift' && !g.isSecret && g.state !== 'Descartat');
        
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

    /* --- [9] FORMULARI DE REGALS/DESPESES (TRACKING + DECIMALS + CATEGORIES) --- */
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
        const isTracking = Boolean(document.getElementById('gTracking')?.checked);
        const stateSel = document.getElementById('gState');
        const lblState = document.getElementById('lblState');
        const lblPrice = document.getElementById('lblPrice');
        const paidBox = document.getElementById('paidByUsLabel');
        const paidText = document.getElementById('paidByUsText');

        if (isGift && !isPaidByUs) {
            paidBox.classList.add('is-other-house');
            paidText.innerText = "🏡 D'una altra casa (No suma al nostre pressupost)";
            lblPrice.innerText = "Preu orientatiu (€) (Opcional, no suma):";

            if (isTracking) {
                lblState.innerText = "Estat (Altra casa · 🎯 en fem seguiment):";
                const allowed = ['Idea', 'Decidit', 'Comprat/Delivery', 'El tenim', 'Embolicat', 'Confirmat', 'Descartat'];
                stateSel.innerHTML = `
                    <option value="Idea">💡 Idea / Proposta</option>
                    <option value="Decidit">🎯 Decidit, pendent de comprar</option>
                    <option value="Comprat/Delivery">🚚 Comprat / En camí</option>
                    <option value="El tenim">✅ El tenim</option>
                    <option value="Embolicat">🎀 Embolicat</option>
                    <option value="Confirmat">🤝 Confirmat</option>
                    <option value="Descartat">🚫 Descartat (No suma ni es mostra)</option>
                `;
                stateSel.value = (desiredState && allowed.includes(desiredState)) ? desiredState : 'Decidit';
            } else {
                lblState.innerText = "Estat (Regal d'una altra casa):";
                stateSel.innerHTML = `
                    <option value="Idea">💡 Idea / Proposta</option>
                    <option value="Confirmat">🤝 Confirmat</option>
                    <option value="Descartat">🚫 Descartat (No suma ni es mostra)</option>
                `;
                stateSel.value = (desiredState && ['Idea', 'Confirmat', 'Descartat'].includes(desiredState)) ? desiredState : 'Confirmat';
            }
        } else {
            paidBox.classList.remove('is-other-house');
            paidText.innerText = "💰 Ho paguem nosaltres (Anotar la nostra aportació)";
            lblState.innerText = "Estat (Idees, Decidits i Descartats no sumen a Gastat):";
            lblPrice.innerText = "Preu (€ — nostra part) i Tipus d'Import:";

            const allowed = ['Idea', 'Decidit', 'Comprat/Delivery', 'El tenim', 'Embolicat', 'Descartat'];
            stateSel.innerHTML = `
                <option value="Idea">💡 Idea / Previst (No suma despesa)</option>
                <option value="Decidit">🎯 Decidit, pendent de comprar</option>
                <option value="Comprat/Delivery">🚚 Comprat / Pagat</option>
                <option value="El tenim">✅ El tenim</option>
                <option value="Embolicat">🎀 Embolicat</option>
                <option value="Descartat">🚫 Descartat (No suma ni es mostra)</option>
            `;
            if (desiredState && allowed.includes(desiredState)) {
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

    onTrackingChange: () => {
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
        document.getElementById('giftModalGrid')?.classList.toggle('is-expense-mode', !isGift);

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
        document.getElementById('gTitle').placeholder = isGift ? "Ex: Bicicleta vermella" : "Ex: Dinar Santa Llúcia, Paper d'embolicar, Arbre...";
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

        if (targetType === 'expenseCat') {
            core.setItemType('expense', 'Idea');
            if (targetValue) {
                core.populateExpenseCatSelect(targetValue);
                document.getElementById('gExpenseCat').value = targetValue;
            }
            return;
        }

        core.setItemType('gift', 'Idea');
        const recipChecks = document.querySelectorAll('input[name="gRecipCheck"]');

        if (targetType === 'person' && targetValue) {
            recipChecks.forEach(c => { if (c.value === targetValue) c.checked = true; });
        } else if (targetType === 'casa4') {
            recipChecks.forEach(c => { if (cfg.casaMembers.includes(c.value)) c.checked = true; });
        } else if (targetType === 'altres') {
            recipChecks.forEach(c => { if (c.value === 'Amics/Altres') c.checked = true; });
        } else if (targetType === 'state' && targetValue) {
            core.updateStateOptions(targetValue);
        } else if (targetType === 'event' && targetValue) {
            document.getElementById('gEvent').value = targetValue;
            core.toggleRounds();
        }

        if (targetType !== 'event' && core.views.gifts && core.views.gifts.selectedEvent && core.views.gifts.selectedEvent !== 'all') {
            document.getElementById('gEvent').value = core.views.gifts.selectedEvent;
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
            core.populateExpenseCatSelect();
            document.getElementById('gPaidByUs').checked = true;
            document.getElementById('gTracking').checked = false;

            if (core.activeMainView === 'santallucia') {
                core.setItemType('expense', 'Idea');
                document.getElementById('gExpenseCat').value = '🍲 Dinar de Santa Llúcia';
            } else if (core.activeMainView === 'expenses') {
                core.setItemType('expense', 'Idea');
                const activeCat = core.views.expenses?.selectedCat;
                if (activeCat && activeCat !== 'all') {
                    core.populateExpenseCatSelect(activeCat);
                    document.getElementById('gExpenseCat').value = activeCat;
                }
            } else {
                core.setItemType('gift', 'Idea');
                const activeEv = core.views.gifts?.selectedEvent;
                document.getElementById('gEvent').value = (activeEv && activeEv !== 'all') ? activeEv : '❓ Per decidir';
            }

            document.getElementById('giftId').value = '';
            document.getElementById('gTitle').value = '';
            document.getElementById('gPrice').value = '';
            document.getElementById('gPriceType').value = 'definitive';
            document.getElementById('gDeliveryDate').value = '';
            document.getElementById('gUrl').value = '';
            document.getElementById('gComments').value = '';
            document.getElementById('gSecret').checked = false;
            fromChecks.forEach(c => { if (cfg.parents.includes(c.value)) c.checked = true; });
        } else {
            const g = core.data.gifts.find(x => x.id === id);
            if (!g) return;
            const itemType = g.type || 'gift';

            document.getElementById('gTracking').checked = Boolean(g.tracking);

            if (itemType === 'expense') {
                const mappedCat = LEGACY_EXPENSE_CAT_MAP[g.expenseCat] || g.expenseCat || '🍲 Dinar de Santa Llúcia';
                core.populateExpenseCatSelect(mappedCat);
                document.getElementById('gPaidByUs').checked = true;
                document.getElementById('gExpenseCat').value = mappedCat;
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
            document.getElementById('gSecret').checked = Boolean(g.isSecret);

            const rawTitle = (g.isSecret && itemType === 'gift') ? core.decrypt(g.title, core.pin) : g.title;
            const rawPrice = (g.isSecret && itemType === 'gift') ? core.decrypt(g.price, core.pin) : g.price;
            const rawUrl = (g.isSecret && itemType === 'gift') ? core.decrypt(g.url, core.pin) : g.url;
            const rawComments = (g.isSecret && itemType === 'gift') ? core.decrypt(g.comments || '', core.pin) : (g.comments || '');

            document.getElementById('gTitle').value = rawTitle || '';
            document.getElementById('gPrice').value = (rawPrice !== undefined && rawPrice !== null && String(rawPrice) !== '')
                ? String(rawPrice).replace('.', ',')
                : '';
            document.getElementById('gUrl').value = rawUrl || '';
            document.getElementById('gComments').value = rawComments || '';
        }

        core.toggleRounds();
        core.toggleDeliveryField();
        document.getElementById('giftModal').style.display = 'block';
        document.querySelector('#giftModal .gift-modal-body')?.scrollTo(0, 0);
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
        const tracking = Boolean(document.getElementById('gTracking')?.checked);

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
        const parsedPrice = core.parseMoneyInput(document.getElementById('gPrice').value);
        let price = (!Number.isNaN(parsedPrice) && parsedPrice > 0) ? String(Number(parsedPrice.toFixed(2))) : '';
        const isApprox = document.getElementById('gPriceType').value === 'approx';
        let url = document.getElementById('gUrl').value.trim();
        let comments = document.getElementById('gComments').value;

        if (isSecret && core.currentUser && itemType === 'gift') {
            title = core.crypt(title, core.pin);
            price = core.crypt(price, core.pin);
            url = core.crypt(url, core.pin);
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
            comments,
            isSecret,
            paidByUs,
            tracking,
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
        const rawPriceStr = isOthersSecret ? '' : (g.isSecret ? core.decrypt(g.price, core.pin) : g.price);
        const parsedPrice = core.parseMoneyInput(rawPriceStr);
        const priceVal = Number.isNaN(parsedPrice) ? 0 : parsedPrice;
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
        const tracking = Boolean(g.tracking);

        return {
            isExpense,
            isOthersSecret,
            titleDisplay,
            priceVal,
            shopUrl,
            commentsDisplay,
            recips,
            froms,
            isPaidByUs,
            isReceivedFromOthers,
            isOtherHouse,
            jointContributors,
            deliveryDate,
            tracking
        };
    }
};

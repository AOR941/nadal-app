        const DEFAULT_FAMILY_CONFIG = {
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

        const app = {
            data: { gifts: [], deletedIds: [], budgets: {}, lastYear: {}, pins: {}, config: null, lastUpdate: 'Mai' },
            ghConfig: { owner: '', repo: 'nadal-dades', path: 'dades.json', token: '' },
            ghSha: null,
            ghEtag: null,
            isSyncing: false,
            pollTimer: null,

            currentUser: null, 
            pin: null,
            activeMainView: 'list',
            activeBudgetTab: 'ratios',
            activeConfigTab: 'github',
            
            expenseCategories: [
                "🍲 Dinar de Santa Llúcia",
                "🍽️ Àpats i Begudes",
                "✨ Decoració i Arbre",
                "🪵 Tradicions (Tió, Reis, Pessebre)",
                "✉️ Postals de Nadal",
                "🎉 Altres despeses nadalenques"
            ],

            getConfig: () => {
                return Object.assign({}, DEFAULT_FAMILY_CONFIG, app.data.config || {});
            },

            getBudgetCategories: () => {
                const cfg = app.getConfig();
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
                const cfg = app.getConfig();
                const bigTioIcon = (cfg.bigTioName || "🪵 Tió Família").split(' ')[0];
                return [
                    { name: "🎄 Tió Casa", icon: "🎄" },
                    { name: cfg.bigTioName, icon: bigTioIcon },
                    { name: "🎅 Pare Noel", icon: "🎅" },
                    { name: "👑 Reis", icon: "👑" },
                    { name: "❓ Per decidir", icon: "❓" }
                ];
            },

            // Helper UTF-8 Base64 per a l'API de GitHub (suporta accents i emojis)
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

            // Motor criptogràfic Top Secret (compatible amb versions anteriors)
            crypt: (text, key) => {
                if (!text) return '';
                let res = '';
                for (let i = 0; i < text.length; i++) res += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                return btoa(res);
            },
            decrypt: (base64, key) => {
                if (!base64) return '';
                try {
                    let text = atob(base64);
                    let res = '';
                    for (let i = 0; i < text.length; i++) res += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                    return res;
                } catch(e) { return ''; }
            },

            // Extreu automàticament els noms si s'importa un JSON d'una versió anterior sense config
            inferConfigFromLegacyData: (imported) => {
                const cfg = JSON.parse(JSON.stringify(DEFAULT_FAMILY_CONFIG));
                const pinUsers = Object.keys(imported.pins || {});
                if (pinUsers.length >= 2) cfg.parents = pinUsers.slice(0, 2);

                const budgetKeys = Object.keys(imported.budgets || {});
                const knownCasa = budgetKeys.filter(k => !k.startsWith('Família') && !k.startsWith('Altres') && !k.startsWith('🎄'));
                if (knownCasa.length >= 2) {
                    cfg.casaMembers = knownCasa;
                }

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

                // Repartim la resta de persones detectades perquè no es perdin al Mapa
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
                const cfg = app.getConfig();
                if (cfg.casaMembers.includes(person)) return person;
                if (cfg.dir1Members.includes(person)) return cfg.dir1Name;
                if (cfg.dir2Members.includes(person)) return cfg.dir2Name;
                if (cfg.ext1Members.includes(person) || cfg.ext2Members.includes(person)) {
                    return `Família Extensa (${cfg.ext1Name} / ${cfg.ext2Name})`;
                }
                return "Altres / Amics";
            },

            buildDynamicUI: () => {
                const cfg = app.getConfig();

                // 1. Selector usuaris PIN
                const unlockSel = document.getElementById('unlockUser');
                const prevUser = unlockSel.value;
                unlockSel.innerHTML = '';
                cfg.parents.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p; opt.innerText = p;
                    unlockSel.appendChild(opt);
                });
                if (cfg.parents.includes(prevUser)) unlockSel.value = prevUser;

                // 2. Selectors d'esdeveniments i rondes
                const events = [
                    "❓ Per decidir",
                    "🎄 Tió Casa",
                    cfg.bigTioName,
                    "🎅 Pare Noel",
                    "👑 Reis",
                    "✨ General Festes"
                ];

                const gEv = document.getElementById('gEvent');
                const fEv = document.getElementById('eventFilter');
                const bEv = document.getElementById('boardEventFilter');
                const prevGEv = gEv.value, prevFEv = fEv.value, prevBEv = bEv.value;

                gEv.innerHTML = '';
                fEv.innerHTML = '<option value="all">Tots els esdeveniments</option>';
                bEv.innerHTML = '<option value="all">📅 Tots els esdeveniments</option>';

                events.forEach(ev => {
                    gEv.innerHTML += `<option value="${ev}">${ev}</option>`;
                    fEv.innerHTML += `<option value="${ev}">${ev === cfg.bigTioName ? ev + ' (Rondes)' : ev}</option>`;
                    if (ev !== "✨ General Festes") {
                        bEv.innerHTML += `<option value="${ev}">${ev}</option>`;
                    }
                });
                if (prevGEv) gEv.value = prevGEv;
                if (prevFEv) fEv.value = prevFEv;
                if (prevBEv) bEv.value = prevBEv;

                const gRound = document.getElementById('gRound');
                const prevRound = gRound.value;
                gRound.innerHTML = '';
                cfg.rounds.forEach(r => {
                    gRound.innerHTML += `<option value="${r}">${r}</option>`;
                });
                if (prevRound && cfg.rounds.includes(prevRound)) gRound.value = prevRound;

                // 3. Presets compartir idees
                const kids = cfg.casaMembers.filter(m => !cfg.parents.includes(m));
                const presetKidsBtn = document.getElementById('presetKidsBtn');
                presetKidsBtn.innerText = kids.length > 0 ? `👧👦 ${kids.join(' i ')}` : '👧👦 Fills';

                // 4. Arbre de persones (Per a qui, De part de qui, Compartir, Filtre)
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
                const filter = document.getElementById('personFilter');
                const expSelect = document.getElementById('gExpenseCat');
                const prevPersonFilter = filter.value;

                recipsBox.innerHTML = '';
                fromsBox.innerHTML = '';
                shareBox.innerHTML = '';
                filter.innerHTML = '<option value="all">Per a tothom</option>';
                expSelect.innerHTML = '';

                app.expenseCategories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat; opt.innerText = cat;
                    expSelect.appendChild(opt);
                });

                Object.entries(tree).forEach(([group, members]) => {
                    if (!members || members.length === 0) return;
                    recipsBox.innerHTML += `<div class="multi-group-title">${group}</div>`;
                    fromsBox.innerHTML += `<div class="multi-group-title">${group}</div>`;
                    if (group !== "Especials") {
                        shareBox.innerHTML += `<div class="multi-group-title">${group}</div>`;
                    }
                    
                    const optGroup = document.createElement('optgroup');
                    optGroup.label = group;

                    members.forEach(m => {
                        let htmlItem = (nameAttr, onChg = '') => `
                            <label class="multi-item">
                                <input type="checkbox" name="${nameAttr}" value="${m}" ${onChg}>
                                <span>${m}</span>
                            </label>`;
                        
                        recipsBox.innerHTML += htmlItem('gRecipCheck');
                        fromsBox.innerHTML += htmlItem('gFromCheck');
                        if (group !== "Especials") {
                            shareBox.innerHTML += htmlItem('sharePersonCheck', 'onchange="app.generateShareText()"');
                        }
                        
                        const opt = document.createElement('option');
                        opt.value = m; opt.innerText = m;
                        optGroup.appendChild(opt);
                    });
                    filter.appendChild(optGroup);
                });
                if (prevPersonFilter) filter.value = prevPersonFilter;
            },

            // --- MOTOR DE SINCRONITZACIÓ AMB GITHUB ---
            isGithubConfigured: () => {
                return Boolean(app.ghConfig.owner && app.ghConfig.repo && app.ghConfig.token);
            },

            setCloudStatus: (state, text) => {
                const el = document.getElementById('cloudStatusBadge');
                const icons = { local: '⚪', syncing: '🟡', ok: '🟢', error: '🔴' };
                el.innerText = `${icons[state] || '⚪'} ${text}`;
            },

            persistGithubConfig: () => {
                const jsonStr = JSON.stringify(app.ghConfig);
                try {
                    localStorage.setItem('nadalGithubConfig', jsonStr);
                } catch (e) {}
                const encoded = encodeURIComponent(app.ghEncodeBase64(jsonStr));
                document.cookie = `nadalGhCfg=${encoded}; max-age=31536000; path=/; SameSite=Lax`;
            },

            loadGithubConfig: () => {
                const hash = window.location.hash || '';
                if (hash.startsWith('#setup=')) {
                    try {
                        const b64 = decodeURIComponent(hash.slice(7));
                        const parsed = JSON.parse(app.ghDecodeBase64(b64));
                        if (parsed && parsed.owner && parsed.token) {
                            app.ghConfig = Object.assign({}, app.ghConfig, parsed);
                            app.persistGithubConfig();
                            return;
                        }
                    } catch (e) {}
                }

                const raw = localStorage.getItem('nadalGithubConfig');
                if (raw) {
                    try {
                        app.ghConfig = Object.assign({}, app.ghConfig, JSON.parse(raw));
                        return;
                    } catch (e) {}
                }

                const cookieMatch = document.cookie.match(/(?:^|;\s*)nadalGhCfg=([^;]+)/);
                if (cookieMatch) {
                    try {
                        const parsed = JSON.parse(app.ghDecodeBase64(decodeURIComponent(cookieMatch[1])));
                        if (parsed && parsed.owner && parsed.token) {
                            app.ghConfig = Object.assign({}, app.ghConfig, parsed);
                            try { localStorage.setItem('nadalGithubConfig', JSON.stringify(app.ghConfig)); } catch (e) {}
                        }
                    } catch (e) {}
                }
            },

            copyMagicLink: () => {
                const cfg = {
                    owner: document.getElementById('ghOwner').value.trim() || app.ghConfig.owner,
                    repo: document.getElementById('ghRepo').value.trim() || app.ghConfig.repo || 'nadal-dades',
                    path: document.getElementById('ghPath').value.trim() || app.ghConfig.path || 'dades.json',
                    token: document.getElementById('ghToken').value.trim() || app.ghConfig.token
                };
                if (!cfg.owner || !cfg.token) {
                    return alert("Primer escriu l'usuari i el Token de GitHub!");
                }
                const baseUrl = window.location.origin + window.location.pathname;
                const payload = encodeURIComponent(app.ghEncodeBase64(JSON.stringify(cfg)));
                const magicUrl = `${baseUrl}#setup=${payload}`;

                const btn = document.getElementById('btnMagicLink');
                const markDone = () => {
                    btn.innerText = '✅ Enllaç Màgic copiat!';
                    setTimeout(() => { btn.innerText = '🔗 Copiar Enllaç Màgic (per al mòbil)'; }, 2500);
                };

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(magicUrl).then(markDone).catch(() => {
                        prompt("Copia aquest enllaç màgic:", magicUrl);
                    });
                } else {
                    prompt("Copia aquest enllaç màgic:", magicUrl);
                }
            },

            getGithubApiUrl: () => {
                const owner = encodeURIComponent(app.ghConfig.owner.trim());
                const repo = encodeURIComponent(app.ghConfig.repo.trim());
                const path = app.ghConfig.path.trim().split('/').map(encodeURIComponent).join('/');
                return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
            },

            // Fusiona dades remotes i locals sense perdre res si hi ha conflicte de versió
            mergeDataObjects: (remote, local) => {
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

                return {
                    gifts: Array.from(giftsMap.values()),
                    deletedIds: Array.from(mergedDeleted),
                    budgets: Object.assign({}, remote.budgets || {}, local.budgets || {}),
                    lastYear: Object.assign({}, remote.lastYear || {}, local.lastYear || {}),
                    pins: Object.assign({}, remote.pins || {}, local.pins || {}),
                    config: local.config || remote.config || null,
                    lastUpdate: new Date().toLocaleString('ca-ES')
                };
            },

            pullFromGithub: async (silent = false) => {
                if (!app.isGithubConfigured() || app.isSyncing) return false;
                app.isSyncing = true;
                if (!silent) app.setCloudStatus('syncing', 'Sincronitzant amb GitHub...');

                try {
                    const headers = {
                        'Authorization': `Bearer ${app.ghConfig.token.trim()}`,
                        'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28'
                    };
                    if (app.ghEtag && silent) headers['If-None-Match'] = app.ghEtag;

                    const res = await fetch(app.getGithubApiUrl(), {
                        method: 'GET',
                        headers,
                        cache: 'no-store'
                    });

                    if (res.status === 304) {
                        const nowTime = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        app.setCloudStatus('ok', `Connectat (${nowTime})`);
                        app.isSyncing = false;
                        return true;
                    }

                    if (res.status === 404) {
                        app.ghSha = null;
                        app.setCloudStatus('ok', 'Núvol connectat (arxiu nou)');
                        app.isSyncing = false;
                        return true;
                    }

                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const newEtag = res.headers.get('ETag');
                    if (newEtag) app.ghEtag = newEtag;

                    const payload = await res.json();
                    const remoteChanged = (payload.sha !== app.ghSha);
                    app.ghSha = payload.sha;

                    if (remoteChanged && payload.content) {
                        const decodedStr = app.ghDecodeBase64(payload.content);
                        const remoteData = JSON.parse(decodedStr);
                        app.data = Object.assign({ gifts: [], deletedIds: [], budgets: {}, lastYear: {}, pins: {}, config: null }, remoteData);
                        localStorage.setItem('nadalData', JSON.stringify(app.data));
                        document.getElementById('lastSync').innerText = app.data.lastUpdate || 'Ara';
                        app.buildDynamicUI();
                        app.renderAll();
                    }

                    const nowTime = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    app.setCloudStatus('ok', `Sincronitzat (${nowTime})`);
                    app.isSyncing = false;
                    return true;
                } catch (err) {
                    app.setCloudStatus('error', `Error núvol (${err.message})`);
                    app.isSyncing = false;
                    return false;
                }
            },

            pushToGithub: async (retryCount = 0) => {
                if (!app.isGithubConfigured()) return;
                app.isSyncing = true;
                app.setCloudStatus('syncing', 'Guardant al núvol...');

                try {
                    const jsonStr = JSON.stringify(app.data, null, 2);
                    const body = {
                        message: `Actualització Nadal Tracker (${app.data.lastUpdate})`,
                        content: app.ghEncodeBase64(jsonStr)
                    };
                    if (app.ghSha) body.sha = app.ghSha;

                    const res = await fetch(app.getGithubApiUrl(), {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${app.ghConfig.token.trim()}`,
                            'Accept': 'application/vnd.github+json',
                            'Content-Type': 'application/json',
                            'X-GitHub-Api-Version': '2022-11-28'
                        },
                        body: JSON.stringify(body)
                    });

                    // Si l'altre usuari ha guardat just abans (conflicte SHA 409/422), baixem, fusionem i reintentem
                    if ((res.status === 409 || res.status === 422) && retryCount < 2) {
                        const getRes = await fetch(app.getGithubApiUrl(), {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${app.ghConfig.token.trim()}`,
                                'Accept': 'application/vnd.github+json'
                            },
                            cache: 'no-store'
                        });
                        if (getRes.ok) {
                            const remotePayload = await getRes.json();
                            app.ghSha = remotePayload.sha;
                            const remoteData = JSON.parse(app.ghDecodeBase64(remotePayload.content));
                            app.data = app.mergeDataObjects(remoteData, app.data);
                            localStorage.setItem('nadalData', JSON.stringify(app.data));
                            app.isSyncing = false;
                            return app.pushToGithub(retryCount + 1);
                        }
                    }

                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const result = await res.json();
                    if (result.content && result.content.sha) {
                        app.ghSha = result.content.sha;
                        app.ghEtag = null;
                    }

                    const nowTime = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    app.setCloudStatus('ok', `Guardat al núvol (${nowTime})`);
                    app.isSyncing = false;
                } catch (err) {
                    app.setCloudStatus('error', `Error guardant (${err.message}) — Desat en local`);
                    app.isSyncing = false;
                }
            },

            manualSync: async () => {
                if (!app.isGithubConfigured()) {
                    app.openConfigModal('github');
                    return;
                }
                await app.pullFromGithub(false);
            },

            startPolling: () => {
                if (app.pollTimer) clearInterval(app.pollTimer);
                app.pollTimer = setInterval(() => {
                    if (!app.isGithubConfigured() || document.hidden) return;
                    // No sobreescrivim mentre hi ha un formulari obert
                    const anyModalOpen = ['giftModal', 'budgetsModal', 'configModal', 'shareModal'].some(
                        id => document.getElementById(id).style.display === 'block'
                    );
                    if (!anyModalOpen) {
                        app.pullFromGithub(true);
                    }
                }, 15000);
            },

            // --- INICI I PERSISTÈNCIA ---
            init: async () => {
                app.loadGithubConfig();
                const saved = localStorage.getItem('nadalData');
                if (saved) {
                    app.data = Object.assign({ gifts: [], deletedIds: [], budgets: {}, lastYear: {}, pins: {}, config: null }, JSON.parse(saved));
                    document.getElementById('lastSync').innerText = app.data.lastUpdate || 'Mai';
                }
                app.buildDynamicUI();
                app.setupModalBackdropClicks();
                app.setupKeyboardShortcuts();
                app.renderCountdown();
                app.generatePngIcons();
                app.renderAll();

                if (app.isGithubConfigured()) {
                    await app.pullFromGithub(false);
                    app.startPolling();
                } else {
                    app.setCloudStatus('local', 'Mode Local (Núvol no configurat)');
                }
            },

            saveLocal: () => {
                app.data.lastUpdate = new Date().toLocaleString('ca-ES');
                localStorage.setItem('nadalData', JSON.stringify(app.data));
                document.getElementById('lastSync').innerText = app.data.lastUpdate;
                if (app.isGithubConfigured()) {
                    app.pushToGithub();
                }
            },

            // --- MODAL CONFIGURACIÓ NÚVOL I FAMÍLIA ---
            openConfigModal: (defaultTab = 'github') => {
                document.getElementById('ghOwner').value = app.ghConfig.owner || '';
                document.getElementById('ghRepo').value = app.ghConfig.repo || 'nadal-dades';
                document.getElementById('ghPath').value = app.ghConfig.path || 'dades.json';
                document.getElementById('ghToken').value = app.ghConfig.token || '';

                const cfg = app.getConfig();
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

                app.switchConfigTab(defaultTab);
                document.getElementById('configModal').style.display = 'block';
            },

            switchConfigTab: (tabName) => {
                app.activeConfigTab = tabName;
                ['Github', 'Family'].forEach(t => {
                    const lower = t.toLowerCase();
                    document.getElementById('tabCfg' + t).classList.toggle('hidden', lower !== tabName);
                    document.getElementById('tabBtnCfg' + t).classList.toggle('active', lower === tabName);
                });
            },

            saveGithubConfig: async () => {
                app.ghConfig = {
                    owner: document.getElementById('ghOwner').value.trim(),
                    repo: document.getElementById('ghRepo').value.trim() || 'nadal-dades',
                    path: document.getElementById('ghPath').value.trim() || 'dades.json',
                    token: document.getElementById('ghToken').value.trim()
                };
                app.persistGithubConfig();
                if (window.location.hash.startsWith('#setup=')) {
                    history.replaceState(null, '', window.location.pathname);
                }                app.ghSha = null;
                app.ghEtag = null;
                app.closeModal('configModal');

                if (app.isGithubConfigured()) {
                    const ok = await app.pullFromGithub(false);
                    if (ok && app.ghSha === null && app.data.gifts.length > 0) {
                        await app.pushToGithub();
                    }
                    app.startPolling();
                } else {
                    app.setCloudStatus('local', 'Mode Local (Núvol no configurat)');
                }
            },

            saveFamilyConfig: () => {
                const splitClean = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
                const parents = splitClean(document.getElementById('cfgParents').value);
                const casa = splitClean(document.getElementById('cfgCasa').value);

                if (parents.length === 0 || casa.length === 0) {
                    return alert("Cal posar almenys un usuari amb PIN i els membres de casa.");
                }

                app.data.config = {
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

                app.buildDynamicUI();
                app.saveLocal();
                app.closeModal('configModal');
                app.renderAll();
            },

            // --- CANVI DE VISTA PRINCIPAL ---
            switchMainView: (view) => {
                app.activeMainView = view;
                const isBoard = (view === 'board');
                
                document.getElementById('viewBtnList').classList.toggle('active', !isBoard);
                document.getElementById('viewBtnBoard').classList.toggle('active', isBoard);
                
                document.getElementById('listViewSection').classList.toggle('hidden', isBoard);
                document.getElementById('boardViewSection').classList.toggle('hidden', !isBoard);
                document.getElementById('mainContainer').classList.toggle('wide-view', isBoard);
                
                if (isBoard) app.renderBoard();
                else app.renderList();
            },

            renderAll: () => {
                app.renderList();
                if (app.activeMainView === 'board') app.renderBoard();
            },

            setupModalBackdropClicks: () => {
                ['giftModal', 'budgetsModal', 'unlockModal', 'shareModal', 'configModal'].forEach(modalId => {
                    const el = document.getElementById(modalId);
                    let downOnBackdrop = false;
                    el.addEventListener('mousedown', (e) => {
                        downOnBackdrop = (e.target === el);
                    });
                    el.addEventListener('mouseup', (e) => {
                        if (downOnBackdrop && e.target === el) {
                            app.handleBackdropClick(modalId);
                        }
                        downOnBackdrop = false;
                    });
                });
            },

            handleBackdropClick: (modalId) => {
                if (modalId === 'unlockModal' || modalId === 'shareModal' || modalId === 'configModal') {
                    app.closeModal(modalId);
                    return;
                }
                if (modalId === 'budgetsModal') {
                    if (app.activeBudgetTab === 'limits') app.saveBudgets(true);
                    else if (app.activeBudgetTab === 'lastYear') app.saveLastYear(true);
                    else app.closeModal('budgetsModal');
                    return;
                }
                if (modalId === 'giftModal') {
                    const id = document.getElementById('giftId').value;
                    const title = document.getElementById('gTitle').value.trim();
                    if (!id && !title) {
                        app.closeModal('giftModal');
                        return;
                    }
                    app.saveGift();
                }
            },
            setupKeyboardShortcuts: () => {
                document.addEventListener('keydown', (e) => {
                    const openModalId = ['giftModal', 'budgetsModal', 'configModal', 'shareModal', 'unlockModal'].find(
                        id => document.getElementById(id).style.display === 'block'
                    );
                    if (!openModalId) return;

                    // ESC: Tanca la finestra sense guardar (com Cancel·lar)
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        app.closeModal(openModalId);
                        return;
                    }

                    // Ctrl + Enter (o Cmd + Enter a Mac): Guarda i tanca
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        if (openModalId === 'giftModal') {
                            app.saveGift();
                        } else if (openModalId === 'budgetsModal') {
                            if (app.activeBudgetTab === 'limits') app.saveBudgets(true);
                            else if (app.activeBudgetTab === 'lastYear') app.saveLastYear(true);
                            else app.closeModal('budgetsModal');
                        } else if (openModalId === 'configModal') {
                            if (app.activeConfigTab === 'github') app.saveGithubConfig();
                            else app.saveFamilyConfig();
                        } else if (openModalId === 'unlockModal') {
                            app.unlock();
                        } else if (openModalId === 'shareModal') {
                            app.copyShareText();
                            app.closeModal('shareModal');
                        }
                    }
                });
            },

            renderCountdown: () => {
                const el = document.getElementById('xmasCountdown');
                if (!el) return;

                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const year = (today.getMonth() === 0 && today.getDate() <= 6) ? today.getFullYear() - 1 : today.getFullYear();

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

                // Omplim tot el quadrat de vermell (iOS arrodoneix les cantonades sol)
                ctx.fillStyle = '#b3000c';
                ctx.fillRect(0, 0, 180, 180);

                // Dibuixem l'arbre de Nadal al centre
                ctx.font = '105px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🎄', 90, 98);

                const appleIcon = document.getElementById('appleTouchIcon');
                if (appleIcon) appleIcon.href = canvas.toDataURL('image/png');
            },

            // --- EXPORTAR I IMPORTAR ARXIU JSON ---
            exportData: () => {
                const str = JSON.stringify(app.data, null, 2); 
                const blob = new Blob([str], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `nadal_regals_${Date.now()}.json`; a.click();
            },
            importData: (e) => {
                const file = e.target.files[0];
                if(!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const imported = JSON.parse(ev.target.result);
                        if(!imported.budgets) imported.budgets = {};
                        if(!imported.lastYear) imported.lastYear = {};
                        if(!imported.pins) imported.pins = {};
                        if(!imported.deletedIds) imported.deletedIds = [];
                        
                        const wasMissingConfig = !imported.config;
                        if (wasMissingConfig) {
                            imported.config = app.inferConfigFromLegacyData(imported);
                        }

                        app.data = imported;
                        app.buildDynamicUI();
                        app.saveLocal();
                        app.renderAll();

                        if (wasMissingConfig) {
                            alert("Dades carregades! Revisa l'ordre dels grups familiars si cal. 🎅");
                            app.openConfigModal('family');
                        } else {
                            alert("Dades carregades i sincronitzades a la perfecció! 🎅");
                        }
                    } catch(err) { alert("Error llegint l'arxiu."); }
                };
                reader.readAsText(file);
                e.target.value = ''; 
            },

            // --- AUTENTICACIÓ I SECRETS ---
            openUnlockModal: () => document.getElementById('unlockModal').style.display = 'block',
            unlock: () => {
                const u = document.getElementById('unlockUser').value;
                const p = document.getElementById('unlockPin').value;
                if (!p) return alert("Has de posar un PIN!");
                
                if (!app.data.pins[u]) {
                    app.data.pins[u] = p;
                    app.saveLocal();
                    alert(`PIN guardat per a ${u}. Si l'oblides, el pots llegir exportant l'arxiu.`);
                } else if (app.data.pins[u] !== p) {
                    return alert("PIN incorrecte! 🛑");
                }

                app.currentUser = u; app.pin = p;
                document.getElementById('userStatus').innerHTML = `🕵️‍♂️ Sessió secreta: <b>${u}</b>`;
                document.getElementById('btnUnlock').classList.add('hidden');
                document.getElementById('btnLock').classList.remove('hidden');
                app.closeModal('unlockModal');
                app.renderAll();
            },
            lock: () => {
                app.currentUser = null; app.pin = null;
                document.getElementById('userStatus').innerHTML = `👨‍👩‍👧‍👧 Vista Familiar`;
                document.getElementById('btnUnlock').classList.remove('hidden');
                document.getElementById('btnLock').classList.add('hidden');
                document.getElementById('unlockPin').value = '';
                app.renderAll();
            },

            // --- CÀLCUL DE DESPESES I RÀTIOS ---
            calculateSpendingBreakdown: () => {
                const budgetCats = app.getBudgetCategories();
                const spentByCat = {};
                const approxByCat = {};
                budgetCats.forEach(c => {
                    spentByCat[c] = 0;
                    approxByCat[c] = 0;
                });

                const spentByExpenseCat = {};
                const pendingByExpenseCat = {};
                app.expenseCategories.forEach(ec => {
                    spentByExpenseCat[ec] = 0;
                    pendingByExpenseCat[ec] = 0;
                });

                let totalSpent = 0;
                let totalSpentDefinitive = 0;
                let totalSpentApprox = 0;

                app.data.gifts.forEach(g => {
                    const isExpense = (g.type === 'expense');
                    const isOthersSecret = (!isExpense && g.isSecret && g.createdBy !== app.currentUser);
                    const priceVal = isOthersSecret ? 0 : parseFloat(g.isSecret ? app.decrypt(g.price, app.pin) : g.price) || 0;
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
                                    const cat = app.mapPersonToBudgetCat(person);
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

                return { totalSpent, totalSpentDefinitive, totalSpentApprox, spentByCat, approxByCat, spentByExpenseCat, pendingByExpenseCat };
            },

            openBudgetsModal: (defaultTab = 'ratios') => {
                const budgetCats = app.getBudgetCategories();
                const contLimits = document.getElementById('budgetInputsContainer');
                contLimits.innerHTML = '';
                budgetCats.forEach((cat, i) => {
                    const val = app.data.budgets[cat] || '';
                    contLimits.innerHTML += `
                        <div class="budget-row">
                            <span>${cat}</span>
                            <div><input type="number" id="b_cat_${i}" value="${val}" placeholder="0"> €</div>
                        </div>`;
                });

                const contLast = document.getElementById('lastYearInputsContainer');
                contLast.innerHTML = '';
                budgetCats.forEach((cat, i) => {
                    const val = app.data.lastYear[cat] || '';
                    contLast.innerHTML += `
                        <div class="budget-row">
                            <span>${cat}</span>
                            <div><input type="number" id="ly_cat_${i}" value="${val}" placeholder="0"> €</div>
                        </div>`;
                });

                app.renderRatiosTab();
                app.switchBudgetTab(defaultTab);
                document.getElementById('budgetsModal').style.display = 'block';
            },

            switchBudgetTab: (tabName) => {
                app.activeBudgetTab = tabName;
                ['Ratios', 'Limits', 'LastYear'].forEach(t => {
                    const lower = t.charAt(0).toLowerCase() + t.slice(1);
                    document.getElementById('tab' + t).classList.toggle('hidden', lower !== tabName);
                    document.getElementById('tabBtn' + t).classList.toggle('active', lower === tabName);
                });
            },

            renderRatiosTab: () => {
                const budgetCats = app.getBudgetCategories();
                const { totalSpent, totalSpentDefinitive, totalSpentApprox, spentByCat, approxByCat, spentByExpenseCat, pendingByExpenseCat } = app.calculateSpendingBreakdown();
                let totalBudget = 0;
                Object.values(app.data.budgets || {}).forEach(v => totalBudget += (parseFloat(v) || 0));

                let totalLastYear = 0;
                Object.values(app.data.lastYear || {}).forEach(v => totalLastYear += (parseFloat(v) || 0));

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
                    const limit = parseFloat(app.data.budgets[cat]) || 0;
                    const ly = parseFloat(app.data.lastYear[cat]) || 0;

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
                const allExpenseCats = Array.from(new Set([...app.expenseCategories, ...Object.keys(spentByExpenseCat)]));
                
                let hasAnyExpenseActivity = totalExpensesSpent > 0 || Object.values(pendingByExpenseCat).some(v => v > 0);
                
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
                const budgetCats = app.getBudgetCategories();
                budgetCats.forEach((cat, i) => {
                    const val = document.getElementById('b_cat_' + i).value;
                    if(val) app.data.budgets[cat] = parseFloat(val);
                    else delete app.data.budgets[cat];
                });
                app.saveLocal();
                app.renderRatiosTab();
                app.renderAll();
                if (closeAfter) app.closeModal('budgetsModal');
                else app.switchBudgetTab('ratios');
            },

            saveLastYear: (closeAfter = false) => {
                const budgetCats = app.getBudgetCategories();
                budgetCats.forEach((cat, i) => {
                    const val = document.getElementById('ly_cat_' + i).value;
                    if(val) app.data.lastYear[cat] = parseFloat(val);
                    else delete app.data.lastYear[cat];
                });
                app.saveLocal();
                app.renderRatiosTab();
                if (closeAfter) app.closeModal('budgetsModal');
                else app.switchBudgetTab('ratios');
            },

            // --- GENERADOR D'IDEES PER COMPARTIR ---
            openShareModal: () => {
                document.getElementById('btnCopyShare').innerText = '📋 Copiar text';
                app.generateShareText();
                document.getElementById('shareModal').style.display = 'block';
            },

            selectSharePreset: (preset) => {
                const cfg = app.getConfig();
                const checks = document.querySelectorAll('input[name="sharePersonCheck"]');
                const kids = cfg.casaMembers.filter(m => !cfg.parents.includes(m));
                const casa = cfg.casaMembers;

                checks.forEach(c => {
                    if (preset === 'kids') c.checked = kids.includes(c.value);
                    else if (preset === 'casa') c.checked = casa.includes(c.value);
                    else c.checked = false;
                });
                app.generateShareText();
            },

            generateShareText: () => {
                const selectedPeople = Array.from(document.querySelectorAll('input[name="sharePersonCheck"]:checked')).map(c => c.value);
                const area = document.getElementById('shareTextArea');

                if (selectedPeople.length === 0) {
                    area.value = '';
                    return;
                }

                const incPrice = document.getElementById('shareIncPrice').checked;
                const incUrl = document.getElementById('shareIncUrl').checked;
                const incComments = document.getElementById('shareIncComments').checked;
                const incEvent = document.getElementById('shareIncEvent').checked;

                const publicIdeas = app.data.gifts.filter(g => (g.type || 'gift') === 'gift' && g.state === 'Idea' && !g.isSecret);

                let lines = ['🎁 *IDEES DE REGAL* 🎄'];
                let totalFound = 0;

                selectedPeople.forEach(person => {
                    const personIdeas = publicIdeas.filter(g => {
                        const r = g.recipients || (g.recipient ? [g.recipient] : []);
                        return r.includes(person);
                    });

                    if (personIdeas.length > 0) {
                        lines.push('');
                        lines.push(`👤 *${person.toUpperCase()}*`);

                        personIdeas.forEach(g => {
                            totalFound++;
                            let itemLine = `• ${g.title}`;

                            const priceVal = parseFloat(g.price) || 0;
                            if (incPrice && priceVal > 0) {
                                itemLine += ` (${g.isApprox ? '~' : ''}${priceVal} €)`;
                            }
                            if (incEvent && g.event && g.event !== '❓ Per decidir') {
                                itemLine += ` — _${g.event}_`;
                            }
                            lines.push(itemLine);

                            if (incUrl && g.url && g.url.trim()) {
                                lines.push(`  🔗 ${g.url.trim()}`);
                            }
                            if (incComments && g.comments && g.comments.trim()) {
                                lines.push(`  📝 ${g.comments.trim().replace(/\n+/g, ' ')}`);
                            }
                        });
                    }
                });

                if (totalFound === 0) {
                    area.value = `No hi ha cap idea de regal pendent de confirmar per a: ${selectedPeople.join(', ')}.`;
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

            // --- GESTIÓ DE REGALS I DESPESES ---
            closeModal: (id) => document.getElementById(id).style.display = 'none',

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

                    if (desiredState && ['Idea', 'Confirmat'].includes(desiredState)) {
                        stateSel.value = desiredState;
                    } else if (desiredState) {
                        stateSel.value = 'Confirmat';
                    } else {
                        stateSel.value = 'Confirmat';
                    }
                } else {
                    paidBox.classList.remove('is-other-house');
                    paidText.innerText = "💰 Ho paguem nosaltres (Suma a la despesa)";
                    lblState.innerText = "Estat (Idees i Decidits no sumen a Gastat):";
                    lblPrice.innerText = "Preu (€) i Tipus d'Import:";

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
            },

            onPaidByUsChange: () => {
                const prev = document.getElementById('gState').value;
                app.updateStateOptions(prev);
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
                    app.toggleRounds();
                }
                
                document.getElementById('lblTitle').innerText = isGift ? "Descripció (Què és?):" : "Concepte de la despesa:";
                document.getElementById('gTitle').placeholder = isGift ? "Ex: Bicicleta vermella" : "Ex: Dinar Santa Llúcia, Torrons, Arbre...";
                app.updateStateOptions(preserveState || document.getElementById('gState').value);
            },

            toggleRounds: () => {
                const cfg = app.getConfig();
                const isGift = document.getElementById('gType').value === 'gift';
                const ev = document.getElementById('gEvent').value;
                const rc = document.getElementById('roundContainer');
                if(isGift && ev === cfg.bigTioName && cfg.rounds.length > 0) rc.classList.remove('hidden');
                else rc.classList.add('hidden');
            },

            openModalForTarget: (targetType, targetValue = null) => {
                const cfg = app.getConfig();
                app.openModal(null);
                const recipChecks = document.querySelectorAll('input[name="gRecipCheck"]');
                
                if (targetType === 'person' && targetValue) {
                    recipChecks.forEach(c => { if (c.value === targetValue) c.checked = true; });
                } else if (targetType === 'casa4') {
                    recipChecks.forEach(c => { if (cfg.casaMembers.includes(c.value)) c.checked = true; });
                }

                const boardEv = document.getElementById('boardEventFilter').value;
                if (boardEv && boardEv !== 'all') {
                    document.getElementById('gEvent').value = boardEv;
                    app.toggleRounds();
                }
            },

            openModal: (id = null) => {
                const cfg = app.getConfig();
                const isNew = (id === null);
                document.getElementById('modalTitle').innerText = isNew ? "Nou Element ✨" : "Editar Element ✏️";
                document.getElementById('btnDelete').classList.toggle('hidden', isNew);
                document.getElementById('btnDuplicate').classList.toggle('hidden', isNew);
                document.getElementById('dupBanner').classList.add('hidden');
                
                if(app.currentUser) {
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
                    app.setItemType('gift', 'Idea');
                    document.getElementById('giftId').value = '';
                    document.getElementById('gTitle').value = '';
                    document.getElementById('gPrice').value = '';
                    document.getElementById('gPriceType').value = 'definitive';
                    document.getElementById('gUrl').value = '';
                    document.getElementById('gImage').value = '';
                    document.getElementById('gComments').value = '';
                    document.getElementById('gSecret').checked = false;
                    document.getElementById('gEvent').value = '❓ Per decidir';
                    fromChecks.forEach(c => { if (cfg.parents.includes(c.value)) c.checked = true; });
                } else {
                    const g = app.data.gifts.find(x => x.id === id);
                    const itemType = g.type || 'gift';
                    
                    if (itemType === 'expense') {
                        document.getElementById('gPaidByUs').checked = true;
                        document.getElementById('gExpenseCat').value = g.expenseCat || '🍲 Dinar de Santa Llúcia';
                    } else {
                        const recips = g.recipients || (g.recipient ? [g.recipient] : []);
                        recipChecks.forEach(c => { if (recips.includes(c.value)) c.checked = true; });

                        const froms = g.froms || (g.from && g.from !== 'Nosaltres' ? [g.from] : cfg.parents);
                        fromChecks.forEach(c => { if (froms.includes(c.value)) c.checked = true; });
                        
                        const isPaid = g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from);
                        document.getElementById('gPaidByUs').checked = isPaid;
                    }

                    app.setItemType(itemType, g.state);
                    document.getElementById('giftId').value = g.id;
                    document.getElementById('gEvent').value = g.event || (itemType === 'expense' ? '✨ General Festes' : '❓ Per decidir');
                    if(g.round) document.getElementById('gRound').value = g.round;
                    document.getElementById('gPriceType').value = g.isApprox ? 'approx' : 'definitive';
                    document.getElementById('gSecret').checked = g.isSecret;
                    
                    if (g.isSecret && itemType === 'gift') {
                        document.getElementById('gTitle').value = app.decrypt(g.title, app.pin);
                        document.getElementById('gPrice').value = app.decrypt(g.price, app.pin);
                        document.getElementById('gUrl').value = app.decrypt(g.url, app.pin);
                        document.getElementById('gImage').value = app.decrypt(g.image, app.pin);
                        document.getElementById('gComments').value = app.decrypt(g.comments || '', app.pin);
                    } else {
                        document.getElementById('gTitle').value = g.title;
                        document.getElementById('gPrice').value = g.price;
                        document.getElementById('gUrl').value = g.url;
                        document.getElementById('gImage').value = g.image;
                        document.getElementById('gComments').value = g.comments || '';
                    }
                }
                app.toggleRounds();
                document.getElementById('giftModal').style.display = 'block';
            },

            buildItemFromForm: (forceId = null, forceState = null) => {
                const cfg = app.getConfig();
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

                if (itemType === 'gift') {
                    selectedRecips = Array.from(document.querySelectorAll('input[name="gRecipCheck"]:checked')).map(c => c.value);
                    if (selectedRecips.length === 0) {
                        alert("Ei! Marca almenys una persona a 'Per a qui?'");
                        return null;
                    }
                    selectedFroms = Array.from(document.querySelectorAll('input[name="gFromCheck"]:checked')).map(c => c.value);
                    isSecret = document.getElementById('gSecret').checked;
                    paidByUs = document.getElementById('gPaidByUs').checked;
                } else {
                    expenseCat = document.getElementById('gExpenseCat').value;
                }
                
                const id = forceId || document.getElementById('giftId').value || Date.now().toString();
                let price = document.getElementById('gPrice').value;
                const isApprox = document.getElementById('gPriceType').value === 'approx';
                let url = document.getElementById('gUrl').value;
                let image = document.getElementById('gImage').value;
                let comments = document.getElementById('gComments').value;

                if (isSecret && app.currentUser && itemType === 'gift') { 
                    title = app.crypt(title, app.pin);
                    price = app.crypt(price, app.pin);
                    url = app.crypt(url, app.pin);
                    image = app.crypt(image, app.pin);
                    comments = app.crypt(comments, app.pin);
                }

                const chosenEvent = document.getElementById('gEvent').value;

                return {
                    id, type: itemType, expenseCat, title, price, isApprox, url, image, comments, isSecret, paidByUs,
                    recipients: selectedRecips,
                    froms: selectedFroms,
                    event: chosenEvent,
                    round: (itemType === 'gift' && chosenEvent === cfg.bigTioName) ? document.getElementById('gRound').value : null,
                    state: forceState || document.getElementById('gState').value,
                    createdBy: app.currentUser || 'Família',
                    updatedAt: Date.now()
                };
            },

            saveGift: () => {
                const newItem = app.buildItemFromForm();
                if (!newItem) return;

                const idx = app.data.gifts.findIndex(x => x.id === newItem.id);
                if(idx > -1) app.data.gifts[idx] = newItem;
                else app.data.gifts.push(newItem);

                app.saveLocal(); app.closeModal('giftModal'); app.renderAll();
            },

            duplicateGift: () => {
                const newId = Date.now().toString();
                const duplicatedItem = app.buildItemFromForm(newId, 'Idea');
                if (!duplicatedItem) return;

                app.data.gifts.push(duplicatedItem);
                app.saveLocal();
                app.renderAll();

                document.getElementById('giftId').value = newId;
                app.updateStateOptions('Idea');
                document.getElementById('modalTitle').innerText = "Editar Còpia 📋";
                document.getElementById('dupBanner').classList.remove('hidden');
            },

            deleteGift: () => {
                if(confirm("Segur que vols eliminar aquest element?")) {
                    const id = document.getElementById('giftId').value;
                    app.data.gifts = app.data.gifts.filter(x => x.id !== id);
                    if (!app.data.deletedIds) app.data.deletedIds = [];
                    if (!app.data.deletedIds.includes(id)) app.data.deletedIds.push(id);
                    app.saveLocal(); app.closeModal('giftModal'); app.renderAll();
                }
            },

            resolveGiftDisplay: (g) => {
                const cfg = app.getConfig();
                const isExpense = (g.type === 'expense');
                const isOthersSecret = (!isExpense && g.isSecret && g.createdBy !== app.currentUser);
                const titleDisplay = isOthersSecret ? "🎁 Sorpresa de " + g.createdBy : (g.isSecret ? app.decrypt(g.title, app.pin) : g.title);
                const priceVal = isOthersSecret ? 0 : parseFloat(g.isSecret ? app.decrypt(g.price, app.pin) : g.price) || 0;
                const imgUrl = isOthersSecret ? null : (g.isSecret ? app.decrypt(g.image, app.pin) : g.image);
                const shopUrl = isOthersSecret ? null : (g.isSecret ? app.decrypt(g.url, app.pin) : g.url);
                const commentsDisplay = isOthersSecret ? '' : (g.isSecret ? app.decrypt(g.comments || '', app.pin) : (g.comments || ''));
                
                const recips = g.recipients || (g.recipient ? [g.recipient] : []);
                const froms = g.froms || (g.from && g.from !== 'Nosaltres' ? [g.from] : cfg.parents);
                const isPaidByUs = isExpense ? true : (g.hasOwnProperty('paidByUs') ? g.paidByUs : (g.from === 'Nosaltres' || !g.from));
                
                const hasUsAsGiver = cfg.parents.some(p => froms.includes(p));
                const isReceivedFromOthers = !isExpense && !isPaidByUs && !hasUsAsGiver;
                const isOtherHouse = !isExpense && !isPaidByUs;

                return {
                    isExpense, isOthersSecret, titleDisplay, priceVal, imgUrl, shopUrl, commentsDisplay,
                    recips, froms, isPaidByUs, isReceivedFromOthers, isOtherHouse
                };
            },

            updateBudgetHeader: () => {
                let previst = 0;
                Object.values(app.data.budgets || {}).forEach(v => previst += (parseFloat(v) || 0));
                const { totalSpent, totalSpentDefinitive, totalSpentApprox } = app.calculateSpendingBreakdown();
                
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
            
            // --- VISTA 1: LLISTA I LOGÍSTICA ---
            renderList: () => {
                const cfg = app.getConfig();
                app.updateBudgetHeader();
                const list = document.getElementById('giftList');
                list.innerHTML = '';

                const search = document.getElementById('searchFilter').value.toLowerCase();
                const typeF = document.getElementById('typeFilter').value;
                const status = document.getElementById('statusFilter').value;
                const eventF = document.getElementById('eventFilter').value;
                const person = document.getElementById('personFilter').value;

                if (eventF === cfg.bigTioName && cfg.rounds.length > 0) {
                    cfg.rounds.forEach(roundName => {
                        const roundGifts = app.data.gifts.filter(g => g.event === eventF && g.round === roundName);
                        if(roundGifts.length > 0) {
                            list.innerHTML += `<div class="round-header">🪵 ${roundName}</div>`;
                            roundGifts.forEach(g => app.renderCard(g, list, search, typeF, status, person, eventF));
                        }
                    });
                } else {
                    app.data.gifts.forEach(g => app.renderCard(g, list, search, typeF, status, person, eventF));
                }
            },

            renderCard: (g, container, search, typeF, status, person, eventF) => {
                const cfg = app.getConfig();
                const itemType = g.type || 'gift';
                const d = app.resolveGiftDisplay(g);

                if (typeF === 'gift' && itemType !== 'gift') return;
                if (typeF === 'expense' && itemType !== 'expense') return;
                if (typeF === 'gift_ours' && (itemType !== 'gift' || d.isOtherHouse)) return;
                if (typeF === 'gift_others' && (itemType !== 'gift' || !d.isOtherHouse)) return;

                const recipsText = d.recips.join(', ');
                const fromsText = d.froms.join(', ');

                if(status === 'Idea' && g.state !== 'Idea') return;
                if(status === 'Decidit' && g.state !== 'Decidit') return;
                if(status === 'Confirmat' && g.state !== 'Confirmat') return;
                if(status === 'Pendent' && (g.state === 'Idea' || g.state === 'El tenim' || g.state === 'Embolicat' || g.state === 'Confirmat')) return;
                if(person !== 'all' && (d.isExpense || !d.recips.includes(person))) return;
                if(eventF !== 'all' && g.event !== eventF && eventF !== cfg.bigTioName) return; 
                
                const searchableText = `${d.titleDisplay} ${recipsText} ${fromsText} ${d.commentsDisplay} ${g.expenseCat || ''} ${g.event || ''}`.toLowerCase();
                if(search && !searchableText.includes(search)) return;

                const div = document.createElement('div');
                let extClass = d.isExpense ? 'expense' : (d.isOthersSecret ? 'secret' : (d.isOtherHouse ? 'altres' : ''));
                div.className = `card ${extClass}`;
                div.onclick = () => { if(!d.isOthersSecret) app.openModal(g.id); else alert("Top Secret! 🤫 Això és cosa de " + g.createdBy); };
                
                let badgeClass = g.state === 'Idea' ? 'idea'
                    : (g.state === 'Decidit' ? 'decidit'
                    : (g.state === 'Confirmat' ? 'confirmat'
                    : (g.state === 'Embolicat' || g.state === 'El tenim' ? 'comprat' : '')));
                
                let subtitleHtml = d.isExpense
                    ? `<span class="badge expense-cat">${g.expenseCat || '🎄 Despesa'}</span>${g.event ? ' | ' + g.event : ''}`
                    : `👤 <b>${recipsText}</b> | ${g.event || '❓ Per decidir'} ${g.round ? '('+g.round+')' : ''}`;

                let content = `
                    <div class="card-header">
                        <div class="card-title">${d.isExpense ? '🎄 ' : ''}${d.titleDisplay}</div>
                        <div><span class="badge ${badgeClass}">${g.state}</span></div>
                    </div>
                    <div style="font-size:0.85em; color:#555; margin-bottom: 5px;">
                        ${subtitleHtml}
                    </div>
                `;
                
                if(!d.isOthersSecret) {
                    if (d.isOtherHouse) {
                        if (d.priceVal > 0) {
                            const priceText = g.isApprox ? `~${d.priceVal} €` : `${d.priceVal} €`;
                            content += `<div style="font-weight:bold; color:#555; font-size: 0.95em;">${priceText} <span style="font-weight:normal; font-size:0.85em;">(orientatiu)</span></div>`;
                        }
                        content += `<div style="font-size:0.85em; margin-top: 6px;"><span class="badge other-house">🏡 D'una altra casa</span>🤝 De part de: <b>${fromsText || 'Altres'}</b></div>`;
                    } else {
                        const priceText = d.priceVal ? (g.isApprox ? `~${d.priceVal} €` : `${d.priceVal} €`) : '? €';
                        const approxTag = (d.priceVal && g.isApprox) ? `<span class="badge approx">Aproximat</span>` : '';
                        content += `<div style="font-weight:bold; color:${d.isExpense ? 'var(--c-green-dark)' : 'var(--c-red)'}; font-size: 1.1em;">${priceText}${approxTag}</div>`;
                        
                        if(!d.isExpense && fromsText) {
                            content += `<div style="font-size:0.85em; margin-top: 5px;">🤝 De part de: <b>${fromsText}</b></div>`;
                        }
                    }
                    
                    if(d.commentsDisplay) content += `<div style="font-size:0.85em; color:#444; background:#f8f9fa; padding:6px 8px; border-radius:6px; margin-top:8px; font-style:italic;">📝 ${d.commentsDisplay}</div>`;
                    if(d.shopUrl) content += `<div style="margin-top:8px;"><a href="${d.shopUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--c-green-dark); font-size:0.85em; text-decoration:none; font-weight:bold;">🛒 Veure enllaç</a></div>`;
                    if(d.imgUrl) content += `<img src="${d.imgUrl}" style="width:100%; max-height:150px; border-radius:8px; margin-top:10px; object-fit:cover;">`;
                }
                
                div.innerHTML = content;
                container.appendChild(div);
            },

            // --- VISTA 2: MAPA PER PERSONA ---
            renderBoard: () => {
                const cfg = app.getConfig();
                app.updateBudgetHeader();
                const container = document.getElementById('personBoardContainer');
                container.innerHTML = '';

                const eventF = document.getElementById('boardEventFilter').value;
                const statusF = document.getElementById('boardStatusFilter').value;
                const hideEmpty = document.getElementById('boardHideEmpty').checked;

                const filteredGifts = app.data.gifts.filter(g => {
                    if ((g.type || 'gift') !== 'gift') return false;
                    if (eventF !== 'all' && (g.event || '❓ Per decidir') !== eventF) return false;
                    if (statusF === 'consolidated' && g.state === 'Idea') return false;
                    if (statusF === 'Idea' && g.state !== 'Idea') return false;
                    if (statusF === 'pending' && (g.state === 'Idea' || g.state === 'El tenim' || g.state === 'Embolicat' || g.state === 'Confirmat')) return false;
                    return true;
                });

                const casaFour = cfg.casaMembers;
                const isGiftForCasa4 = (recips) => casaFour.length > 1 && casaFour.every(p => recips.includes(p));

                // 1. SECCIÓ NUCLI FAMILIAR
                let casaHtml = '';
                casaFour.forEach(personName => {
                    const giftsForBox = filteredGifts.filter(g => {
                        const r = g.recipients || (g.recipient ? [g.recipient] : []);
                        return !isGiftForCasa4(r) && r.includes(personName);
                    });
                    if (hideEmpty && giftsForBox.length === 0) return;
                    casaHtml += app.buildPersonBoxHtml(personName, giftsForBox, "casa-box", "person", personName, false);
                });

                const casa4Gifts = filteredGifts.filter(g => {
                    const r = g.recipients || (g.recipient ? [g.recipient] : []);
                    return isGiftForCasa4(r);
                });
                if (!hideEmpty || casa4Gifts.length > 0) {
                    casaHtml += app.buildPersonBoxHtml(`🏠 Casa / Els ${casaFour.length}`, casa4Gifts, "casa-box", "casa4", null, false);
                }

                if (casaHtml) {
                    container.innerHTML += `<div class="board-section-title">🏠 Nucli Familiar</div><div class="board-grid-casa">${casaHtml}</div>`;
                }

                // 2. SECCIÓ FAMILIARS DIRECTES
                const directList = [...cfg.dir1Members, ...cfg.dir2Members];
                let directesHtml = '';
                directList.forEach(memberName => {
                    const giftsForMember = filteredGifts.filter(g => {
                        const r = g.recipients || (g.recipient ? [g.recipient] : []);
                        return r.includes(memberName);
                    });
                    if (hideEmpty && giftsForMember.length === 0) return;
                    const displayLabel = /\(gos/i.test(memberName) ? `🐶 ${memberName.replace(/\s*\(gos.*?\)/i, '')}` : memberName;
                    directesHtml += app.buildPersonBoxHtml(displayLabel, giftsForMember, "directe-box", "person", memberName, false);
                });

                if (directesHtml) {
                    container.innerHTML += `<div class="board-section-title">👨‍👩‍👧‍👦 Familiars Directes</div><div class="board-grid-directes">${directesHtml}</div>`;
                }

                // 3. SECCIÓ ALTRES FAMILIARS (2 Blocs)
                const ext1Gifts = filteredGifts.filter(g => {
                    const r = g.recipients || (g.recipient ? [g.recipient] : []);
                    return r.some(p => cfg.ext1Members.includes(p));
                });
                const ext2Gifts = filteredGifts.filter(g => {
                    const r = g.recipients || (g.recipient ? [g.recipient] : []);
                    return r.some(p => cfg.ext2Members.includes(p));
                });

                let altresHtml = '';
                if (!hideEmpty || ext1Gifts.length > 0) {
                    altresHtml += app.buildPersonBoxHtml(`🌿 ${cfg.ext1Name}`, ext1Gifts, "altres-box", "group", null, true);
                }
                if (!hideEmpty || ext2Gifts.length > 0) {
                    altresHtml += app.buildPersonBoxHtml(`🌿 ${cfg.ext2Name}`, ext2Gifts, "altres-box", "group", null, true);
                }

                if (altresHtml) {
                    container.innerHTML += `<div class="board-section-title">🌳 Altres Familiars</div><div class="board-grid-altres">${altresHtml}</div>`;
                }
            },

            buildPersonBoxHtml: (boxTitle, giftsList, boxClass, targetType, targetVal, showSpecificRecipients) => {
                const isEmpty = (giftsList.length === 0);
                const eventBadges = app.getEventShortBadges();
                
                const consolidatedGifts = giftsList.filter(g => g.state !== 'Idea');
                let countersHtml = '';
                
                eventBadges.forEach(evObj => {
                    const count = consolidatedGifts.filter(g => (g.event || '❓ Per decidir') === evObj.name).length;
                    if (count > 0) {
                        countersHtml += `<span class="cnt-pill" title="${evObj.name}">${evObj.icon} ${count}</span>`;
                    }
                });

                if (!countersHtml) {
                    const ideasCount = giftsList.filter(g => g.state === 'Idea').length;
                    countersHtml = ideasCount > 0
                        ? `<span class="cnt-pill zero">0 confirmats · 💡 ${ideasCount} ${ideasCount === 1 ? 'idea' : 'idees'}</span>`
                        : `<span class="cnt-pill zero">0 regals</span>`;
                }

                const ourGifts = [];
                const receivedGifts = [];

                giftsList.forEach(g => {
                    const d = app.resolveGiftDisplay(g);
                    if (d.isReceivedFromOthers || d.isOtherHouse) receivedGifts.push({ g, d });
                    else ourGifts.push({ g, d });
                });

                let bodyHtml = '';
                if (isEmpty) {
                    bodyHtml = `<div class="person-empty-msg">No hi ha regals planificats</div>`;
                } else {
                    ourGifts.forEach(({ g, d }) => {
                        bodyHtml += app.buildMiniCardHtml(g, d, showSpecificRecipients, false);
                    });

                    if (receivedGifts.length > 0) {
                        bodyHtml += `<div class="received-divider"><div class="received-label">🏡 D'una altra casa (Rebrem)</div>`;
                        receivedGifts.forEach(({ g, d }) => {
                            bodyHtml += app.buildMiniCardHtml(g, d, showSpecificRecipients, true);
                        });
                        bodyHtml += `</div>`;
                    }
                }

                const safeTargetVal = targetVal ? `'${targetVal.replace(/'/g, "\\'")}'` : 'null';

                return `
                    <div class="person-box ${boxClass} ${isEmpty ? 'is-empty' : ''}">
                        <div class="person-box-header">
                            <div class="person-box-name">${boxTitle}</div>
                            <button type="button" class="person-add-btn" title="Afegir regal per a ${boxTitle}" onclick="app.openModalForTarget('${targetType}', ${safeTargetVal})">+</button>
                        </div>
                        <div class="person-counters">${countersHtml}</div>
                        ${bodyHtml}
                    </div>
                `;
            },

            buildMiniCardHtml: (g, d, showSpecificRecipients, isReceived) => {
                const cfg = app.getConfig();
                const isIdea = (g.state === 'Idea');
                const stateCls = isIdea ? 'idea'
                    : (g.state === 'Decidit' ? 'decidit'
                    : (g.state === 'Confirmat' ? 'confirmat'
                    : (g.state === 'Embolicat' || g.state === 'El tenim' ? 'comprat' : '')));

                const cardClasses = [
                    'mini-gift',
                    isIdea ? 'is-idea' : '',
                    d.isOthersSecret ? 'is-secret' : '',
                    isReceived ? 'is-received' : ''
                ].filter(Boolean).join(' ');

                const evName = g.event || '❓ Per decidir';
                const evIcon = evName.split(' ')[0];

                let extraLine = '';
                const isAllCasa = cfg.casaMembers.length > 1 && cfg.casaMembers.every(p => d.recips.includes(p));
                if (showSpecificRecipients && d.recips.length > 0) {
                    extraLine += `<div style="font-size:0.74em; color:#165b33; margin-top:3px;">👤 <b>${d.recips.join(', ')}</b></div>`;
                } else if (!showSpecificRecipients && d.recips.length > 1 && !isAllCasa) {
                    extraLine += `<div style="font-size:0.72em; color:#666; margin-top:2px;">👥 Compartit (${d.recips.join(', ')})</div>`;
                }
                if (isReceived && d.froms.length > 0) {
                    extraLine += `<div style="font-size:0.73em; color:#2874a6; margin-top:2px;">🤝 De: <b>${d.froms.join(', ')}</b></div>`;
                }

                const showPrice = !d.isOthersSecret && d.priceVal > 0 && (!isReceived || isIdea);
                const priceDisplay = showPrice ? (g.isApprox ? `~${d.priceVal}€` : `${d.priceVal}€`) : '';

                const clickAction = d.isOthersSecret
                    ? `alert('Top Secret! 🤫 Això és cosa de ${g.createdBy}')`
                    : `app.openModal('${g.id}')`;

                return `
                    <div class="${cardClasses}" onclick="${clickAction}">
                        <div class="mini-gift-top">
                            <span>${d.titleDisplay}</span>
                            <span title="${evName}">${evIcon}</span>
                        </div>
                        ${extraLine}
                        <div class="mini-gift-meta">
                            <span class="mini-badge ${stateCls}">${g.state}</span>
                            ${priceDisplay ? `<b>${priceDisplay}</b>` : ''}
                        </div>
                    </div>
                `;
            }
        };
        
        window.onload = app.init;

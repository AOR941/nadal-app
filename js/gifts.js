/* ==========================================================================
 * NADAL TRACKER - JS/GIFTS.JS (Índex de blocs)
 * [1] Estat del mòdul i helpers d'ordenació / filtre
 * [2] Muntatge de la vista, barra neta, filtres i canvi de mode
 * [3] Renderitzat de Mapa, Kanban Estat i Kanban Dia (amb drag & drop)
 * ========================================================================== */

import { core, STATE_PROGRESS_ORDER } from './core.js';

const CASA_ALL_TOKEN = '__CASA_ALL__';
const DELIVERY_ACTIVE_STATES = ['Comprat/Delivery', 'Decidit', 'Idea'];

export const giftsView = {
    sectionId: 'giftsViewSection',
    hideFloatingBtn: () => false,

    /* --- [1] ESTAT DEL MÒDUL I HELPERS D'ORDENACIÓ / FILTRE --- */
    viewMode: 'map', // 'map' | 'kanban-state' | 'kanban-event'
    selectedEvent: 'all',
    trackingOnly: false,
    selectedPeople: [],
    selectedStates: [],
    paidFilter: 'all', // 'all' | 'ours' | 'others'
    deliveryOnly: false,
    sortBy: 'event', // 'event' | 'state' | 'person' | 'price' | 'delivery'
    filtersOpen: false,
    draggedGiftId: null,
    dragSourceContext: null,

    getRecipientsList: (g) => {
        if (!g) return [];
        if (Array.isArray(g.recipients)) return g.recipients;
        return g.recipient ? [g.recipient] : [];
    },

    sortGifts: (items) => {
        const mode = giftsView.sortBy;
        return items.slice().sort((a, b) => {
            const da = core.resolveGiftDisplay(a);
            const db = core.resolveGiftDisplay(b);

            if (mode === 'event') {
                const rA = core.getEventRank(a.event);
                const rB = core.getEventRank(b.event);
                if (rA !== rB) return rA - rB;
                return (a.round || '').localeCompare(b.round || '', 'ca');
            }
            if (mode === 'state') {
                return core.getStateRank(a.state) - core.getStateRank(b.state);
            }
            if (mode === 'person') {
                const pA = da.recips[0] || 'zzz';
                const pB = db.recips[0] || 'zzz';
                return pA.localeCompare(pB, 'ca');
            }
            if (mode === 'price') {
                return db.priceVal - da.priceVal;
            }
            if (mode === 'delivery') {
                const dA = da.deliveryDate || '9999-99-99';
                const dB = db.deliveryDate || '9999-99-99';
                return dA.localeCompare(dB);
            }
            return 0;
        });
    },

    /* --- [2] MUNTATGE DE LA VISTA, BARRA NETA, FILTRES I CANVI DE MODE --- */
    mount: () => {
        const sec = document.getElementById(giftsView.sectionId);
        if (!sec) return;

        sec.innerHTML = `
            <div class="gifts-top-bar">
                <div class="gifts-mode-switch" role="tablist" aria-label="Vista de regals">
                    <button type="button" id="modeBtnMap" class="gifts-mode-btn active" onclick="app.views.gifts.setViewMode('map')">🗺️ Mapa</button>
                    <button type="button" id="modeBtnState" class="gifts-mode-btn" onclick="app.views.gifts.setViewMode('kanban-state')">📋 Estat</button>
                    <button type="button" id="modeBtnEvent" class="gifts-mode-btn" onclick="app.views.gifts.setViewMode('kanban-event')">📅 Dia</button>
                </div>

                <div class="gifts-controls-row">
                    <input type="text" id="giftSearchInput" class="gifts-search-input" placeholder="🔍 Buscar..." oninput="app.views.gifts.render()">

                    <select id="giftEventSelect" class="gifts-event-select" onchange="app.views.gifts.onEventChange(this.value)">
                        <option value="all">📅 Tots els dies</option>
                    </select>

                    <button type="button" id="trackingFilterBtn" class="gifts-tracking-btn" onclick="app.views.gifts.toggleTrackingFilter()">
                        🎯 Tracking <span id="trackingCountBadge" class="tracking-count">0</span>
                    </button>

                    <button type="button" id="giftsFiltersToggleBtn" class="filters-toggle-btn" onclick="app.views.gifts.toggleFiltersPanel()">
                        🔍 Filtres <span id="giftsActiveCount" class="filter-count-badge hidden">0</span> <span id="giftsFiltersCaret">▾</span>
                    </button>

                    <button type="button" id="giftsClearQuickBtn" class="clear-filters-btn hidden" onclick="app.views.gifts.clearFilters()" title="Netejar filtres">✕</button>
                </div>

                <div id="giftsFiltersDrawer" class="gifts-filters-drawer collapsed">
                    <div class="filter-section">
                        <div class="filter-section-header">
                            <span class="filter-group-label">Persones (qualsevol marcada):</span>
                            <button type="button" id="giftsClearDrawerBtn" class="clear-filters-btn hidden" onclick="app.views.gifts.clearFilters()">✕ Netejar tot</button>
                        </div>
                        <div id="giftsPeoplePills" class="filter-pills-row"></div>
                        <div class="gifts-person-select-wrap">
                            <select id="giftsExtraPersonSelect" onchange="app.views.gifts.onExtraPersonChange(this.value)">
                                <option value="all">👤 Afegir altra persona o grup...</option>
                            </select>
                        </div>
                    </div>

                    <div class="filter-section">
                        <div class="filter-section-header">
                            <span class="filter-group-label">Estats:</span>
                            <button type="button" id="giftsDeliveryBtn" class="filter-pill delivery-pill" onclick="app.views.gifts.toggleDeliveryFilter()">🚚 En camí</button>
                        </div>
                        <div id="giftsStatePills" class="filter-pills-row"></div>
                    </div>

                    <div class="filter-section gifts-drawer-bottom">
                        <div>
                            <span class="filter-group-label">Qui paga:</span>
                            <div class="filter-pills-row" id="giftsPaidPills">
                                <button type="button" class="filter-pill paid-pill active" data-paid="all" onclick="app.views.gifts.setPaidFilter('all')">Tot</button>
                                <button type="button" class="filter-pill paid-pill" data-paid="ours" onclick="app.views.gifts.setPaidFilter('ours')">🏠 Nosaltres</button>
                                <button type="button" class="filter-pill paid-pill" data-paid="others" onclick="app.views.gifts.setPaidFilter('others')">🏡 Altra casa</button>
                            </div>
                        </div>

                        <div class="list-sort-box" style="margin-top:0;">
                            <label for="giftsSortSelect" class="toolbar-mini-label">↕️ Ordre:</label>
                            <select id="giftsSortSelect" onchange="app.views.gifts.onSortChange(this.value)"></select>
                        </div>
                    </div>
                </div>
            </div>

            <div id="giftsContentContainer"></div>
        `;
    },

    onConfigChange: (cfg) => {
        const evSel = document.getElementById('giftEventSelect');
        if (evSel) {
            evSel.innerHTML = '<option value="all">📅 Tots els dies</option>';
            core.getOrderedEvents()
                .filter(ev => ev !== '✨ General Festes')
                .forEach(ev => {
                    evSel.innerHTML += `<option value="${core.escapeHtml(ev)}">${core.escapeHtml(ev)}</option>`;
                });
            if (giftsView.selectedEvent !== 'all' && Array.from(evSel.options).some(o => o.value === giftsView.selectedEvent)) {
                evSel.value = giftsView.selectedEvent;
            } else {
                giftsView.selectedEvent = 'all';
                evSel.value = 'all';
            }
        }

        const extraSel = document.getElementById('giftsExtraPersonSelect');
        if (extraSel) {
            const prevExtra = extraSel.value;
            extraSel.innerHTML = '<option value="all">👤 Afegir altra persona o grup...</option>';
            const tree = {
                [cfg.dir1Name]: cfg.dir1Members,
                [cfg.dir2Name]: cfg.dir2Members,
                [cfg.ext1Name]: cfg.ext1Members,
                [cfg.ext2Name]: cfg.ext2Members,
                "Especials": ["Tió", "Reis Mags", "Amics/Altres"]
            };
            Object.entries(tree).forEach(([group, members]) => {
                if (!members || members.length === 0) return;
                const og = document.createElement('optgroup');
                og.label = group;
                members.forEach(m => {
                    og.innerHTML += `<option value="${core.escapeHtml(m)}">${core.escapeHtml(core.formatMemberLabel(m))}</option>`;
                });
                extraSel.appendChild(og);
            });
            if (prevExtra && Array.from(extraSel.options).some(o => o.value === prevExtra)) {
                extraSel.value = prevExtra;
            } else {
                extraSel.value = 'all';
            }
        }

        giftsView.renderFilterPills();
        giftsView.syncSortOptions();
    },

    setViewMode: (mode) => {
        giftsView.viewMode = mode;
        document.getElementById('modeBtnMap')?.classList.toggle('active', mode === 'map');
        document.getElementById('modeBtnState')?.classList.toggle('active', mode === 'kanban-state');
        document.getElementById('modeBtnEvent')?.classList.toggle('active', mode === 'kanban-event');
        giftsView.syncSortOptions();
        giftsView.render();
    },

    syncContainerWidth: () => {
        if (core.activeMainView !== 'gifts') return;
        const mainCont = document.getElementById('mainContainer');
        if (!mainCont) return;
        mainCont.classList.add('wide-view');
        mainCont.classList.toggle('kanban-wide', giftsView.viewMode !== 'map');
    },

    syncSortOptions: () => {
        const sel = document.getElementById('giftsSortSelect');
        if (!sel) return;
        const options = [
            { value: 'event', label: 'Esdeveniment (cronològic)' },
            { value: 'state', label: 'Estat (progrés)' },
            { value: 'person', label: 'Persona' },
            { value: 'price', label: 'Preu (€)' },
            { value: 'delivery', label: "Data d'entrega" }
        ].filter(opt => {
            if (giftsView.viewMode === 'kanban-state' && opt.value === 'state') return false;
            if (giftsView.viewMode === 'kanban-event' && opt.value === 'event') return false;
            return true;
        });

        if (!options.some(o => o.value === giftsView.sortBy)) {
            giftsView.sortBy = options[0]?.value || 'event';
        }
        sel.innerHTML = options.map(o => `<option value="${o.value}" ${o.value === giftsView.sortBy ? 'selected' : ''}>${o.label}</option>`).join('');
    },

    onSortChange: (val) => {
        giftsView.sortBy = val;
        giftsView.render();
    },

    onEventChange: (val) => {
        giftsView.selectedEvent = val || 'all';
        giftsView.renderFilterPills();
        giftsView.render();
    },

    toggleTrackingFilter: () => {
        giftsView.trackingOnly = !giftsView.trackingOnly;
        giftsView.renderFilterPills();
        giftsView.render();
    },

    toggleFiltersPanel: () => {
        giftsView.filtersOpen = !giftsView.filtersOpen;
        const drawer = document.getElementById('giftsFiltersDrawer');
        const caret = document.getElementById('giftsFiltersCaret');
        if (drawer) drawer.classList.toggle('collapsed', !giftsView.filtersOpen);
        if (caret) caret.innerText = giftsView.filtersOpen ? '▴' : '▾';
    },

    togglePersonToken: (token) => {
        const idx = giftsView.selectedPeople.indexOf(token);
        if (idx > -1) giftsView.selectedPeople.splice(idx, 1);
        else giftsView.selectedPeople.push(token);
        giftsView.renderFilterPills();
        giftsView.render();
    },

    onExtraPersonChange: (val) => {
        if (!val || val === 'all') return;
        if (!giftsView.selectedPeople.includes(val)) {
            giftsView.selectedPeople.push(val);
        }
        const extraSel = document.getElementById('giftsExtraPersonSelect');
        if (extraSel) extraSel.value = 'all';
        giftsView.renderFilterPills();
        giftsView.render();
    },

    toggleStateFilter: (stVal) => {
        const idx = giftsView.selectedStates.indexOf(stVal);
        if (idx > -1) giftsView.selectedStates.splice(idx, 1);
        else giftsView.selectedStates.push(stVal);
        giftsView.renderFilterPills();
        giftsView.render();
    },

    toggleDeliveryFilter: () => {
        giftsView.deliveryOnly = !giftsView.deliveryOnly;
        giftsView.renderFilterPills();
        giftsView.render();
    },

    setPaidFilter: (mode) => {
        giftsView.paidFilter = mode;
        giftsView.renderFilterPills();
        giftsView.render();
    },

    clearFilters: () => {
        giftsView.selectedEvent = 'all';
        giftsView.trackingOnly = false;
        giftsView.selectedPeople = [];
        giftsView.selectedStates = [];
        giftsView.paidFilter = 'all';
        giftsView.deliveryOnly = false;

        const searchEl = document.getElementById('giftSearchInput');
        const evSel = document.getElementById('giftEventSelect');
        const extraSel = document.getElementById('giftsExtraPersonSelect');
        if (searchEl) searchEl.value = '';
        if (evSel) evSel.value = 'all';
        if (extraSel) extraSel.value = 'all';

        giftsView.renderFilterPills();
        giftsView.render();
    },

    renderFilterPills: () => {
        const cfg = core.getConfig();
        const casaMembers = cfg.casaMembers || [];

        const trackingCount = (core.data.gifts || []).filter(g => (g.type || 'gift') === 'gift' && g.state !== 'Descartat' && Boolean(g.tracking)).length;
        const trBtn = document.getElementById('trackingFilterBtn');
        const trBadge = document.getElementById('trackingCountBadge');
        if (trBtn) trBtn.classList.toggle('active', giftsView.trackingOnly);
        if (trBadge) trBadge.innerText = String(trackingCount);

        const peopleCont = document.getElementById('giftsPeoplePills');
        if (peopleCont) {
            peopleCont.innerHTML = '';
            casaMembers.forEach(m => {
                const isActive = giftsView.selectedPeople.includes(m);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `filter-pill fam-pill ${isActive ? 'active' : ''}`;
                btn.innerText = core.formatMemberLabel(m);
                btn.onclick = () => giftsView.togglePersonToken(m);
                peopleCont.appendChild(btn);
            });

            if (casaMembers.length > 1) {
                const isAllActive = giftsView.selectedPeople.includes(CASA_ALL_TOKEN);
                const allBtn = document.createElement('button');
                allBtn.type = 'button';
                allBtn.className = `filter-pill fam-pill fam-all-pill ${isAllActive ? 'active' : ''}`;
                allBtn.innerText = `🏠 Tots ${casaMembers.length}`;
                allBtn.onclick = () => giftsView.togglePersonToken(CASA_ALL_TOKEN);
                peopleCont.appendChild(allBtn);
            }

            const nonCasaSelected = giftsView.selectedPeople.filter(p => p !== CASA_ALL_TOKEN && !casaMembers.includes(p));
            nonCasaSelected.forEach(p => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'filter-pill active';
                btn.innerText = `${core.formatMemberLabel(p)} ✕`;
                btn.title = 'Treure filtre de persona';
                btn.onclick = () => giftsView.togglePersonToken(p);
                peopleCont.appendChild(btn);
            });
        }

        const stateCont = document.getElementById('giftsStatePills');
        if (stateCont) {
            stateCont.innerHTML = '';
            core.allGiftStates.forEach(st => {
                const isActive = giftsView.selectedStates.includes(st.value);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `filter-pill state-pill ${isActive ? 'active' : ''}`;
                btn.innerText = st.label;
                btn.onclick = () => giftsView.toggleStateFilter(st.value);
                stateCont.appendChild(btn);
            });
        }

        document.querySelectorAll('#giftsPaidPills .paid-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.paid === giftsView.paidFilter);
        });

        const delivBtn = document.getElementById('giftsDeliveryBtn');
        if (delivBtn) delivBtn.classList.toggle('active', giftsView.deliveryOnly);

        const searchVal = (document.getElementById('giftSearchInput')?.value || '').trim();
        const activeCount =
            (giftsView.trackingOnly ? 1 : 0) +
            (giftsView.selectedEvent !== 'all' ? 1 : 0) +
            giftsView.selectedPeople.length +
            giftsView.selectedStates.length +
            (giftsView.paidFilter !== 'all' ? 1 : 0) +
            (giftsView.deliveryOnly ? 1 : 0) +
            (searchVal ? 1 : 0);

        const countBadge = document.getElementById('giftsActiveCount');
        const toggleBtn = document.getElementById('giftsFiltersToggleBtn');
        const clearQuickBtn = document.getElementById('giftsClearQuickBtn');
        const clearDrawerBtn = document.getElementById('giftsClearDrawerBtn');

        if (countBadge) {
            countBadge.innerText = String(activeCount);
            countBadge.classList.toggle('hidden', activeCount === 0);
        }
        if (toggleBtn) toggleBtn.classList.toggle('has-active', activeCount > 0);
        if (clearQuickBtn) clearQuickBtn.classList.toggle('hidden', activeCount === 0);
        if (clearDrawerBtn) clearDrawerBtn.classList.toggle('hidden', activeCount === 0);
    },

    matchesGiftFilters: (g, search, ignoreEventFilter = false, ignorePersonFilter = false, ignoreStateFilter = false) => {
        if ((g.type || 'gift') !== 'gift') return false;
        const d = core.resolveGiftDisplay(g);

        if (giftsView.trackingOnly && !d.tracking) return false;

        if (!ignoreEventFilter && giftsView.selectedEvent !== 'all') {
            if ((g.event || '❓ Per decidir') !== giftsView.selectedEvent) return false;
        }

        if (!ignoreStateFilter) {
            if (giftsView.selectedStates.length > 0) {
                if (!giftsView.selectedStates.includes(g.state)) return false;
            } else if (g.state === 'Descartat' && !search) {
                return false;
            }
        }

        if (giftsView.paidFilter === 'ours' && d.isOtherHouse) return false;
        if (giftsView.paidFilter === 'others' && !d.isOtherHouse) return false;

        if (giftsView.deliveryOnly) {
            const hasDeliv = Boolean(d.deliveryDate) || (g.state === 'Comprat/Delivery' && DELIVERY_ACTIVE_STATES.includes(g.state));
            if (!hasDeliv) return false;
        }

        if (!ignorePersonFilter && giftsView.selectedPeople.length > 0) {
            const cfg = core.getConfig();
            const casaMembers = cfg.casaMembers || [];
            const isCasaAllGift = casaMembers.length > 1 && casaMembers.every(m => d.recips.includes(m));
            const matchesAny = giftsView.selectedPeople.some(token => {
                if (token === CASA_ALL_TOKEN) return isCasaAllGift;
                return d.recips.includes(token);
            });
            if (!matchesAny) return false;
        }

        if (search) {
            const hay = `${d.titleDisplay} ${d.recips.join(', ')} ${d.froms.join(', ')} ${d.commentsDisplay} ${g.event || ''} ${g.round || ''}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }

        return true;
    },

    /* --- [3] RENDERITZAT DE MAPA, KANBAN ESTAT I KANBAN DIA (AMB DRAG & DROP) --- */
    render: () => {
        const container = document.getElementById('giftsContentContainer');
        if (!container) return;

        giftsView.syncContainerWidth();
        giftsView.syncSortOptions();
        giftsView.renderFilterPills();
        container.innerHTML = '';

        const search = (document.getElementById('giftSearchInput')?.value || '').trim().toLowerCase();
        const filtered = (core.data.gifts || []).filter(g => giftsView.matchesGiftFilters(g, search));

        if (giftsView.viewMode === 'kanban-state') {
            giftsView.renderKanbanByState(filtered, container);
            return;
        }
        if (giftsView.viewMode === 'kanban-event') {
            giftsView.renderKanbanByEvent(filtered, container);
            return;
        }

        giftsView.renderMap(filtered, container);
    },

    attachDropTarget: (el, onDropFn) => {
        el.addEventListener('dragover', (e) => {
            if (!giftsView.draggedGiftId) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', (e) => {
            if (!el.contains(e.relatedTarget)) {
                el.classList.remove('drag-over');
            }
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const id = giftsView.draggedGiftId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
            const ctx = giftsView.dragSourceContext;
            giftsView.draggedGiftId = null;
            giftsView.dragSourceContext = null;
            if (id) onDropFn(id, ctx);
        });
    },

    makeCard: (g, opts = {}) => {
        return core.createCardElement(g, Object.assign({
            draggable: true,
            onDragStart: (gift) => {
                giftsView.draggedGiftId = gift.id;
                giftsView.dragSourceContext = opts.sourceContext || null;
            },
            onDragEnd: () => {
                giftsView.draggedGiftId = null;
                giftsView.dragSourceContext = null;
                document.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
            }
        }, opts));
    },

    /* --- VISTA 1: MAPA PER PERSONA --- */
    renderMap: (filteredGifts, container) => {
        const cfg = core.getConfig();
        const casaMembers = cfg.casaMembers || [];
        const isGiftForCasaAll = (recips) => casaMembers.length > 1 && casaMembers.every(p => recips.includes(p));

        const activePeople = new Set(giftsView.selectedPeople.filter(p => p !== CASA_ALL_TOKEN));
        const showCasaAllSelected = giftsView.selectedPeople.includes(CASA_ALL_TOKEN);
        const hasPersonFilter = activePeople.size > 0 || showCasaAllSelected;

        const appendSection = (title, gridClass, boxesSpec) => {
            if (!boxesSpec || boxesSpec.length === 0) return;
            const titleEl = document.createElement('div');
            titleEl.className = 'board-section-title';
            titleEl.innerText = title;
            container.appendChild(titleEl);

            const gridEl = document.createElement('div');
            gridEl.className = gridClass;

            boxesSpec.forEach(spec => {
                const boxEl = giftsView.buildMapBoxElement(spec);
                gridEl.appendChild(boxEl);
            });
            container.appendChild(gridEl);
        };

        // 1. Nucli Familiar
        const casaBoxes = [];
        casaMembers.forEach(personName => {
            if (hasPersonFilter && !activePeople.has(personName)) return;
            const boxGifts = filteredGifts.filter(g => {
                const r = giftsView.getRecipientsList(g);
                return !isGiftForCasaAll(r) && r.includes(personName);
            });
            casaBoxes.push({
                boxId: `person:${personName}`,
                title: core.formatMemberLabel(personName),
                boxClass: 'casa-box',
                targetType: 'person',
                targetVal: personName,
                boxPerson: personName,
                isCasaAllBox: false,
                showSpecificRecipients: false,
                gifts: boxGifts,
                dropAction: (giftId) => giftsView.reassignGiftToPerson(giftId, personName, personName)
            });
        });

        const casaAllGifts = filteredGifts.filter(g => isGiftForCasaAll(giftsView.getRecipientsList(g)));
        if (!hasPersonFilter || showCasaAllSelected) {
            casaBoxes.push({
                boxId: 'casa:all',
                title: `🏠 Casa / Els ${casaMembers.length}`,
                boxClass: 'casa-box',
                targetType: 'casa4',
                targetVal: null,
                boxPerson: null,
                isCasaAllBox: true,
                showSpecificRecipients: false,
                gifts: casaAllGifts,
                dropAction: (giftId, srcCtx) => giftsView.reassignGiftToCasaAll(giftId, srcCtx)
            });
        }
        appendSection('🏠 Nucli Familiar', 'board-grid-casa', casaBoxes);

        // 2. Familiars Directes
        const directList = [...(cfg.dir1Members || []), ...(cfg.dir2Members || [])];
        const directBoxes = [];
        directList.forEach(memberName => {
            if (hasPersonFilter && !activePeople.has(memberName)) return;
            const boxGifts = filteredGifts.filter(g => giftsView.getRecipientsList(g).includes(memberName));
            directBoxes.push({
                boxId: `person:${memberName}`,
                title: core.formatMemberLabel(memberName),
                boxClass: 'directe-box',
                targetType: 'person',
                targetVal: memberName,
                boxPerson: memberName,
                isCasaAllBox: false,
                showSpecificRecipients: false,
                gifts: boxGifts,
                dropAction: (giftId, srcCtx) => giftsView.reassignGiftToPerson(giftId, memberName, srcCtx?.boxPerson || null)
            });
        });
        appendSection('👨‍👩‍👧‍👦 Familiars Directes', 'board-grid-directes', directBoxes);

        // 3. Altres Familiars
        const ext1Selected = (cfg.ext1Members || []).some(m => activePeople.has(m));
        const ext2Selected = (cfg.ext2Members || []).some(m => activePeople.has(m));
        const ext1Gifts = filteredGifts.filter(g => {
            const r = giftsView.getRecipientsList(g);
            return ext1Selected
                ? r.some(p => activePeople.has(p) && (cfg.ext1Members || []).includes(p))
                : r.some(p => (cfg.ext1Members || []).includes(p));
        });
        const ext2Gifts = filteredGifts.filter(g => {
            const r = giftsView.getRecipientsList(g);
            return ext2Selected
                ? r.some(p => activePeople.has(p) && (cfg.ext2Members || []).includes(p))
                : r.some(p => (cfg.ext2Members || []).includes(p));
        });

        const altresBoxes = [];
        if (!hasPersonFilter || ext1Selected) {
            altresBoxes.push({
                boxId: 'ext:1',
                title: `🌿 ${cfg.ext1Name}`,
                boxClass: 'altres-box',
                targetType: 'group',
                targetVal: null,
                boxPerson: null,
                isCasaAllBox: false,
                showSpecificRecipients: true,
                gifts: ext1Gifts,
                dropAction: (giftId) => core.openModal(giftId)
            });
        }
        if (!hasPersonFilter || ext2Selected) {
            altresBoxes.push({
                boxId: 'ext:2',
                title: `🌿 ${cfg.ext2Name}`,
                boxClass: 'altres-box',
                targetType: 'group',
                targetVal: null,
                boxPerson: null,
                isCasaAllBox: false,
                showSpecificRecipients: true,
                gifts: ext2Gifts,
                dropAction: (giftId) => core.openModal(giftId)
            });
        }
        appendSection('🌳 Altres Familiars', 'board-grid-altres', altresBoxes);

        // 4. Altres / Sense assignar a blocs familiars (només si n'hi ha)
        const knownPeople = new Set([
            ...casaMembers,
            ...(cfg.dir1Members || []),
            ...(cfg.dir2Members || []),
            ...(cfg.ext1Members || []),
            ...(cfg.ext2Members || [])
        ]);
        const otherGifts = filteredGifts.filter(g => {
            const r = giftsView.getRecipientsList(g);
            if (r.length === 0) return true;
            return r.some(p => !knownPeople.has(p));
        });
        if (otherGifts.length > 0 && (!hasPersonFilter || Array.from(activePeople).some(p => !knownPeople.has(p)))) {
            appendSection('✨ Altres / Amics', 'board-grid-altres', [{
                boxId: 'others:misc',
                title: '✨ Altres / Amics',
                boxClass: 'altres-box',
                targetType: 'altres',
                targetVal: null,
                boxPerson: null,
                isCasaAllBox: false,
                showSpecificRecipients: true,
                gifts: otherGifts,
                dropAction: (giftId) => core.openModal(giftId)
            }]);
        }

        if (container.children.length === 0) {
            container.innerHTML = `<div class="person-empty-msg" style="background:white; padding:24px;">Cap regal coincideix amb els filtres seleccionats.</div>`;
        }
    },

    buildMapBoxElement: (spec) => {
        const sortedList = giftsView.sortGifts(spec.gifts);
        const isEmpty = sortedList.length === 0;
        const eventBadges = core.getEventShortBadges();
        const consolidated = sortedList.filter(g => g.state !== 'Idea' && g.state !== 'Descartat');

        let countersHtml = '';
        eventBadges.forEach(evObj => {
            const count = consolidated.filter(g => (g.event || '❓ Per decidir') === evObj.name).length;
            if (count > 0) {
                countersHtml += `<span class="cnt-pill" title="${core.escapeHtml(evObj.name)}">${evObj.icon} ${count}</span>`;
            }
        });

        if (!countersHtml) {
            const ideasCount = sortedList.filter(g => g.state === 'Idea').length;
            const discardedCount = sortedList.filter(g => g.state === 'Descartat').length;
            if (discardedCount > 0) {
                countersHtml = `<span class="cnt-pill zero">🚫 ${discardedCount} ${discardedCount === 1 ? 'descartat' : 'descartats'}</span>`;
            } else if (ideasCount > 0) {
                countersHtml = `<span class="cnt-pill zero">0 confirmats · 💡 ${ideasCount} ${ideasCount === 1 ? 'idea' : 'idees'}</span>`;
            } else {
                countersHtml = `<span class="cnt-pill zero">0 regals</span>`;
            }
        }

        const boxEl = document.createElement('div');
        boxEl.className = `person-box ${spec.boxClass} ${isEmpty ? 'is-empty' : ''}`;

        const safeTargetVal = spec.targetVal ? `'${String(spec.targetVal).replace(/'/g, "\\'")}'` : 'null';
        boxEl.innerHTML = `
            <div class="person-box-header">
                <div class="person-box-name">${core.escapeHtml(spec.title)}</div>
                <button type="button" class="person-add-btn" title="Afegir regal" onclick="app.openModalForTarget('${spec.targetType}', ${safeTargetVal})">+</button>
            </div>
            <div class="person-counters">${countersHtml}</div>
            <div class="person-box-cards"></div>
        `;

        const cardsWrap = boxEl.querySelector('.person-box-cards');
        if (isEmpty) {
            cardsWrap.innerHTML = `<div class="person-empty-msg">Cap regal en aquesta vista</div>`;
        } else {
            const ourGifts = [];
            const receivedGifts = [];
            sortedList.forEach(g => {
                const d = core.resolveGiftDisplay(g);
                if (d.isReceivedFromOthers || d.isOtherHouse) receivedGifts.push(g);
                else ourGifts.push(g);
            });

            ourGifts.forEach(g => {
                cardsWrap.appendChild(giftsView.makeCard(g, {
                    boxPerson: spec.boxPerson,
                    isCasaAllBox: spec.isCasaAllBox,
                    sourceContext: { boxId: spec.boxId, boxPerson: spec.boxPerson, isCasaAllBox: spec.isCasaAllBox }
                }));
            });

            if (receivedGifts.length > 0) {
                const divEl = document.createElement('div');
                divEl.className = 'received-divider';
                divEl.innerHTML = `<div class="received-label">🏡 D'una altra casa (Rebrem)</div>`;
                receivedGifts.forEach(g => {
                    divEl.appendChild(giftsView.makeCard(g, {
                        boxPerson: spec.boxPerson,
                        isCasaAllBox: spec.isCasaAllBox,
                        hideOtherHouseBadge: true,
                        sourceContext: { boxId: spec.boxId, boxPerson: spec.boxPerson, isCasaAllBox: spec.isCasaAllBox }
                    }));
                });
                cardsWrap.appendChild(divEl);
            }
        }

        if (typeof spec.dropAction === 'function') {
            giftsView.attachDropTarget(boxEl, spec.dropAction);
        }

        return boxEl;
    },

    reassignGiftToPerson: (giftId, destPerson, sourcePerson = null) => {
        const g = (core.data.gifts || []).find(x => x.id === giftId);
        if (!g) return;
        const d = core.resolveGiftDisplay(g);
        if (d.isOthersSecret) return;

        const recips = giftsView.getRecipientsList(g).slice();
        if (sourcePerson && recips.includes(sourcePerson)) {
            const next = recips.filter(p => p !== sourcePerson);
            if (!next.includes(destPerson)) next.push(destPerson);
            g.recipients = next;
        } else {
            g.recipients = [destPerson];
        }
        delete g.recipient;
        g.updatedAt = Date.now();
        core.saveLocal();
        core.renderAll();
    },

    reassignGiftToCasaAll: (giftId, srcCtx) => {
        const cfg = core.getConfig();
        const casaMembers = cfg.casaMembers || [];
        if (casaMembers.length <= 1) return;

        const g = (core.data.gifts || []).find(x => x.id === giftId);
        if (!g) return;
        const d = core.resolveGiftDisplay(g);
        if (d.isOthersSecret) return;

        const recips = giftsView.getRecipientsList(g).slice();
        if (srcCtx && srcCtx.boxPerson && recips.length > 1) {
            const next = recips.filter(p => p !== srcCtx.boxPerson);
            casaMembers.forEach(m => { if (!next.includes(m)) next.push(m); });
            g.recipients = next;
        } else {
            g.recipients = [...casaMembers];
        }
        delete g.recipient;
        g.updatedAt = Date.now();
        core.saveLocal();
        core.renderAll();
    },

    /* --- VISTA 2: KANBAN PER ESTAT --- */
    renderKanbanByState: (filteredGifts, container) => {
        const board = document.createElement('div');
        board.className = 'kanban-board';

        const visibleStates = STATE_PROGRESS_ORDER.filter(st =>
            st !== 'Descartat' || giftsView.selectedStates.includes('Descartat') || filteredGifts.some(g => g.state === 'Descartat')
        );

        visibleStates.forEach(st => {
            const colItems = giftsView.sortGifts(filteredGifts.filter(g => g.state === st));
            const col = document.createElement('div');
            col.className = 'kanban-col';
            col.innerHTML = `
                <div class="kanban-col-header">
                    <span>${core.escapeHtml(st)}</span>
                    <span class="kanban-col-count">${colItems.length}</span>
                </div>
                <div class="kanban-col-body"></div>
            `;
            const body = col.querySelector('.kanban-col-body');
            colItems.forEach(g => {
                body.appendChild(giftsView.makeCard(g, { hideStateBadge: true }));
            });

            giftsView.attachDropTarget(col, (giftId) => {
                const g = (core.data.gifts || []).find(x => x.id === giftId);
                if (!g || g.state === st) return;
                const d = core.resolveGiftDisplay(g);
                if (d.isOthersSecret) return;

                if (st === 'Confirmat' && d.isPaidByUs) {
                    g.paidByUs = false;
                } else if (st !== 'Confirmat' && st !== 'Descartat' && !d.isPaidByUs) {
                    g.paidByUs = true;
                }
                g.state = st;
                g.updatedAt = Date.now();
                core.saveLocal();
                core.renderAll();
            });

            board.appendChild(col);
        });

        container.appendChild(board);
    },

    /* --- VISTA 3: KANBAN PER DIA / ESDEVENIMENT --- */
    renderKanbanByEvent: (filteredGifts, container) => {
        const cfg = core.getConfig();
        const board = document.createElement('div');
        board.className = 'kanban-board';

        const events = core.getOrderedEvents().filter(ev => ev !== '✨ General Festes');
        const targetEvents = (giftsView.selectedEvent && giftsView.selectedEvent !== 'all')
            ? events.filter(ev => ev === giftsView.selectedEvent)
            : events;

        targetEvents.forEach(ev => {
            const colItems = giftsView.sortGifts(filteredGifts.filter(g => (g.event || '❓ Per decidir') === ev));
            const col = document.createElement('div');
            col.className = 'kanban-col';
            col.innerHTML = `
                <div class="kanban-col-header">
                    <span>${core.escapeHtml(ev)}</span>
                    <span class="kanban-col-count">${colItems.length}</span>
                </div>
                <div class="kanban-col-body"></div>
            `;
            const body = col.querySelector('.kanban-col-body');

            const isBigTio = (ev === cfg.bigTioName);
            if (isBigTio && Array.isArray(cfg.rounds) && cfg.rounds.length > 0 && giftsView.sortBy === 'event') {
                cfg.rounds.forEach(roundName => {
                    const rItems = colItems.filter(g => g.round === roundName);
                    if (rItems.length > 0) {
                        const rHdr = document.createElement('div');
                        rHdr.className = 'kanban-sub-header';
                        rHdr.innerText = `🪵 ${roundName}`;
                        body.appendChild(rHdr);
                        rItems.forEach(g => body.appendChild(giftsView.makeCard(g, { hideEvent: true, hideRound: true })));
                    }
                });
                const noRound = colItems.filter(g => !g.round || !cfg.rounds.includes(g.round));
                if (noRound.length > 0) {
                    const rHdr = document.createElement('div');
                    rHdr.className = 'kanban-sub-header';
                    rHdr.innerText = '🪵 Sense ronda';
                    body.appendChild(rHdr);
                    noRound.forEach(g => body.appendChild(giftsView.makeCard(g, { hideEvent: true, hideRound: true })));
                }
            } else {
                colItems.forEach(g => {
                    body.appendChild(giftsView.makeCard(g, { hideEvent: true }));
                });
            }

            giftsView.attachDropTarget(col, (giftId) => {
                const g = (core.data.gifts || []).find(x => x.id === giftId);
                if (!g || (g.event || '❓ Per decidir') === ev) return;
                const d = core.resolveGiftDisplay(g);
                if (d.isOthersSecret) return;

                g.event = ev;
                if (ev === cfg.bigTioName && !g.round && Array.isArray(cfg.rounds) && cfg.rounds.length > 0) {
                    g.round = cfg.rounds[0];
                } else if (ev !== cfg.bigTioName) {
                    g.round = null;
                }
                g.updatedAt = Date.now();
                core.saveLocal();
                core.renderAll();
            });

            board.appendChild(col);
        });

        container.appendChild(board);
    }
};

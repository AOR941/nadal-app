/* ==========================================================================
 * NADAL TRACKER - JS/LIST.JS (Índex de blocs)
 * [1] Estat del mòdul i helpers d'ordenació / entrega / amplada PC
 * [2] Muntatge de la vista, col·lapse de filtres i píndoles dinàmiques
 * [3] Renderitzat de targetes, llista, graella i Kanban (drag & drop)
 * ========================================================================== */

import { core, STATE_PROGRESS_ORDER } from './core.js';

const DELIVERY_ACTIVE_STATES = ['Comprat/Delivery', 'Decidit', 'Idea'];

export const listView = {
    sectionId: 'listViewSection',
    hideFloatingBtn: () => false,

    /* --- [1] ESTAT DEL MÒDUL I HELPERS D'ORDENACIÓ / ENTREGA / AMPLADA PC --- */
    selectedStates: [],
    selectedEvents: [],
    selectedPeople: [],
    deliveryOnly: false,
    sortBy: 'default', // 'default' | 'event' | 'state' | 'person' | 'price' | 'delivery'
    pcLayout: 'grid',  // 'grid' | 'kanban-state' | 'kanban-event'
    filtersCollapsed: true,
    draggedGiftId: null,

    getEffectivePcLayout: () => {
        if (window.innerWidth <= 768) return 'column';
        return listView.pcLayout || 'grid';
    },

    syncContainerWidth: () => {
        if (core.activeMainView !== 'list') return;
        const mainCont = document.getElementById('mainContainer');
        if (!mainCont) return;
        const layout = listView.getEffectivePcLayout();
        const isKanban = (layout === 'kanban-state' || layout === 'kanban-event');
        mainCont.classList.add('wide-view');
        mainCont.classList.toggle('kanban-wide', isKanban);
    },

    getDeliveryMeta: (g, d) => {
        if (d.isExpense || !d.deliveryDate) return null;
        if (g.state === 'El tenim' || g.state === 'Embolicat') {
            return { date: d.deliveryDate, status: 'done', label: `📦 Entrega: ${listView.formatShortDate(d.deliveryDate)}` };
        }
        const todayStr = listView.getTodayIsoDate();
        if (d.deliveryDate < todayStr) {
            return { date: d.deliveryDate, status: 'overdue', label: `⚠️ Retard (${listView.formatShortDate(d.deliveryDate)})` };
        }
        if (d.deliveryDate === todayStr) {
            return { date: d.deliveryDate, status: 'today', label: `🚚 Arriba avui` };
        }
        return { date: d.deliveryDate, status: 'upcoming', label: `🚚 Entrega: ${listView.formatShortDate(d.deliveryDate)}` };
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

    /* --- [2] MUNTATGE DE LA VISTA, COL·LAPSE DE FILTRES I PÍNDOLES DINÀMIQUES --- */
    mount: () => {
        const sec = document.getElementById(listView.sectionId);
        if (!sec) return;

        sec.innerHTML = `
            <div class="filters-panel">
                <div class="filters-search-row">
                    <input type="text" id="searchFilter" placeholder="🔍 Buscar regal, categoria o notes..." onkeyup="app.views.list.render()">
                    <button type="button" id="toggleFiltersBtn" class="filters-toggle-btn" onclick="app.views.list.toggleFilters()" title="Mostrar o amagar filtres">
                        🎛️ <span id="toggleFiltersText">Filtres</span> <span id="activeFiltersCount" class="filter-count-badge hidden">0</span> <span id="toggleFiltersCaret">▾</span>
                    </button>
                    <button type="button" id="clearFiltersQuickBtn" class="clear-filters-btn hidden" onclick="app.views.list.clearFilters()" title="Netejar tots els filtres">✕</button>
                </div>

                <div id="filtersBody" class="filters-body collapsed">
                    <div class="filter-section">
                        <div class="filter-section-header">
                            <span class="filter-group-label">Nucli de Casa (1 clic · combinació I):</span>
                            <button type="button" id="clearFiltersBtn" class="clear-filters-btn hidden" onclick="app.views.list.clearFilters()">✕ Netejar tot</button>
                        </div>
                        <div id="familyPillsContainer" class="filter-pills-row"></div>
                    </div>

                    <div class="filter-section">
                        <div class="filter-section-header">
                            <span class="filter-group-label">Estats (multi-selecció):</span>
                            <button type="button" id="deliveryFilterBtn" class="filter-pill delivery-pill" onclick="app.views.list.toggleDeliveryFilter()">🚚 En camí</button>
                        </div>
                        <div id="statusPillsContainer" class="filter-pills-row"></div>
                    </div>

                    <div class="filter-section">
                        <span class="filter-group-label">Esdeveniments:</span>
                        <div id="eventPillsContainer" class="filter-pills-row"></div>
                    </div>

                    <div class="filters-selects-row">
                        <select id="typeFilter" onchange="app.views.list.onFilterControlChange()">
                            <option value="all">🎁+🎄 Tot (Regals i Despeses)</option>
                            <option value="gift">🎁 Tots els Regals</option>
                            <option value="gift_ours">🏠 Regals Nostres (Casa)</option>
                            <option value="gift_others">🏡 D'una altra casa (Rebrem)</option>
                            <option value="expense">🎄 Altres Despeses Nadalenques</option>
                        </select>
                        <select id="personFilter" onchange="app.views.list.onFilterControlChange()">
                            <option value="all">👤 Qualsevol altra persona / grup</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="list-toolbar">
                <div class="list-sort-box">
                    <label for="listSortSelect" class="toolbar-mini-label">↕️ Ordenar:</label>
                    <select id="listSortSelect" onchange="app.views.list.onSortChange(this.value)"></select>
                </div>
                <div id="pcLayoutSwitch" class="pc-layout-switch" title="Mode de visualització en pantalla gran">
                    <button type="button" id="pcBtnGrid" class="pc-layout-btn active" onclick="app.views.list.setPcLayout('grid')">▦ Graella</button>
                    <button type="button" id="pcBtnKanbanState" class="pc-layout-btn" onclick="app.views.list.setPcLayout('kanban-state')">📌 Kanban Estat</button>
                    <button type="button" id="pcBtnKanbanEvent" class="pc-layout-btn" onclick="app.views.list.setPcLayout('kanban-event')">📅 Kanban Dia</button>
                </div>
            </div>

            <div id="giftList"></div>
        `;

        window.addEventListener('resize', () => {
            if (core.activeMainView === 'list') listView.render();
        }, { passive: true });
    },

    onConfigChange: (cfg) => {
        const filter = document.getElementById('personFilter');
        if (!filter) return;
        const prevPersonFilter = filter.value;
        filter.innerHTML = '<option value="all">👤 Qualsevol altra persona / grup</option>';

        const tree = {
            "Casa": cfg.casaMembers,
            [cfg.dir1Name]: cfg.dir1Members,
            [cfg.dir2Name]: cfg.dir2Members,
            [cfg.ext1Name]: cfg.ext1Members,
            [cfg.ext2Name]: cfg.ext2Members,
            "Especials": ["Tió", "Reis Mags", "Amics/Altres"]
        };

        Object.entries(tree).forEach(([group, members]) => {
            if (!members || members.length === 0) return;
            const optGroup = document.createElement('optgroup');
            optGroup.label = group;
            members.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.innerText = m;
                optGroup.appendChild(opt);
            });
            filter.appendChild(optGroup);
        });

        if (prevPersonFilter) filter.value = prevPersonFilter;
        listView.renderFilterPills();
        listView.syncSortOptions();
    },

    toggleFilters: () => {
        listView.filtersCollapsed = !listView.filtersCollapsed;
        const body = document.getElementById('filtersBody');
        const caret = document.getElementById('toggleFiltersCaret');
        if (body) body.classList.toggle('collapsed', listView.filtersCollapsed);
        if (caret) caret.innerText = listView.filtersCollapsed ? '▾' : '▴';
    },

    toggleStateFilter: (stateVal) => {
        const idx = listView.selectedStates.indexOf(stateVal);
        if (idx > -1) listView.selectedStates.splice(idx, 1);
        else listView.selectedStates.push(stateVal);
        listView.renderFilterPills();
        listView.render();
    },

    toggleEventFilter: (eventVal) => {
        const idx = listView.selectedEvents.indexOf(eventVal);
        if (idx > -1) listView.selectedEvents.splice(idx, 1);
        else listView.selectedEvents.push(eventVal);
        listView.renderFilterPills();
        listView.render();
    },

    togglePersonPill: (personName) => {
        const idx = listView.selectedPeople.indexOf(personName);
        if (idx > -1) listView.selectedPeople.splice(idx, 1);
        else listView.selectedPeople.push(personName);
        listView.renderFilterPills();
        listView.render();
    },

    toggleAllCasaPills: () => {
        const cfg = core.getConfig();
        const casa = cfg.casaMembers || [];
        const allSelected = casa.length > 0 && casa.every(m => listView.selectedPeople.includes(m));
        listView.selectedPeople = allSelected ? [] : [...casa];
        listView.renderFilterPills();
        listView.render();
    },

    toggleDeliveryFilter: () => {
        listView.deliveryOnly = !listView.deliveryOnly;
        listView.renderFilterPills();
        listView.render();
    },

    onFilterControlChange: () => {
        listView.renderFilterPills();
        listView.render();
    },

    clearFilters: () => {
        listView.selectedStates = [];
        listView.selectedEvents = [];
        listView.selectedPeople = [];
        listView.deliveryOnly = false;
        const searchEl = document.getElementById('searchFilter');
        const typeEl = document.getElementById('typeFilter');
        const personEl = document.getElementById('personFilter');
        if (searchEl) searchEl.value = '';
        if (typeEl) typeEl.value = 'all';
        if (personEl) personEl.value = 'all';
        listView.renderFilterPills();
        listView.render();
    },

    renderFilterPills: () => {
        const statusCont = document.getElementById('statusPillsContainer');
        const eventCont = document.getElementById('eventPillsContainer');
        const famCont = document.getElementById('familyPillsContainer');
        if (!statusCont || !eventCont || !famCont) return;

        const cfg = core.getConfig();
        const events = core.getOrderedEvents();
        listView.selectedEvents = listView.selectedEvents.filter(ev => events.includes(ev));

        statusCont.innerHTML = '';
        core.allGiftStates.forEach(st => {
            const isActive = listView.selectedStates.includes(st.value);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `filter-pill state-pill ${isActive ? 'active' : ''}`;
            btn.innerText = st.label;
            btn.onclick = () => listView.toggleStateFilter(st.value);
            statusCont.appendChild(btn);
        });

        eventCont.innerHTML = '';
        events.forEach(ev => {
            const isActive = listView.selectedEvents.includes(ev);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `filter-pill ${isActive ? 'active' : ''}`;
            btn.innerText = ev;
            btn.onclick = () => listView.toggleEventFilter(ev);
            eventCont.appendChild(btn);
        });

        const casaMembers = cfg.casaMembers || [];
        listView.selectedPeople = listView.selectedPeople.filter(p => casaMembers.includes(p));

        famCont.innerHTML = '';
        casaMembers.forEach(personName => {
            const isActive = listView.selectedPeople.includes(personName);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `filter-pill fam-pill ${isActive ? 'active' : ''}`;
            btn.innerText = personName;
            btn.onclick = () => listView.togglePersonPill(personName);
            famCont.appendChild(btn);
        });

        if (casaMembers.length > 1) {
            const allSelected = casaMembers.every(m => listView.selectedPeople.includes(m));
            const allBtn = document.createElement('button');
            allBtn.type = 'button';
            allBtn.className = `filter-pill fam-pill fam-all-pill ${allSelected ? 'active' : ''}`;
            allBtn.innerText = `🏠 Tots ${casaMembers.length}`;
            allBtn.onclick = () => listView.toggleAllCasaPills();
            famCont.appendChild(allBtn);
        }

        const delivBtn = document.getElementById('deliveryFilterBtn');
        if (delivBtn) delivBtn.classList.toggle('active', listView.deliveryOnly);

        const typeVal = document.getElementById('typeFilter')?.value || 'all';
        const personVal = document.getElementById('personFilter')?.value || 'all';
        const activeCount =
            listView.selectedStates.length +
            listView.selectedEvents.length +
            listView.selectedPeople.length +
            (listView.deliveryOnly ? 1 : 0) +
            (typeVal !== 'all' ? 1 : 0) +
            (personVal !== 'all' ? 1 : 0);

        const countBadge = document.getElementById('activeFiltersCount');
        const toggleBtn = document.getElementById('toggleFiltersBtn');
        const clearBtn = document.getElementById('clearFiltersBtn');
        const clearQuickBtn = document.getElementById('clearFiltersQuickBtn');

        if (countBadge && toggleBtn) {
            if (activeCount > 0) {
                countBadge.innerText = activeCount;
                countBadge.classList.remove('hidden');
                toggleBtn.classList.add('has-active');
                if (clearBtn) clearBtn.classList.remove('hidden');
                if (clearQuickBtn) clearQuickBtn.classList.remove('hidden');
            } else {
                countBadge.classList.add('hidden');
                toggleBtn.classList.remove('has-active');
                if (clearBtn) clearBtn.classList.add('hidden');
                if (clearQuickBtn) clearQuickBtn.classList.add('hidden');
            }
        }
    },

    syncSortOptions: () => {
        const sel = document.getElementById('listSortSelect');
        if (!sel) return;
        const layout = listView.getEffectivePcLayout();

        const options = [
            { value: 'default', label: "Ordre d'entrada" },
            { value: 'event', label: 'Esdeveniment (cronològic)' },
            { value: 'state', label: 'Estat (progrés)' },
            { value: 'person', label: 'Persona' },
            { value: 'price', label: 'Preu (€)' },
            { value: 'delivery', label: "Data d'entrega" }
        ].filter(opt => {
            if (layout === 'kanban-state' && opt.value === 'state') return false;
            if (layout === 'kanban-event' && opt.value === 'event') return false;
            return true;
        });

        if (!options.some(o => o.value === listView.sortBy)) {
            listView.sortBy = 'default';
        }

        sel.innerHTML = options.map(o => `<option value="${o.value}" ${o.value === listView.sortBy ? 'selected' : ''}>${o.label}</option>`).join('');
    },

    onSortChange: (val) => {
        listView.sortBy = val;
        listView.render();
    },

    setPcLayout: (mode) => {
        listView.pcLayout = mode;
        document.getElementById('pcBtnGrid')?.classList.toggle('active', mode === 'grid');
        document.getElementById('pcBtnKanbanState')?.classList.toggle('active', mode === 'kanban-state');
        document.getElementById('pcBtnKanbanEvent')?.classList.toggle('active', mode === 'kanban-event');
        listView.syncSortOptions();
        listView.render();
    },

    /* --- [3] RENDERITZAT DE TARGETES, LLISTA, GRAELLA I KANBAN (DRAG & DROP) --- */
    matchesFilters: (g, search, typeF, person) => {
        const itemType = g.type || 'gift';
        const d = core.resolveGiftDisplay(g);

        if (typeF === 'gift' && itemType !== 'gift') return false;
        if (typeF === 'expense' && itemType !== 'expense') return false;
        if (typeF === 'gift_ours' && (itemType !== 'gift' || d.isOtherHouse)) return false;
        if (typeF === 'gift_others' && (itemType !== 'gift' || !d.isOtherHouse)) return false;

        if (listView.deliveryOnly) {
            const hasDelivery = !d.isExpense && (Boolean(d.deliveryDate) || (g.state === 'Comprat/Delivery' && DELIVERY_ACTIVE_STATES.includes(g.state)));
            if (!hasDelivery) return false;
        }

        if (listView.selectedStates.length > 0 && !listView.selectedStates.includes(g.state)) return false;

        const evVal = g.event || '❓ Per decidir';
        if (listView.selectedEvents.length > 0 && !listView.selectedEvents.includes(evVal)) return false;

        // Intersecció (I / AND): el regal ha d'incloure TOTES les persones marcades
        if (listView.selectedPeople.length > 0) {
            if (d.isExpense || !listView.selectedPeople.every(p => d.recips.includes(p))) return false;
        }

        if (person !== 'all' && (d.isExpense || !d.recips.includes(person))) return false;

        const recipsText = d.recips.join(', ');
        const fromsText = d.froms.join(', ');
        const searchableText = `${d.titleDisplay} ${recipsText} ${fromsText} ${d.commentsDisplay} ${g.expenseCat || ''} ${g.event || ''}`.toLowerCase();
        if (search && !searchableText.includes(search)) return false;

        return true;
    },

    sortGifts: (items) => {
        const mode = listView.sortBy;
        if (mode === 'default') return items.slice();

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
                const pA = da.isExpense ? 'zzz' : (da.recips[0] || 'zzz');
                const pB = db.isExpense ? 'zzz' : (db.recips[0] || 'zzz');
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

    render: () => {
        const cfg = core.getConfig();
        const list = document.getElementById('giftList');
        if (!list) return;

        listView.syncContainerWidth();
        listView.syncSortOptions();
        list.innerHTML = '';

        const search = (document.getElementById('searchFilter')?.value || '').toLowerCase();
        const typeF = document.getElementById('typeFilter')?.value || 'all';
        const person = document.getElementById('personFilter')?.value || 'all';

        const filtered = core.data.gifts.filter(g => listView.matchesFilters(g, search, typeF, person));
        const sorted = listView.sortGifts(filtered);

        if (sorted.length === 0) {
            list.innerHTML = `<div class="person-empty-msg" style="background:white; padding:24px;">Cap element coincideix amb els filtres seleccionats.</div>`;
            return;
        }

        const layout = listView.getEffectivePcLayout();

        if (layout === 'kanban-state') {
            listView.renderKanbanByState(sorted, list);
            return;
        }
        if (layout === 'kanban-event') {
            listView.renderKanbanByEvent(sorted, list);
            return;
        }

        const isOnlyBigTioSelected = (listView.selectedEvents.length === 1 && listView.selectedEvents[0] === cfg.bigTioName);
        const wrapper = document.createElement('div');
        wrapper.className = layout === 'grid' ? 'list-grid-pc' : 'list-column';

        if (isOnlyBigTioSelected && cfg.rounds.length > 0 && listView.sortBy === 'default') {
            cfg.rounds.forEach(roundName => {
                const roundGifts = sorted.filter(g => g.round === roundName);
                if (roundGifts.length > 0) {
                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'round-header grid-span-all';
                    headerDiv.innerText = `🪵 ${roundName}`;
                    wrapper.appendChild(headerDiv);
                    roundGifts.forEach(g => wrapper.appendChild(listView.createCardElement(g, true)));
                }
            });

            const ungroupedGifts = sorted.filter(g => !g.round || !cfg.rounds.includes(g.round));
            if (ungroupedGifts.length > 0) {
                const headerDiv = document.createElement('div');
                headerDiv.className = 'round-header grid-span-all';
                headerDiv.innerText = '🪵 Altres / Sense ronda';
                wrapper.appendChild(headerDiv);
                ungroupedGifts.forEach(g => wrapper.appendChild(listView.createCardElement(g, true)));
            }
        } else {
            sorted.forEach(g => wrapper.appendChild(listView.createCardElement(g, true)));
        }

        list.appendChild(wrapper);
    },

    renderKanbanByState: (items, container) => {
        const board = document.createElement('div');
        board.className = 'kanban-board';

        STATE_PROGRESS_ORDER.forEach(st => {
            const colItems = items.filter(g => g.state === st);
            const col = document.createElement('div');
            col.className = 'kanban-col';
            col.dataset.targetState = st;

            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.classList.add('drag-over');
            });
            col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('drag-over');
                listView.handleDropOnState(st);
            });

            col.innerHTML = `
                <div class="kanban-col-header">
                    <span>${st}</span>
                    <span class="kanban-col-count">${colItems.length}</span>
                </div>
                <div class="kanban-col-body"></div>
            `;
            const body = col.querySelector('.kanban-col-body');
            colItems.forEach(g => body.appendChild(listView.createCardElement(g, true, true)));
            board.appendChild(col);
        });

        container.appendChild(board);
    },

    renderKanbanByEvent: (items, container) => {
        const board = document.createElement('div');
        board.className = 'kanban-board';
        const events = core.getOrderedEvents().filter(ev => ev !== '✨ General Festes');

        events.forEach(ev => {
            const colItems = items.filter(g => (g.event || '❓ Per decidir') === ev);
            const col = document.createElement('div');
            col.className = 'kanban-col';
            col.dataset.targetEvent = ev;

            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.classList.add('drag-over');
            });
            col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('drag-over');
                listView.handleDropOnEvent(ev);
            });

            col.innerHTML = `
                <div class="kanban-col-header">
                    <span>${ev}</span>
                    <span class="kanban-col-count">${colItems.length}</span>
                </div>
                <div class="kanban-col-body"></div>
            `;
            const body = col.querySelector('.kanban-col-body');
            colItems.forEach(g => body.appendChild(listView.createCardElement(g, true, true)));
            board.appendChild(col);
        });

        container.appendChild(board);
    },

    handleDropOnState: (newState) => {
        const id = listView.draggedGiftId;
        listView.draggedGiftId = null;
        if (!id) return;

        const g = core.data.gifts.find(x => x.id === id);
        if (!g || g.state === newState) return;

        const d = core.resolveGiftDisplay(g);
        if (d.isOthersSecret) return;

        if (!d.isExpense) {
            if (newState === 'Confirmat' && d.isPaidByUs) {
                g.paidByUs = false;
            } else if (newState !== 'Confirmat' && !d.isPaidByUs) {
                g.paidByUs = true;
            }
        }

        g.state = newState;
        g.updatedAt = Date.now();
        core.saveLocal();
        core.renderAll();
    },

    handleDropOnEvent: (newEvent) => {
        const cfg = core.getConfig();
        const id = listView.draggedGiftId;
        listView.draggedGiftId = null;
        if (!id) return;

        const g = core.data.gifts.find(x => x.id === id);
        if (!g || (g.event || '❓ Per decidir') === newEvent) return;

        const d = core.resolveGiftDisplay(g);
        if (d.isOthersSecret) return;

        g.event = newEvent;
        if (newEvent === cfg.bigTioName && !g.round && cfg.rounds.length > 0) {
            g.round = cfg.rounds[0];
        } else if (newEvent !== cfg.bigTioName) {
            g.round = null;
        }
        g.updatedAt = Date.now();
        core.saveLocal();
        core.renderAll();
    },

    createCardElement: (g, bypassFilters = false, enableDrag = false) => {
        const d = core.resolveGiftDisplay(g);
        const recipsText = d.recips.join(', ');
        const fromsText = d.froms.join(', ');

        const div = document.createElement('div');
        const extClass = d.isExpense ? 'expense' : (d.isOthersSecret ? 'secret' : (d.isOtherHouse ? 'altres' : ''));
        div.className = `card ${extClass}`;

        if (enableDrag && !d.isOthersSecret) {
            div.draggable = true;
            div.addEventListener('dragstart', () => {
                listView.draggedGiftId = g.id;
                div.classList.add('dragging');
            });
            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });
        }

        div.onclick = () => {
            if (!d.isOthersSecret) core.openModal(g.id);
            else alert("Top Secret! 🤫 Això és cosa de " + g.createdBy);
        };

        const badgeClass = g.state === 'Idea' ? 'idea'
            : (g.state === 'Decidit' ? 'decidit'
            : (g.state === 'Confirmat' ? 'confirmat'
            : (g.state === 'Embolicat' || g.state === 'El tenim' ? 'comprat' : '')));

        const subtitleHtml = d.isExpense
            ? `<span class="badge expense-cat">${g.expenseCat || '🎄 Despesa'}</span>${g.event ? ' | ' + g.event : ''}`
            : `👤 <b>${recipsText}</b> | ${g.event || '❓ Per decidir'} ${g.round ? '(' + g.round + ')' : ''}`;

        let content = `
            <div class="card-header">
                <div class="card-title">${d.isExpense ? '🎄 ' : ''}${d.titleDisplay}</div>
                <div><span class="badge ${badgeClass}">${g.state}</span></div>
            </div>
            <div style="font-size:0.85em; color:#555; margin-bottom: 5px;">
                ${subtitleHtml}
            </div>
        `;

        if (!d.isOthersSecret) {
            const delivMeta = listView.getDeliveryMeta(g, d);
            if (delivMeta) {
                content += `<div style="margin: 5px 0;"><span class="badge delivery-badge ${delivMeta.status}">${delivMeta.label}</span></div>`;
            }

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

                if (!d.isExpense && fromsText) {
                    content += `<div style="font-size:0.85em; margin-top: 5px;">🤝 De part de: <b>${fromsText}</b></div>`;
                }
                if (!d.isExpense && d.jointContributors.length > 0) {
                    content += `<div style="margin-top:5px;"><span class="badge joint-badge">🤝 Conjunt amb: ${d.jointContributors.join(', ')}</span></div>`;
                }
            }

            if (d.commentsDisplay) content += `<div style="font-size:0.85em; color:#444; background:#f8f9fa; padding:6px 8px; border-radius:6px; margin-top:8px; font-style:italic;">📝 ${d.commentsDisplay}</div>`;
            if (d.shopUrl) content += `<div style="margin-top:8px;"><a href="${d.shopUrl}" target="_blank" onclick="event.stopPropagation();" style="color:var(--c-green-dark); font-size:0.85em; text-decoration:none; font-weight:bold;">🛒 Veure enllaç</a></div>`;
            if (d.imgUrl) content += `<img src="${d.imgUrl}" style="width:100%; max-height:150px; border-radius:8px; margin-top:10px; object-fit:cover;">`;
        }

        div.innerHTML = content;
        return div;
    }
};

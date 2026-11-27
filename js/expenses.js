/* ==========================================================================
 * NADAL TRACKER - JS/EXPENSES.JS (Índex de blocs)
 * [1] Estat del mòdul i helpers d'agrupació i import
 * [2] Muntatge de la vista, filtres i canvi de mode
 * [3] Renderitzat per Categoria, Kanban per Estat i drag & drop
 * ========================================================================== */

import { core } from './core.js';

const EXPENSE_KANBAN_STATES = [
    'Idea',
    'Decidit',
    'Comprat/Delivery',
    'El tenim',
    'Embolicat',
    'Descartat'
];

export const expensesView = {
    sectionId: 'expensesViewSection',
    hideFloatingBtn: () => false,

    /* --- [1] ESTAT DEL MÒDUL I HELPERS D'AGRUPACIÓ I IMPORT --- */
    viewMode: 'category', // 'category' | 'kanban-state'
    selectedCat: 'all',
    selectedState: 'all',
    draggedExpenseId: null,

    getItemPrice: (g) => {
        const d = core.resolveGiftDisplay(g);
        return d.priceVal || 0;
    },

    isPlannedState: (state) => state === 'Idea' || state === 'Decidit',

    getAdventTotals: () => {
        let spent = 0;
        let planned = 0;
        let count = 0;

        Object.values(core.data.advent || {}).forEach(item => {
            if (!item || !item.title || !item.title.trim()) return;
            count++;
            const parsed = core.parseMoneyInput(item.price);
            const p = Number.isNaN(parsed) ? 0 : parsed;
            if (item.state === 'Comprat') spent += p;
            else planned += p;
        });

        (core.data.adventPool || []).forEach(item => {
            if (!item || !item.title || !item.title.trim()) return;
            count++;
            const parsed = core.parseMoneyInput(item.price);
            const p = Number.isNaN(parsed) ? 0 : parsed;
            if (item.state === 'Comprat') spent += p;
            else planned += p;
        });

        return { spent, planned, count };
    },

    /* --- [2] MUNTATGE DE LA VISTA, FILTRES I CANVI DE MODE --- */
    mount: () => {
        const sec = document.getElementById(expensesView.sectionId);
        if (!sec) return;

        sec.innerHTML = `
            <div id="expensesSummaryCard" class="expenses-summary-card"></div>

            <div class="expenses-toolbar">
                <div class="gifts-mode-switch" role="tablist" aria-label="Vista de despeses">
                    <button type="button" id="expModeBtnCat" class="gifts-mode-btn active" onclick="app.views.expenses.setViewMode('category')">🗂️ Categories</button>
                    <button type="button" id="expModeBtnState" class="gifts-mode-btn" onclick="app.views.expenses.setViewMode('kanban-state')">📋 Kanban Estat</button>
                </div>

                <div class="expenses-filters-row">
                    <input type="text" id="expenseSearchInput" class="gifts-search-input" placeholder="🔍 Buscar despesa o notes..." oninput="app.views.expenses.render()">

                    <select id="expenseCatFilter" onchange="app.views.expenses.onCatFilterChange(this.value)">
                        <option value="all">🗂️ Totes les categories</option>
                    </select>

                    <select id="expenseStateFilter" onchange="app.views.expenses.onStateFilterChange(this.value)">
                        <option value="all">🏷️ Tots els estats actius</option>
                        <option value="Idea">💡 Idea</option>
                        <option value="Decidit">🎯 Decidit</option>
                        <option value="Comprat/Delivery">🚚 Comprat/Delivery</option>
                        <option value="El tenim">✅ El tenim</option>
                        <option value="Embolicat">🎀 Embolicat</option>
                        <option value="Descartat">🚫 Descartats</option>
                    </select>
                </div>
            </div>

            <div id="expensesContentContainer"></div>
        `;
    },

    onConfigChange: () => {
        const sel = document.getElementById('expenseCatFilter');
        if (!sel) return;
        const cats = core.getExpenseCategories();
        sel.innerHTML = '<option value="all">🗂️ Totes les categories</option>';
        cats.forEach(cat => {
            sel.innerHTML += `<option value="${core.escapeHtml(cat)}">${core.escapeHtml(cat)}</option>`;
        });
        if (expensesView.selectedCat !== 'all' && cats.includes(expensesView.selectedCat)) {
            sel.value = expensesView.selectedCat;
        } else {
            expensesView.selectedCat = 'all';
            sel.value = 'all';
        }
    },

    setViewMode: (mode) => {
        expensesView.viewMode = mode;
        document.getElementById('expModeBtnCat')?.classList.toggle('active', mode === 'category');
        document.getElementById('expModeBtnState')?.classList.toggle('active', mode === 'kanban-state');
        expensesView.syncContainerWidth();
        expensesView.render();
    },

    syncContainerWidth: () => {
        if (core.activeMainView !== 'expenses') return;
        const mainCont = document.getElementById('mainContainer');
        if (!mainCont) return;
        mainCont.classList.add('wide-view');
        mainCont.classList.toggle('kanban-wide', expensesView.viewMode === 'kanban-state');
    },

    onCatFilterChange: (val) => {
        expensesView.selectedCat = val || 'all';
        expensesView.render();
    },

    onStateFilterChange: (val) => {
        expensesView.selectedState = val || 'all';
        expensesView.render();
    },

    matchesExpense: (g, search, ignoreCat = false, ignoreState = false) => {
        if ((g.type || 'gift') !== 'expense') return false;
        const cat = g.expenseCat || '🎉 Altres despeses nadalenques';

        if (!ignoreCat && expensesView.selectedCat !== 'all' && cat !== expensesView.selectedCat) {
            return false;
        }

        if (!ignoreState) {
            if (expensesView.selectedState !== 'all') {
                if (g.state !== expensesView.selectedState) return false;
            } else if (g.state === 'Descartat' && !search) {
                return false;
            }
        }

        if (search) {
            const d = core.resolveGiftDisplay(g);
            const hay = `${d.titleDisplay} ${cat} ${d.commentsDisplay} ${g.event || ''}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }

        return true;
    },

    /* --- [3] RENDERITZAT PER CATEGORIA, KANBAN PER ESTAT I DRAG & DROP --- */
    render: () => {
        expensesView.syncContainerWidth();
        const search = (document.getElementById('expenseSearchInput')?.value || '').trim().toLowerCase();
        const activeExpenses = (core.data.gifts || []).filter(g => expensesView.matchesExpense(g, search));

        expensesView.renderSummary(activeExpenses);

        const container = document.getElementById('expensesContentContainer');
        if (!container) return;
        container.innerHTML = '';

        if (expensesView.viewMode === 'kanban-state') {
            expensesView.renderKanbanByState(activeExpenses, container);
        } else {
            expensesView.renderByCategory(activeExpenses, container);
        }
    },

    renderSummary: (items) => {
        const summaryEl = document.getElementById('expensesSummaryCard');
        if (!summaryEl) return;

        let spent = 0;
        let planned = 0;
        items.forEach(g => {
            const p = expensesView.getItemPrice(g);
            if (expensesView.isPlannedState(g.state)) planned += p;
            else spent += p;
        });

        const advTotals = expensesView.getAdventTotals();
        const showAdventNote = (expensesView.selectedCat === 'all' || expensesView.selectedCat === "🗓️ Calendari d'Advent")
            && (advTotals.spent > 0 || advTotals.planned > 0);

        summaryEl.innerHTML = `
            <div class="advent-summary-top">
                <div class="advent-summary-title">🎄 Despeses Nadalenques</div>
                <button type="button" class="expenses-add-btn" onclick="app.openModalForTarget('expenseCat', ${expensesView.selectedCat !== 'all' ? `'${expensesView.selectedCat.replace(/'/g, "\\'")}'` : 'null'})">+ Nova despesa</button>
            </div>
            <div class="advent-stats-row">
                <span class="advent-stat-chip" style="background:#d4efdf; color:#1e8449;">💰 Gastat: ${core.formatMoney(spent)}</span>
                <span class="advent-stat-chip" style="background:#fdebd0; color:#b9770e;">⏳ Previst: ${core.formatMoney(planned)}</span>
                <span class="advent-stat-chip">${items.length} ${items.length === 1 ? 'partida' : 'partides'}</span>
            </div>
            ${showAdventNote ? `
                <div class="sl-banner-note">
                    🕯️ <b>Calendari d'Advent</b> es gestiona a la seva pestanya i suma al pressupost: <b>${core.formatMoney(advTotals.spent)}</b> gastats${advTotals.planned > 0 ? ` (+${core.formatMoney(advTotals.planned)} previstos)` : ''}.
                </div>
            ` : ''}
        `;
    },

    attachDropTarget: (el, onDropFn) => {
        el.addEventListener('dragover', (e) => {
            if (!expensesView.draggedExpenseId) return;
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
            const id = expensesView.draggedExpenseId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
            expensesView.draggedExpenseId = null;
            if (id) onDropFn(id);
        });
    },

    makeExpenseCard: (g, opts = {}) => {
        return core.createCardElement(g, Object.assign({
            draggable: true,
            onDragStart: (item) => {
                expensesView.draggedExpenseId = item.id;
            },
            onDragEnd: () => {
                expensesView.draggedExpenseId = null;
                document.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
            }
        }, opts));
    },

    renderByCategory: (items, container) => {
        const cats = core.getExpenseCategories();
        const visibleCats = expensesView.selectedCat !== 'all'
            ? cats.filter(c => c === expensesView.selectedCat)
            : cats;

        const grid = document.createElement('div');
        grid.className = 'expenses-cat-grid';

        visibleCats.forEach(cat => {
            const catItems = items.filter(g => (g.expenseCat || '🎉 Altres despeses nadalenques') === cat);
            let catSpent = 0;
            let catPlanned = 0;
            catItems.forEach(g => {
                const p = expensesView.getItemPrice(g);
                if (expensesView.isPlannedState(g.state)) catPlanned += p;
                else catSpent += p;
            });

            const isAdventCat = (cat === "🗓️ Calendari d'Advent");
            const advInfo = isAdventCat ? expensesView.getAdventTotals() : null;
            const totalSpentDisplay = isAdventCat ? catSpent + advInfo.spent : catSpent;
            const totalPlannedDisplay = isAdventCat ? catPlanned + advInfo.planned : catPlanned;

            const section = document.createElement('div');
            section.className = `expense-cat-section ${catItems.length === 0 ? 'is-empty' : ''}`;

            const safeCatArg = `'${cat.replace(/'/g, "\\'")}'`;
            section.innerHTML = `
                <div class="expense-cat-header">
                    <div>
                        <div class="expense-cat-title">${core.escapeHtml(cat)}</div>
                        <div class="expense-cat-meta">
                            <span>Gastat: <b>${core.formatMoney(totalSpentDisplay)}</b></span>
                            ${totalPlannedDisplay > 0 ? `<span>· Previst: <b>${core.formatMoney(totalPlannedDisplay)}</b></span>` : ''}
                        </div>
                    </div>
                    <button type="button" class="person-add-btn" title="Afegir despesa a ${core.escapeHtml(cat)}" onclick="app.openModalForTarget('expenseCat', ${safeCatArg})">+</button>
                </div>
                <div class="expense-cat-body"></div>
            `;

            const body = section.querySelector('.expense-cat-body');
            if (isAdventCat && advInfo && advInfo.count > 0) {
                const advBox = document.createElement('div');
                advBox.className = 'expense-advent-link-box';
                advBox.innerHTML = `
                    <span>🕯️ ${advInfo.count} partides al Calendari d'Advent (${core.formatMoney(advInfo.spent)} gastats)</span>
                    <button type="button" class="preset-btn" onclick="app.switchMainView('advent')">Obrir Advent →</button>
                `;
                body.appendChild(advBox);
            }

            if (catItems.length === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'person-empty-msg';
                emptyEl.innerText = isAdventCat
                    ? "Cap despesa manual aquí (les d'Advent es gestionen al calendari)"
                    : "Cap despesa en aquesta categoria";
                body.appendChild(emptyEl);
            } else {
                catItems.forEach(g => {
                    body.appendChild(expensesView.makeExpenseCard(g, { hideExpenseCat: true }));
                });
            }

            expensesView.attachDropTarget(section, (expenseId) => {
                const g = (core.data.gifts || []).find(x => x.id === expenseId && (x.type || 'gift') === 'expense');
                if (!g || (g.expenseCat || '🎉 Altres despeses nadalenques') === cat) return;
                g.expenseCat = cat;
                g.updatedAt = Date.now();
                core.saveLocal();
                core.renderAll();
            });

            grid.appendChild(section);
        });

        container.appendChild(grid);
    },

    renderKanbanByState: (items, container) => {
        const board = document.createElement('div');
        board.className = 'kanban-board';

        const visibleStates = EXPENSE_KANBAN_STATES.filter(st =>
            st !== 'Descartat' || expensesView.selectedState === 'Descartat' || items.some(g => g.state === 'Descartat')
        );

        visibleStates.forEach(st => {
            const colItems = items.filter(g => g.state === st);
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
                body.appendChild(expensesView.makeExpenseCard(g, { hideStateBadge: true }));
            });

            expensesView.attachDropTarget(col, (expenseId) => {
                const g = (core.data.gifts || []).find(x => x.id === expenseId && (x.type || 'gift') === 'expense');
                if (!g || g.state === st) return;
                g.state = st;
                g.updatedAt = Date.now();
                core.saveLocal();
                core.renderAll();
            });

            board.appendChild(col);
        });

        container.appendChild(board);
    }
};

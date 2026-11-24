/* ==========================================================================
 * NADAL TRACKER - JS/ADVENT.JS (Índex de blocs)
 * [1] Estat del mòdul i helpers d'opcions de data
 * [2] Muntatge de la vista, modal d'Advent i filtres
 * [3] Renderitzat dels 24 dies, Bateria d'Idees i gestió del modal
 * ========================================================================== */

import { core } from './core.js';

export const adventView = {
    sectionId: 'adventViewSection',
    hideFloatingBtn: () => true,

    /* --- [1] ESTAT DEL MÒDUL I HELPERS D'OPCIONS DE DATA --- */
    activeFilter: 'all', // 'all' | 'empty' | 'planned' | 'done'

    buildDaySelectOptions: (selectedDayStr = 'pool', currentDayStr = '') => {
        const advData = core.data.advent || {};
        let opts = `<option value="pool" ${selectedDayStr === 'pool' ? 'selected' : ''}>🧺 Sense data (Bateria d'idees)</option>`;
        for (let d = 1; d <= 24; d++) {
            const key = String(d);
            const item = advData[key];
            const hasTitle = Boolean(item && item.title && item.title.trim());
            let suffix = '⬜ Buit';
            if (key === currentDayStr) suffix = '📍 Dia actual';
            else if (hasTitle) suffix = `⚠️ Ocupat: ${item.title.slice(0, 22)}${item.title.length > 22 ? '…' : ''}`;
            opts += `<option value="${key}" ${selectedDayStr === key ? 'selected' : ''}>Dia ${d} des. (${suffix})</option>`;
        }
        return opts;
    },

    /* --- [2] MUNTATGE DE LA VISTA, MODAL D'ADVENT I FILTRES --- */
    mount: () => {
        const sec = document.getElementById(adventView.sectionId);
        if (sec) {
            sec.innerHTML = `
                <div id="adventSummaryCard" class="advent-summary-card"></div>

                <div class="advent-filter-bar">
                    <button type="button" id="advFilterAll" class="filter-pill active" onclick="app.views.advent.setFilter('all')">🗓️ Tots (24)</button>
                    <button type="button" id="advFilterEmpty" class="filter-pill" onclick="app.views.advent.setFilter('empty')">⬜ Buits</button>
                    <button type="button" id="advFilterPlanned" class="filter-pill" onclick="app.views.advent.setFilter('planned')">💡 Idees / Decidits</button>
                    <button type="button" id="advFilterDone" class="filter-pill" onclick="app.views.advent.setFilter('done')">✅ A punt</button>
                </div>

                <div id="adventGridContainer"></div>
                <div id="adventPoolSection" class="advent-pool-section"></div>
            `;
        }

        if (!document.getElementById('adventModal')) {
            const modalEl = document.createElement('div');
            modalEl.id = 'adventModal';
            modalEl.className = 'modal';
            modalEl.innerHTML = `
                <div class="modal-content">
                    <h2 id="advModalTitle" style="margin-bottom: 4px;">🕯️ Dia 1 de Desembre</h2>
                    <div id="advModalSubtitle" class="adv-modal-sub"></div>
                    <input type="hidden" id="advDayInput">
                    <input type="hidden" id="advPoolIdInput">

                    <div id="advPickFromPoolBox" class="adv-pick-pool-box hidden">
                        <label class="cfg-label" style="margin-top:0; color:var(--c-green-dark);">🧺 Assignar des de la Bateria d'Idees:</label>
                        <div class="adv-pick-pool-row">
                            <select id="advPickFromPoolSelect"></select>
                            <button type="button" onclick="app.views.advent.assignSelectedPoolToCurrentDay()">Assignar</button>
                        </div>
                    </div>

                    <label class="cfg-label">Què toca? (Regalet o activitat):</label>
                    <input type="text" id="advTitle" placeholder="Ex: Llibre de Nadal, Taller de galetes, Adhesius...">

                    <label class="cfg-label">Data assignada:</label>
                    <select id="advTargetDaySelect"></select>

                    <label class="cfg-label">Estat:</label>
                    <select id="advState">
                        <option value="Idea">💡 Idea (Pendent de decidir)</option>
                        <option value="Decidit">🎯 Decidit (Pendent de comprar/preparar)</option>
                        <option value="Comprat">✅ A punt / Comprat (Suma a despesa)</option>
                    </select>

                    <label class="cfg-label">Preu (€) (Opcional — suma a Calendari d'Advent):</label>
                    <div class="price-row">
                        <input type="number" id="advPrice" step="0.01" placeholder="Ex: 6.50 (Opcional)">
                        <select id="advPriceType">
                            <option value="definitive">✅ Preu Definitiu</option>
                            <option value="approx">~ Preu Aproximat</option>
                        </select>
                    </div>

                    <label class="cfg-label">URL / Enllaç (Opcional):</label>
                    <input type="url" id="advUrl" placeholder="https://...">

                    <label class="cfg-label">Notes / On ho tenim guardat (Opcional):</label>
                    <textarea id="advComments" rows="2" placeholder="Ex: Guardat a l'armari de dalt, imprimir val..."></textarea>

                    <div style="display:flex; gap:10px; margin-top: 20px;">
                        <button onclick="app.views.advent.saveModal()">Guardar</button>
                        <button class="danger" onclick="app.closeModal('adventModal')">Cancel·lar</button>
                    </div>
                    <div style="display:flex; gap:10px; margin-top: 10px;">
                        <button type="button" id="btnMoveAdventToPool" class="secondary hidden" onclick="app.views.advent.moveCurrentDayToPool()">📥 Tornar a la bateria</button>
                        <button type="button" id="btnClearAdvent" class="danger hidden" onclick="app.views.advent.deleteOrClear()" style="background:#999;">🗑️ Buidar / Eliminar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
        }
    },

    setFilter: (filterVal) => {
        adventView.activeFilter = filterVal;
        const map = {
            all: 'advFilterAll',
            empty: 'advFilterEmpty',
            planned: 'advFilterPlanned',
            done: 'advFilterDone'
        };
        Object.entries(map).forEach(([k, id]) => {
            document.getElementById(id)?.classList.toggle('active', k === filterVal);
        });
        adventView.render();
    },

    /* --- [3] RENDERITZAT DELS 24 DIES, BATERIA D'IDEES I GESTIÓ DEL MODAL --- */
    render: () => {
        const year = core.getChristmasYear();
        const kids = core.getKidsList();
        const kidsLabel = kids.length > 0 ? kids.join(' i ') : 'Nenes de casa';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const advData = core.data.advent || {};
        const poolList = core.data.adventPool || [];

        let doneCount = 0;
        let plannedCount = 0;
        let emptyCount = 0;
        let spentTotal = 0;
        let pendingTotal = 0;

        for (let d = 1; d <= 24; d++) {
            const item = advData[String(d)];
            const hasTitle = Boolean(item && item.title && item.title.trim());
            if (!hasTitle) {
                emptyCount++;
            } else {
                const p = parseFloat(item.price) || 0;
                if (item.state === 'Comprat') {
                    doneCount++;
                    spentTotal += p;
                } else {
                    plannedCount++;
                    pendingTotal += p;
                }
            }
        }

        poolList.forEach(item => {
            if (!item || !item.title || !item.title.trim()) return;
            const p = parseFloat(item.price) || 0;
            if (item.state === 'Comprat') spentTotal += p;
            else pendingTotal += p;
        });

        const summaryEl = document.getElementById('adventSummaryCard');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="advent-summary-top">
                    <div class="advent-summary-title">🕯️ Calendari d'Advent ${year}</div>
                    <span class="advent-kids-pill">👧👧 ${kidsLabel}</span>
                </div>
                <div class="advent-stats-row">
                    <span class="advent-stat-chip" style="background:#d4efdf; color:#1e8449;">✅ A punt: ${doneCount}/24</span>
                    <span class="advent-stat-chip" style="background:#fdebd0; color:#b9770e;">💡 Idees/Decidits: ${plannedCount}</span>
                    <span class="advent-stat-chip">⬜ Buits: ${emptyCount}</span>
                    <span class="advent-stat-chip" style="background:#fef9e7; color:#9a7d0a;">🧺 Bateria: ${poolList.length}</span>
                    <span class="advent-stat-chip" style="background:#f4fbf7; color:var(--c-green-dark);">💰 Gastat: ${spentTotal.toFixed(2)} €${pendingTotal > 0 ? ` (Previst: +${pendingTotal.toFixed(2)} €)` : ''}</span>
                </div>
            `;
        }

        const dec1 = new Date(year, 11, 1);
        const startOffset = (dec1.getDay() + 6) % 7;
        const weekdayShort = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds'];

        let html = `
            <div class="advent-weekdays">
                <div class="advent-weekday-head">Dl</div>
                <div class="advent-weekday-head">Dt</div>
                <div class="advent-weekday-head">Dc</div>
                <div class="advent-weekday-head">Dj</div>
                <div class="advent-weekday-head">Dv</div>
                <div class="advent-weekday-head">Ds</div>
                <div class="advent-weekday-head">Dg</div>
            </div>
            <div class="advent-grid">
        `;

        if (adventView.activeFilter === 'all') {
            for (let i = 0; i < startOffset; i++) {
                html += `<div class="advent-offset-cell"></div>`;
            }
        }

        for (let d = 1; d <= 24; d++) {
            const item = advData[String(d)];
            const hasTitle = Boolean(item && item.title && item.title.trim());
            const state = hasTitle ? (item.state || 'Idea') : 'empty';

            if (adventView.activeFilter === 'empty' && hasTitle) continue;
            if (adventView.activeFilter === 'planned' && (!hasTitle || state === 'Comprat')) continue;
            if (adventView.activeFilter === 'done' && (!hasTitle || state !== 'Comprat')) continue;

            const cellDate = new Date(year, 11, d);
            const wday = weekdayShort[cellDate.getDay()];
            const isPast = cellDate < today;
            const isToday = cellDate.getTime() === today.getTime();

            const stateClass = !hasTitle ? 'adv-empty'
                : (state === 'Comprat' ? 'adv-comprat'
                : (state === 'Decidit' ? 'adv-decidit' : 'adv-idea'));

            const cardClasses = [
                'advent-card',
                stateClass,
                isPast ? 'adv-past' : '',
                isToday ? 'adv-today' : ''
            ].filter(Boolean).join(' ');

            let dateBadge = '';
            if (isToday) dateBadge = `<span class="advent-date-tag today">✨ Avui</span>`;
            else if (isPast) dateBadge = `<span class="advent-date-tag past">Passat</span>`;

            let badgeHtml = '';
            if (!hasTitle) badgeHtml = `<span class="mini-badge">⬜ Buit</span>`;
            else if (state === 'Comprat') badgeHtml = `<span class="mini-badge comprat">✅ A punt</span>`;
            else if (state === 'Decidit') badgeHtml = `<span class="mini-badge decidit">🎯 Decidit</span>`;
            else badgeHtml = `<span class="mini-badge idea">💡 Idea</span>`;

            const p = hasTitle ? (parseFloat(item.price) || 0) : 0;
            const priceHtml = p > 0 ? `<b>${item.isApprox ? '~' : ''}${p}€</b>` : '';
            const notePreview = (hasTitle && item.comments && item.comments.trim())
                ? `<div class="advent-note-preview">📝 ${item.comments.trim()}</div>`
                : '';

            html += `
                <div class="${cardClasses}" onclick="app.views.advent.openDayModal(${d})">
                    <div class="advent-card-top">
                        <div class="advent-day-num">${d} <span class="advent-day-wday">${wday}</span></div>
                        ${dateBadge}
                    </div>
                    <div class="advent-card-body">
                        ${hasTitle
                            ? `<div class="advent-title">${item.title}</div>${notePreview}`
                            : `<div class="advent-empty-text">Toca per afegir idea...</div>`
                        }
                    </div>
                    <div class="advent-card-footer">
                        ${badgeHtml}
                        ${priceHtml}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        const gridEl = document.getElementById('adventGridContainer');
        if (gridEl) gridEl.innerHTML = html;

        adventView.renderPool();
    },

    renderPool: () => {
        const container = document.getElementById('adventPoolSection');
        if (!container) return;
        const poolList = core.data.adventPool || [];

        let dayOptionsHtml = `<option value="">📅 Assignar dia...</option>`;
        for (let d = 1; d <= 24; d++) {
            const existing = (core.data.advent || {})[String(d)];
            const hasTitle = Boolean(existing && existing.title && existing.title.trim());
            dayOptionsHtml += `<option value="${d}">${hasTitle ? `Dia ${d} (ocupat)` : `Dia ${d} des. (⬜ Buit)`}</option>`;
        }

        let cardsHtml = '';
        if (poolList.length === 0) {
            cardsHtml = `<div class="person-empty-msg">Encara no hi ha idees a la bateria. Afegeix-ne aquí dalt per anar-les assignant als dies buits!</div>`;
        } else {
            cardsHtml = `<div class="advent-pool-grid">`;
            poolList.forEach(item => {
                const st = item.state || 'Idea';
                const stateCls = st === 'Comprat' ? 'adv-comprat' : (st === 'Decidit' ? 'adv-decidit' : '');
                const badgeHtml = st === 'Comprat'
                    ? `<span class="mini-badge comprat">✅ A punt</span>`
                    : (st === 'Decidit' ? `<span class="mini-badge decidit">🎯 Decidit</span>` : `<span class="mini-badge idea">💡 Idea</span>`);
                const p = parseFloat(item.price) || 0;
                const priceHtml = p > 0 ? `<b style="font-size:0.82em;">${item.isApprox ? '~' : ''}${p}€</b>` : '';
                const noteHtml = (item.comments && item.comments.trim())
                    ? `<div class="advent-note-preview">📝 ${item.comments.trim()}</div>`
                    : '';

                cardsHtml += `
                    <div class="advent-pool-card ${stateCls}" onclick="app.views.advent.openPoolModal('${item.id}')">
                        <div>
                            <div class="advent-pool-card-top">
                                <div class="advent-title">${item.title}</div>
                                ${priceHtml}
                            </div>
                            ${noteHtml}
                        </div>
                        <div>
                            <div style="margin-bottom:6px;">${badgeHtml}</div>
                            <div class="advent-pool-assign-row" onclick="event.stopPropagation()">
                                <select class="advent-pool-assign-select" onchange="app.views.advent.quickAssignPoolItem('${item.id}', this.value); this.value='';">
                                    ${dayOptionsHtml}
                                </select>
                            </div>
                        </div>
                    </div>
                `;
            });
            cardsHtml += `</div>`;
        }

        container.innerHTML = `
            <div class="advent-pool-header">
                <div class="advent-pool-title">🧺 Bateria d'Idees (Sense data assignada)</div>
                <span class="badge">${poolList.length} ${poolList.length === 1 ? 'idea' : 'idees'}</span>
            </div>
            <div class="advent-quick-add">
                <input type="text" id="advPoolQuickInput" placeholder="Nova idea per a l'Advent (ex: Llibre, Galetes...)" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.views.advent.quickAddPool();}">
                <button type="button" onclick="app.views.advent.quickAddPool()">+ Afegir</button>
            </div>
            ${cardsHtml}
        `;
    },

    quickAddPool: () => {
        const input = document.getElementById('advPoolQuickInput');
        if (!input) return;
        const title = input.value.trim();
        if (!title) return;

        if (!core.data.adventPool) core.data.adventPool = [];
        core.data.adventPool.push({
            id: Date.now().toString(),
            title,
            state: 'Idea',
            price: '',
            isApprox: false,
            url: '',
            comments: '',
            updatedAt: Date.now()
        });

        input.value = '';
        core.saveLocal();
        core.renderAll();
    },

    quickAssignPoolItem: (poolId, dayStr) => {
        if (!dayStr) return;
        const poolList = core.data.adventPool || [];
        const poolItem = poolList.find(x => x.id === poolId);
        if (!poolItem) return;

        if (!core.data.advent) core.data.advent = {};
        const existingDay = core.data.advent[dayStr];
        const dayHasContent = Boolean(existingDay && existingDay.title && existingDay.title.trim());

        if (dayHasContent) {
            if (!confirm(`El dia ${dayStr} ja té "${existingDay.title}". Vols moure'l a la bateria d'idees i posar-hi "${poolItem.title}"?`)) {
                return;
            }
            core.data.adventPool.push({
                id: Date.now().toString() + '_ret',
                title: existingDay.title,
                state: existingDay.state || 'Idea',
                price: existingDay.price || '',
                isApprox: Boolean(existingDay.isApprox),
                url: existingDay.url || '',
                comments: existingDay.comments || '',
                updatedAt: Date.now()
            });
        }

        core.data.advent[dayStr] = {
            day: Number(dayStr),
            title: poolItem.title,
            state: poolItem.state || 'Idea',
            price: poolItem.price || '',
            isApprox: Boolean(poolItem.isApprox),
            url: poolItem.url || '',
            comments: poolItem.comments || '',
            updatedAt: Date.now()
        };

        core.data.adventPool = core.data.adventPool.filter(x => x.id !== poolId);
        if (!core.data.deletedIds) core.data.deletedIds = [];
        if (!core.data.deletedIds.includes(poolId)) core.data.deletedIds.push(poolId);

        core.saveLocal();
        core.renderAll();
    },

    openDayModal: (day) => {
        const year = core.getChristmasYear();
        const kids = core.getKidsList();
        const kidsLabel = kids.length > 0 ? kids.join(' i ') : 'Nenes de casa';

        const cellDate = new Date(year, 11, day);
        const weekdayFull = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'][cellDate.getDay()];

        document.getElementById('advDayInput').value = String(day);
        document.getElementById('advPoolIdInput').value = '';
        document.getElementById('advModalTitle').innerText = `🕯️ Dia ${day} de Desembre`;
        document.getElementById('advModalSubtitle').innerText = `${weekdayFull}, ${day} des. ${year} · 👧👧 ${kidsLabel}`;

        const poolList = core.data.adventPool || [];
        const pickBox = document.getElementById('advPickFromPoolBox');
        const pickSel = document.getElementById('advPickFromPoolSelect');
        if (poolList.length > 0) {
            pickSel.innerHTML = '';
            poolList.forEach(item => {
                const icon = item.state === 'Comprat' ? '✅' : (item.state === 'Decidit' ? '🎯' : '💡');
                const p = parseFloat(item.price) || 0;
                const priceTag = p > 0 ? ` (${item.isApprox ? '~' : ''}${p}€)` : '';
                pickSel.innerHTML += `<option value="${item.id}">${icon} ${item.title}${priceTag}</option>`;
            });
            pickBox.classList.remove('hidden');
        } else {
            pickBox.classList.add('hidden');
        }

        const existing = (core.data.advent || {})[String(day)];
        const hasContent = Boolean(existing && existing.title && existing.title.trim());

        document.getElementById('advTargetDaySelect').innerHTML = adventView.buildDaySelectOptions(String(day), String(day));
        document.getElementById('advTitle').value = hasContent ? existing.title : '';
        document.getElementById('advState').value = hasContent ? (existing.state || 'Idea') : 'Idea';
        document.getElementById('advPrice').value = hasContent ? (existing.price || '') : '';
        document.getElementById('advPriceType').value = (hasContent && existing.isApprox) ? 'approx' : 'definitive';
        document.getElementById('advUrl').value = hasContent ? (existing.url || '') : '';
        document.getElementById('advComments').value = hasContent ? (existing.comments || '') : '';

        document.getElementById('btnMoveAdventToPool').classList.toggle('hidden', !hasContent);
        document.getElementById('btnClearAdvent').innerText = '🗑️ Buidar aquest dia';
        document.getElementById('btnClearAdvent').classList.toggle('hidden', !hasContent);
        document.getElementById('adventModal').style.display = 'block';
    },

    openPoolModal: (poolId) => {
        const poolItem = (core.data.adventPool || []).find(x => x.id === poolId);
        if (!poolItem) return;

        const kids = core.getKidsList();
        const kidsLabel = kids.length > 0 ? kids.join(' i ') : 'Nenes de casa';

        document.getElementById('advDayInput').value = '';
        document.getElementById('advPoolIdInput').value = poolId;
        document.getElementById('advModalTitle').innerText = `🧺 Idea per a l'Advent`;
        document.getElementById('advModalSubtitle').innerText = `Sense data assignada · 👧👧 ${kidsLabel}`;

        document.getElementById('advPickFromPoolBox').classList.add('hidden');
        document.getElementById('advTargetDaySelect').innerHTML = adventView.buildDaySelectOptions('pool', '');

        document.getElementById('advTitle').value = poolItem.title || '';
        document.getElementById('advState').value = poolItem.state || 'Idea';
        document.getElementById('advPrice').value = poolItem.price || '';
        document.getElementById('advPriceType').value = poolItem.isApprox ? 'approx' : 'definitive';
        document.getElementById('advUrl').value = poolItem.url || '';
        document.getElementById('advComments').value = poolItem.comments || '';

        document.getElementById('btnMoveAdventToPool').classList.add('hidden');
        document.getElementById('btnClearAdvent').innerText = '🗑️ Eliminar idea';
        document.getElementById('btnClearAdvent').classList.remove('hidden');
        document.getElementById('adventModal').style.display = 'block';
    },

    assignSelectedPoolToCurrentDay: () => {
        const dayStr = document.getElementById('advDayInput').value;
        const poolId = document.getElementById('advPickFromPoolSelect').value;
        if (!dayStr || !poolId) return;
        core.closeModal('adventModal');
        adventView.quickAssignPoolItem(poolId, dayStr);
    },

    moveCurrentDayToPool: () => {
        const dayStr = document.getElementById('advDayInput').value;
        if (!dayStr) return;

        const title = document.getElementById('advTitle').value.trim();
        if (!core.data.adventPool) core.data.adventPool = [];

        if (title) {
            core.data.adventPool.push({
                id: Date.now().toString(),
                title,
                state: document.getElementById('advState').value,
                price: document.getElementById('advPrice').value,
                isApprox: document.getElementById('advPriceType').value === 'approx',
                url: document.getElementById('advUrl').value.trim(),
                comments: document.getElementById('advComments').value.trim(),
                updatedAt: Date.now()
            });
        }

        if (!core.data.advent) core.data.advent = {};
        core.data.advent[dayStr] = {
            day: Number(dayStr),
            title: '',
            state: 'Idea',
            price: '',
            isApprox: false,
            url: '',
            comments: '',
            updatedAt: Date.now()
        };

        core.saveLocal();
        core.closeModal('adventModal');
        core.renderAll();
    },

    saveModal: () => {
        const sourceDay = document.getElementById('advDayInput').value;
        const sourcePoolId = document.getElementById('advPoolIdInput').value;
        const targetDay = document.getElementById('advTargetDaySelect').value;
        const title = document.getElementById('advTitle').value.trim();

        if (!title) {
            alert("Escriu què toca (o prem el botó d'eliminar/buidar).");
            return;
        }

        const itemData = {
            title,
            state: document.getElementById('advState').value,
            price: document.getElementById('advPrice').value,
            isApprox: document.getElementById('advPriceType').value === 'approx',
            url: document.getElementById('advUrl').value.trim(),
            comments: document.getElementById('advComments').value.trim(),
            updatedAt: Date.now()
        };

        if (!core.data.advent) core.data.advent = {};
        if (!core.data.adventPool) core.data.adventPool = [];
        if (!core.data.deletedIds) core.data.deletedIds = [];

        if (targetDay !== 'pool' && targetDay !== sourceDay) {
            const destExisting = core.data.advent[targetDay];
            if (destExisting && destExisting.title && destExisting.title.trim()) {
                if (!confirm(`El dia ${targetDay} ja té "${destExisting.title}". Vols moure'l a la bateria d'idees i substituir-lo?`)) {
                    return;
                }
                core.data.adventPool.push({
                    id: Date.now().toString() + '_swap',
                    title: destExisting.title,
                    state: destExisting.state || 'Idea',
                    price: destExisting.price || '',
                    isApprox: Boolean(destExisting.isApprox),
                    url: destExisting.url || '',
                    comments: destExisting.comments || '',
                    updatedAt: Date.now()
                });
            }
        }

        if (targetDay === 'pool') {
            if (sourcePoolId) {
                const idx = core.data.adventPool.findIndex(x => x.id === sourcePoolId);
                if (idx > -1) core.data.adventPool[idx] = Object.assign({ id: sourcePoolId }, itemData);
                else core.data.adventPool.push(Object.assign({ id: sourcePoolId }, itemData));
            } else {
                core.data.adventPool.push(Object.assign({ id: Date.now().toString() }, itemData));
            }
        } else {
            core.data.advent[targetDay] = Object.assign({ day: Number(targetDay) }, itemData);
        }

        if (sourceDay && targetDay !== sourceDay) {
            core.data.advent[sourceDay] = {
                day: Number(sourceDay),
                title: '',
                state: 'Idea',
                price: '',
                isApprox: false,
                url: '',
                comments: '',
                updatedAt: Date.now()
            };
        }
        if (sourcePoolId && targetDay !== 'pool') {
            core.data.adventPool = core.data.adventPool.filter(x => x.id !== sourcePoolId);
            if (!core.data.deletedIds.includes(sourcePoolId)) core.data.deletedIds.push(sourcePoolId);
        }

        core.saveLocal();
        core.closeModal('adventModal');
        core.renderAll();
    },

    deleteOrClear: () => {
        const sourceDay = document.getElementById('advDayInput').value;
        const sourcePoolId = document.getElementById('advPoolIdInput').value;

        if (sourcePoolId) {
            if (!confirm("Segur que vols eliminar aquesta idea de la bateria?")) return;
            core.data.adventPool = (core.data.adventPool || []).filter(x => x.id !== sourcePoolId);
            if (!core.data.deletedIds) core.data.deletedIds = [];
            if (!core.data.deletedIds.includes(sourcePoolId)) core.data.deletedIds.push(sourcePoolId);
        } else if (sourceDay) {
            if (!core.data.advent) core.data.advent = {};
            core.data.advent[sourceDay] = {
                day: Number(sourceDay),
                title: '',
                state: 'Idea',
                price: '',
                isApprox: false,
                url: '',
                comments: '',
                updatedAt: Date.now()
            };
        }

        core.saveLocal();
        core.closeModal('adventModal');
        core.renderAll();
    },

    handleBackdrop: () => {
        const title = document.getElementById('advTitle')?.value.trim() || '';
        if (!title) {
            core.closeModal('adventModal');
            return;
        }
        adventView.saveModal();
    }
};

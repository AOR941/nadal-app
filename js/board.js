/* ==========================================================================
 * NADAL TRACKER - JS/BOARD.JS (Índex de blocs)
 * [1] Estat del mòdul i helpers d'ordenació dins cada caixa
 * [2] Muntatge de la vista i filtres ràpids de família
 * [3] Renderitzat del Mapa per Persona i mini-targetes
 * ========================================================================== */

import { core } from './core.js';

export const boardView = {
    sectionId: 'boardViewSection',
    hideFloatingBtn: () => false,

    /* --- [1] ESTAT DEL MÒDUL I HELPERS D'ORDENACIÓ DINS CADA CAIXA --- */
    selectedPeople: [],
    sortBy: 'event', // 'event' | 'state' | 'price' | 'delivery'

    sortMiniGifts: (items) => {
        const mode = boardView.sortBy;
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

    /* --- [2] MUNTATGE DE LA VISTA I FILTRES RÀPIDS DE FAMÍLIA --- */
    mount: () => {
        const sec = document.getElementById(boardView.sectionId);
        if (!sec) return;

        sec.innerHTML = `
            <div class="board-filters">
                <select id="boardEventFilter" onchange="app.views.board.render()">
                    <option value="all">📅 Tots els esdeveniments</option>
                </select>
                <select id="boardStatusFilter" onchange="app.views.board.render()">
                    <option value="all">🏷️ Tots (Consolidats + Idees)</option>
                    <option value="consolidated">✅ Només Consolidats (sense Idees)</option>
                    <option value="Idea">💡 Només Idees</option>
                    <option value="pending">⏳ Pendents nostres de comprar/tenir</option>
                </select>
                <select id="boardPersonSelect" onchange="app.views.board.render()">
                    <option value="all">👤 Totes les persones</option>
                </select>
                <div class="list-sort-box" style="margin-top:0;">
                    <label for="boardSortSelect" class="toolbar-mini-label">↕️ Ordre:</label>
                    <select id="boardSortSelect" onchange="app.views.board.onSortChange(this.value)">
                        <option value="event">Esdeveniment</option>
                        <option value="state">Estat</option>
                        <option value="price">Preu (€)</option>
                        <option value="delivery">Entrega</option>
                    </select>
                </div>
                <label class="board-toggle-empty">
                    <input type="checkbox" id="boardHideEmpty" onchange="app.views.board.render()">
                    Amagar buides
                </label>
                <div id="boardFamilyPills" class="filter-pills-row" style="width:100%; padding-top:6px; border-top:1px dashed #ece5d8;"></div>
            </div>

            <div id="personBoardContainer"></div>
        `;
    },

    onConfigChange: (cfg) => {
        const bEv = document.getElementById('boardEventFilter');
        if (bEv) {
            const prevBEv = bEv.value;
            bEv.innerHTML = '<option value="all">📅 Tots els esdeveniments</option>';
            core.getOrderedEvents()
                .filter(ev => ev !== '✨ General Festes')
                .forEach(ev => {
                    bEv.innerHTML += `<option value="${ev}">${ev}</option>`;
                });
            if (prevBEv) bEv.value = prevBEv;
        }

        const pSel = document.getElementById('boardPersonSelect');
        if (pSel) {
            const prevP = pSel.value;
            pSel.innerHTML = '<option value="all">👤 Totes les persones</option>';
            const tree = {
                "Casa": cfg.casaMembers,
                [cfg.dir1Name]: cfg.dir1Members,
                [cfg.dir2Name]: cfg.dir2Members,
                [cfg.ext1Name]: cfg.ext1Members,
                [cfg.ext2Name]: cfg.ext2Members
            };
            Object.entries(tree).forEach(([group, members]) => {
                if (!members || members.length === 0) return;
                const og = document.createElement('optgroup');
                og.label = group;
                members.forEach(m => {
                    og.innerHTML += `<option value="${m}">${m}</option>`;
                });
                pSel.appendChild(og);
            });
            if (prevP) pSel.value = prevP;
        }

        boardView.renderFamilyPills();
    },

    togglePersonPill: (personName) => {
        const idx = boardView.selectedPeople.indexOf(personName);
        if (idx > -1) boardView.selectedPeople.splice(idx, 1);
        else boardView.selectedPeople.push(personName);
        boardView.renderFamilyPills();
        boardView.render();
    },

    renderFamilyPills: () => {
        const pillsCont = document.getElementById('boardFamilyPills');
        if (!pillsCont) return;
        const cfg = core.getConfig();
        const quickFamily = [...cfg.casaMembers, ...cfg.dir1Members, ...cfg.dir2Members];
        boardView.selectedPeople = boardView.selectedPeople.filter(p => quickFamily.includes(p));

        pillsCont.innerHTML = '';
        quickFamily.forEach(personName => {
            const isActive = boardView.selectedPeople.includes(personName);
            const label = /\(gos/i.test(personName) ? `🐶 ${personName.replace(/\s*\(gos.*?\)/i, '')}` : personName;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `filter-pill fam-pill ${isActive ? 'active' : ''}`;
            btn.innerText = label;
            btn.onclick = () => boardView.togglePersonPill(personName);
            pillsCont.appendChild(btn);
        });
    },

    onSortChange: (val) => {
        boardView.sortBy = val;
        boardView.render();
    },

    /* --- [3] RENDERITZAT DEL MAPA PER PERSONA I MINI-TARGETES --- */
    render: () => {
        const cfg = core.getConfig();
        const container = document.getElementById('personBoardContainer');
        if (!container) return;
        container.innerHTML = '';

        const eventF = document.getElementById('boardEventFilter')?.value || 'all';
        const statusF = document.getElementById('boardStatusFilter')?.value || 'all';
        const personSel = document.getElementById('boardPersonSelect')?.value || 'all';
        const hideEmpty = Boolean(document.getElementById('boardHideEmpty')?.checked);

        const activePersonSet = new Set(boardView.selectedPeople);
        if (personSel !== 'all') activePersonSet.add(personSel);
        const hasPersonFilter = activePersonSet.size > 0;

        const filteredGifts = core.data.gifts.filter(g => {
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
            if (hasPersonFilter && !activePersonSet.has(personName)) return;
            const giftsForBox = filteredGifts.filter(g => {
                const r = g.recipients || (g.recipient ? [g.recipient] : []);
                return !isGiftForCasa4(r) && r.includes(personName);
            });
            if (hideEmpty && giftsForBox.length === 0) return;
            casaHtml += boardView.buildPersonBoxHtml(personName, giftsForBox, "casa-box", "person", personName, false);
        });

        const casa4Gifts = filteredGifts.filter(g => {
            const r = g.recipients || (g.recipient ? [g.recipient] : []);
            return isGiftForCasa4(r);
        });
        if (!hasPersonFilter && (!hideEmpty || casa4Gifts.length > 0)) {
            casaHtml += boardView.buildPersonBoxHtml(`🏠 Casa / Els ${casaFour.length}`, casa4Gifts, "casa-box", "casa4", null, false);
        }

        if (casaHtml) {
            container.innerHTML += `<div class="board-section-title">🏠 Nucli Familiar</div><div class="board-grid-casa">${casaHtml}</div>`;
        }

        // 2. SECCIÓ FAMILIARS DIRECTES
        const directList = [...cfg.dir1Members, ...cfg.dir2Members];
        let directesHtml = '';
        directList.forEach(memberName => {
            if (hasPersonFilter && !activePersonSet.has(memberName)) return;
            const giftsForMember = filteredGifts.filter(g => {
                const r = g.recipients || (g.recipient ? [g.recipient] : []);
                return r.includes(memberName);
            });
            if (hideEmpty && giftsForMember.length === 0) return;
            const displayLabel = /\(gos/i.test(memberName) ? `🐶 ${memberName.replace(/\s*\(gos.*?\)/i, '')}` : memberName;
            directesHtml += boardView.buildPersonBoxHtml(displayLabel, giftsForMember, "directe-box", "person", memberName, false);
        });

        if (directesHtml) {
            container.innerHTML += `<div class="board-section-title">👨‍👩‍👧‍👦 Familiars Directes</div><div class="board-grid-directes">${directesHtml}</div>`;
        }

        // 3. SECCIÓ ALTRES FAMILIARS
        const ext1Gifts = filteredGifts.filter(g => {
            const r = g.recipients || (g.recipient ? [g.recipient] : []);
            return r.some(p => cfg.ext1Members.includes(p));
        });
        const ext2Gifts = filteredGifts.filter(g => {
            const r = g.recipients || (g.recipient ? [g.recipient] : []);
            return r.some(p => cfg.ext2Members.includes(p));
        });

        let altresHtml = '';
        if (!hasPersonFilter && (!hideEmpty || ext1Gifts.length > 0)) {
            altresHtml += boardView.buildPersonBoxHtml(`🌿 ${cfg.ext1Name}`, ext1Gifts, "altres-box", "group", null, true);
        }
        if (!hasPersonFilter && (!hideEmpty || ext2Gifts.length > 0)) {
            altresHtml += boardView.buildPersonBoxHtml(`🌿 ${cfg.ext2Name}`, ext2Gifts, "altres-box", "group", null, true);
        }

        if (altresHtml) {
            container.innerHTML += `<div class="board-section-title">🌳 Altres Familiars</div><div class="board-grid-altres">${altresHtml}</div>`;
        }
    },

    buildPersonBoxHtml: (boxTitle, giftsList, boxClass, targetType, targetVal, showSpecificRecipients) => {
        const sortedList = boardView.sortMiniGifts(giftsList);
        const isEmpty = (sortedList.length === 0);
        const eventBadges = core.getEventShortBadges();

        const consolidatedGifts = sortedList.filter(g => g.state !== 'Idea');
        let countersHtml = '';

        eventBadges.forEach(evObj => {
            const count = consolidatedGifts.filter(g => (g.event || '❓ Per decidir') === evObj.name).length;
            if (count > 0) {
                countersHtml += `<span class="cnt-pill" title="${evObj.name}">${evObj.icon} ${count}</span>`;
            }
        });

        if (!countersHtml) {
            const ideasCount = sortedList.filter(g => g.state === 'Idea').length;
            countersHtml = ideasCount > 0
                ? `<span class="cnt-pill zero">0 confirmats · 💡 ${ideasCount} ${ideasCount === 1 ? 'idea' : 'idees'}</span>`
                : `<span class="cnt-pill zero">0 regals</span>`;
        }

        const ourGifts = [];
        const receivedGifts = [];

        sortedList.forEach(g => {
            const d = core.resolveGiftDisplay(g);
            if (d.isReceivedFromOthers || d.isOtherHouse) receivedGifts.push({ g, d });
            else ourGifts.push({ g, d });
        });

        let bodyHtml = '';
        if (isEmpty) {
            bodyHtml = `<div class="person-empty-msg">No hi ha regals planificats</div>`;
        } else {
            ourGifts.forEach(({ g, d }) => {
                bodyHtml += boardView.buildMiniCardHtml(g, d, showSpecificRecipients, false);
            });

            if (receivedGifts.length > 0) {
                bodyHtml += `<div class="received-divider"><div class="received-label">🏡 D'una altra casa (Rebrem)</div>`;
                receivedGifts.forEach(({ g, d }) => {
                    bodyHtml += boardView.buildMiniCardHtml(g, d, showSpecificRecipients, true);
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
        const cfg = core.getConfig();
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
        } else if (!isReceived && d.jointContributors.length > 0) {
            extraLine += `<div style="font-size:0.72em; color:#0e6251; margin-top:2px;">🤝 Conjunt: <b>${d.jointContributors.join(', ')}</b></div>`;
        }
        if (!d.isOthersSecret && d.deliveryDate && g.state !== 'El tenim' && g.state !== 'Embolicat') {
            extraLine += `<div style="font-size:0.72em; color:#b9770e; margin-top:2px;">🚚 ${d.deliveryDate}</div>`;
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

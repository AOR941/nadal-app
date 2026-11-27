/* ==========================================================================
 * NADAL TRACKER - JS/SANTALLUCIA.JS (Índex de blocs)
 * [1] Estat del mòdul i helpers
 * [2] Muntatge de la vista
 * [3] Renderitzat de la vista de Santa Llúcia
 * ========================================================================== */

import { core } from './core.js';

export const santaLluciaView = {
    sectionId: 'santaLluciaViewSection',
    hideFloatingBtn: () => false,

    /* --- [1] ESTAT DEL MÒDUL I HELPERS --- */
    openNewExpense: () => {
        core.openModal(null);
        core.setItemType('expense', 'Idea');
        document.getElementById('gExpenseCat').value = '🍲 Dinar de Santa Llúcia';
    },

    /* --- [2] MUNTATGE DE LA VISTA --- */
    mount: () => {
        const sec = document.getElementById(santaLluciaView.sectionId);
        if (!sec) return;

        sec.innerHTML = `
            <div id="santaLluciaSummary" class="sl-summary-card"></div>
            <div id="santaLluciaList"></div>
        `;
    },

    /* --- [3] RENDERITZAT DE LA VISTA DE SANTA LLÚCIA --- */
render: () => {
        const slItems = (core.data.gifts || []).filter(
            g => (g.type || 'gift') === 'expense'
                && g.expenseCat === '🍲 Dinar de Santa Llúcia'
                && g.state !== 'Descartat'
        );

        let spent = 0;
        let planned = 0;
        slItems.forEach(g => {
            const d = core.resolveGiftDisplay(g);
            const p = d.priceVal || 0;
            if (g.state === 'Idea' || g.state === 'Decidit') planned += p;
            else spent += p;
        });

        const summaryEl = document.getElementById('santaLluciaSummary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="advent-summary-top">
                    <div class="advent-summary-title">🍲 Dinar de Santa Llúcia</div>
                    <span class="badge expense-cat">${slItems.length} ${slItems.length === 1 ? 'partida' : 'partides'}</span>
                </div>
                <div class="advent-stats-row">
                    <span class="advent-stat-chip" style="background:#d4efdf; color:#1e8449;">💰 Gastat: ${core.formatMoney(spent)}</span>
                    <span class="advent-stat-chip" style="background:#fdebd0; color:#b9770e;">⏳ Previst / Idees: ${core.formatMoney(planned)}</span>
                </div>
                <div class="sl-banner-note">
                    📋 Espai preparat per planificar menú, assistents i tasques del dinar. Mentrestant, aquí tens sincronitzades totes les despeses vinculades a <b>🍲 Dinar de Santa Llúcia</b>.
                </div>
                <button type="button" onclick="app.views.santallucia.openNewExpense()" style="margin-top:0;">+ Afegir despesa de Santa Llúcia</button>
            `;
        }

        const listEl = document.getElementById('santaLluciaList');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (slItems.length === 0) {
            listEl.innerHTML = `<div class="person-empty-msg" style="background:white; padding:24px;">Encara no hi ha cap despesa apuntada per al Dinar de Santa Llúcia.</div>`;
        } else {
            slItems.forEach(g => {
                listEl.appendChild(core.createCardElement(g, { hideExpenseCat: true }));
            });
        }
    }
};

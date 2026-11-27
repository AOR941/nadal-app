/* ==========================================================================
 * NADAL TRACKER - JS/MAIN.JS (Punt d'entrada de l'aplicació)
 * Registra els mòduls de vista i arrenca el nucli `core`.
 * ========================================================================== */

import { core } from './core.js';
import { giftsView } from './gifts.js';
import { expensesView } from './expenses.js';
import { adventView } from './advent.js';
import { santaLluciaView } from './santallucia.js';

core.views.gifts = giftsView;
core.views.expenses = expensesView;
core.views.advent = adventView;
core.views.santallucia = santaLluciaView;

// Exposició global mínima per als esdeveniments inline del DOM i modals
window.app = core;

window.addEventListener('DOMContentLoaded', () => {
    core.init();
});

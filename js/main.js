/* ==========================================================================
 * NADAL TRACKER - JS/MAIN.JS (Punt d'entrada de l'aplicació)
 * Registra els mòduls de vista i arrenca el nucli `core`.
 * ========================================================================== */

import { core } from './core.js';
import { listView } from './list.js';
import { boardView } from './board.js';
import { adventView } from './advent.js';
import { santaLluciaView } from './santallucia.js';

core.views.list = listView;
core.views.board = boardView;
core.views.advent = adventView;
core.views.santallucia = santaLluciaView;

// Exposició global mínima per als esdeveniments inline del DOM i modals
window.app = core;

window.addEventListener('DOMContentLoaded', () => {
    core.init();
});

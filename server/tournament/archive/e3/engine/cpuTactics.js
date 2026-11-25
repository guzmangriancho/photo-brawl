"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keepRange = exports.distanceScale = exports.usesAttackMix = exports.DEFAULT_CPU_TACTICS = void 0;
exports.normalizeCpuTactics = normalizeCpuTactics;
exports.setCloseMix = setCloseMix;
exports.DEFAULT_CPU_TACTICS = {
    distance: 50, closeLight: 42, closeHeavy: 28, closeTech: 30, midTech: 44, farTech: 42,
    afterHit: 0, afterBlock: 0, jumpIn: 22,
};
const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
function normalizeCpuTactics(input) {
    const base = { ...exports.DEFAULT_CPU_TACTICS, ...(input || {}) };
    let l = clamp(base.closeLight), h = clamp(base.closeHeavy), t = clamp(base.closeTech);
    const sum = l + h + t;
    if (sum <= 0) {
        l = exports.DEFAULT_CPU_TACTICS.closeLight;
        h = exports.DEFAULT_CPU_TACTICS.closeHeavy;
        t = exports.DEFAULT_CPU_TACTICS.closeTech;
    }
    else {
        l = l * 100 / sum;
        h = h * 100 / sum;
        t = t * 100 / sum;
    }
    return { distance: clamp(base.distance), closeLight: l, closeHeavy: h, closeTech: t,
        midTech: clamp(base.midTech), farTech: clamp(base.farTech), afterHit: clamp(base.afterHit), afterBlock: clamp(base.afterBlock), jumpIn: clamp(base.jumpIn) };
}
/** Zoner and grappler keep their own attack tables: the attack-mix controls only apply to the other archetypes. */
const usesAttackMix = (archetype) => archetype !== 'ZONER_MAGE' && archetype !== 'GRAPPLER_TANK';
exports.usesAttackMix = usesAttackMix;
/** Multiplier for every hardcoded distance threshold. 50 -> 1 (unchanged). */
const distanceScale = (t) => 0.7 + t.distance / 100 * 0.6;
exports.distanceScale = distanceScale;
/**
 * Range the CPU tries to hold. Below 50 (or at the classic 50) it keeps the
 * classic approach behaviour (returns 0). Above 50 it walks back when the
 * rival is closer than this and waits when it is already at range: 111 px at 51
 * up to 405 px at 100.
 */
const keepRange = (t) => t.distance > 50 ? 105 + (t.distance - 50) * 6 : 0;
exports.keepRange = keepRange;
/** Changing one share keeps the three summing to 100 by taking from the others. */
function setCloseMix(t, key, value) {
    const v = Math.round(clamp(value));
    const others = ['closeLight', 'closeHeavy', 'closeTech'].filter(k => k !== key);
    const rest = 100 - v;
    const oldSum = t[others[0]] + t[others[1]];
    const first = oldSum > 0 ? Math.round(t[others[0]] * rest / oldSum) : Math.round(rest / 2);
    return { ...t, [key]: v, [others[0]]: first, [others[1]]: rest - first };
}

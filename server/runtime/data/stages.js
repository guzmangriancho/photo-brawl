"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LARGE_ARENAS = exports.STAGE_IDS = exports.STAGE_ART = void 0;
exports.getLargeArena = getLargeArena;
/** Stable identifiers: older rooms and saved selections remain compatible. */
exports.STAGE_ART = {
    SKI_RESORT: { name: 'ESTACIÓN DE ESQUÍ', short: 'NIEVE', image: '/backgrounds/snow.jpg' },
    NIGHT_PLAZA: { name: 'CALLEJÓN NEÓN', short: 'NEÓN', image: '/backgrounds/neon.jpg' },
    SUMMER_SUMMIT: { name: 'PLAYA TROPICAL', short: 'PLAYA', image: '/backgrounds/beach.jpg' },
    TEMPLE_SUNSET: { name: 'TEMPLO DEL ATARDECER', short: 'TEMPLO', image: '/backgrounds/asia.jpg' },
    INDUSTRIAL_ROOFTOP: { name: 'AZOTEA INDUSTRIAL', short: 'AZOTEA', image: '/backgrounds/rooftop.jpg' },
    SUNKEN_ATLANTIS: { name: 'ATLÁNTIDA SUMERGIDA', short: 'ATLÁNTIDA', image: '/backgrounds/atlantis.jpg' },
    SPIRIT_FOREST: { name: 'BOSQUE DE LOS ESPÍRITUS', short: 'BOSQUE', image: '/backgrounds/forest.jpg' },
    CELESTIAL_TEMPLE: { name: 'TEMPLO CELESTIAL', short: 'CELESTIAL', image: '/backgrounds/celestial.jpg' },
    VOLCANIC_FORTRESS: { name: 'FORTALEZA VOLCÁNICA', short: 'VOLCÁN', image: '/backgrounds/volcan.jpg' },
};
exports.STAGE_IDS = Object.keys(exports.STAGE_ART);
/**
 * V31 – hand-aligned collision planes for the four user-supplied panoramas.
 * Reference image: 2048×1143, fitted to the 960×540 canvas.
 * Platforms are pass-through on ascent, solid on descent. The main floor is
 * continuous and solid. Tweak these values using Training > COLISIONES.
 */
exports.LARGE_ARENAS = {
    SUNKEN_ATLANTIS: {
        floorY: 454, fighterScale: 0.64,
        platforms: [
            { id: 'LEFT_LOW', x1: 0, x2: 240, y: 325, type: 'one_way' },
            { id: 'LEFT_HIGH', x1: 189, x2: 385, y: 211, type: 'one_way' },
            { id: 'RIGHT_HIGH', x1: 577, x2: 771, y: 211, type: 'one_way' },
            { id: 'RIGHT_LOW', x1: 722, x2: 960, y: 328, type: 'one_way' },
        ],
    },
    SPIRIT_FOREST: {
        floorY: 453, fighterScale: 0.64,
        platforms: [
            { id: 'LEFT_BRANCH', x1: 0, x2: 352, y: 302, type: 'one_way' },
            { id: 'CENTER_BRANCH', x1: 351, x2: 610, y: 171, type: 'one_way' },
            { id: 'RIGHT_BRANCH', x1: 608, x2: 960, y: 303, type: 'one_way' },
        ],
    },
    CELESTIAL_TEMPLE: {
        floorY: 446, fighterScale: 0.64,
        platforms: [
            { id: 'LEFT_TERRACE', x1: 128, x2: 345, y: 329, type: 'one_way' },
            { id: 'CENTER_TERRACE', x1: 370, x2: 591, y: 202, type: 'one_way' },
            { id: 'RIGHT_TERRACE', x1: 613, x2: 833, y: 329, type: 'one_way' },
        ],
    },
    VOLCANIC_FORTRESS: {
        floorY: 436, fighterScale: 0.64,
        platforms: [
            { id: 'LEFT_BATTLEMENT', x1: 0, x2: 219, y: 214, type: 'one_way' },
            { id: 'CENTER_BRIDGE', x1: 290, x2: 669, y: 316, type: 'one_way' },
            { id: 'RIGHT_BATTLEMENT', x1: 743, x2: 960, y: 214, type: 'one_way' },
        ],
    },
};
function getLargeArena(stage) {
    return exports.LARGE_ARENAS[stage];
}

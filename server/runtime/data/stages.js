"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGE_IDS = exports.STAGE_ART = void 0;
/** Stable identifiers: older rooms and saved selections remain compatible. */
exports.STAGE_ART = {
    SKI_RESORT: { name: 'ESTACIÓN DE ESQUÍ', short: 'NIEVE', image: '/backgrounds/snow.jpg' },
    NIGHT_PLAZA: { name: 'CALLEJÓN NEÓN', short: 'NEÓN', image: '/backgrounds/neon.jpg' },
    SUMMER_SUMMIT: { name: 'PLAYA TROPICAL', short: 'PLAYA', image: '/backgrounds/beach.jpg' },
    TEMPLE_SUNSET: { name: 'TEMPLO DEL ATARDECER', short: 'TEMPLO', image: '/backgrounds/asia.jpg' },
    INDUSTRIAL_ROOFTOP: { name: 'AZOTEA INDUSTRIAL', short: 'AZOTEA', image: '/backgrounds/rooftop.jpg' },
};
exports.STAGE_IDS = Object.keys(exports.STAGE_ART);

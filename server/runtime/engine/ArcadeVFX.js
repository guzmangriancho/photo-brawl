"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawAttackFX = drawAttackFX;
exports.drawNormalAttackFX = drawNormalAttackFX;
exports.drawGuardFX = drawGuardFX;
exports.drawSuperFlashFX = drawSuperFlashFX;
exports.drawShockwaveFX = drawShockwaveFX;
exports.drawCrossSlashFX = drawCrossSlashFX;
exports.drawParticlesFX = drawParticlesFX;
exports.drawMeteorFX = drawMeteorFX;
exports.drawSuperMeteorsFX = drawSuperMeteorsFX;
exports.drawProjectileFX = drawProjectileFX;
exports.drawHitstopSparkFX = drawHitstopSparkFX;
exports.drawParryBurstFX = drawParryBurstFX;
exports.drawGuardMeterFX = drawGuardMeterFX;
const Q = (v) => Math.round(v / 2) * 2;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const flicker = (frame, seed = 0) => Math.sin(frame * 1.37 + seed * 2.69);
function path(ctx, points, color) {
    if (!points.length)
        return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(Q(points[0][0]), Q(points[0][1]));
    for (let i = 1; i < points.length; i++)
        ctx.lineTo(Q(points[i][0]), Q(points[i][1]));
    ctx.closePath();
    ctx.fill();
}
function streak(ctx, x, y, dx, dy, width, color) {
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy * width / d;
    const ny = dx * width / d;
    path(ctx, [[x, y], [x + dx * .30 + nx, y + dy * .30 + ny], [x + dx, y + dy], [x + dx * .30 - nx, y + dy * .30 - ny]], color);
}
function diamond(ctx, x, y, r, color) {
    path(ctx, [[x, y - r], [x + r, y], [x, y + r], [x - r, y]], color);
}
function arcStrokes(ctx, x, y, r, color, frame, count, length = .55, thick = 4) {
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    for (let k = 0; k < count; k++) {
        const start = frame * .055 + (k / count) * TAU;
        ctx.beginPath();
        ctx.arc(Q(x), Q(y), Q(r + Math.sin(frame * .16 + k) * 3), start, start + length);
        ctx.stroke();
    }
}
function shine(ctx, x, y, radius, color) {
    streak(ctx, x - radius, y, radius * 2, 0, 2.5, color);
    streak(ctx, x, y - radius, 0, radius * 2, 2.5, color);
    diamond(ctx, x, y, Math.max(3, radius * .24), '#ffffff');
}
function withFacing(ctx, fighter, action) {
    ctx.save();
    ctx.translate(Q(fighter.x), Q(fighter.y));
    ctx.scale(fighter.facing, 1);
    action();
    ctx.restore();
}
function beamLayer(ctx, len, half, color, frame, seed) {
    const pts = [[0, -half * .6], [14, -half]];
    for (let x = 30; x < len - 40; x += 32) {
        const j = flicker(frame + x, seed) * 5 + (x % 64 === 0 ? 9 : -4);
        pts.push([x, -half + j]);
        if (x % 96 === 30)
            pts.push([x + 15, -half - 16]);
    }
    pts.push([len - 28, -half * .72], [len + 12, 0], [len - 28, half * .72]);
    for (let x = len - 40; x > 20; x -= 32) {
        const j = flicker(frame + x, seed + 4) * 5 + (x % 64 === 0 ? 9 : -4);
        pts.push([x, half - j]);
        if (x % 96 === 24)
            pts.push([x - 15, half + 14]);
    }
    pts.push([14, half], [0, half * .6]);
    path(ctx, pts, color);
}
function drawBeam(ctx, f, frame, color) {
    withFacing(ctx, f, () => {
        ctx.translate(22, -92);
        const pulse = flicker(frame) * 4;
        beamLayer(ctx, 646, 55 + pulse, '#190f35', frame, 1);
        beamLayer(ctx, 635, 43 + pulse, color, frame, 3);
        beamLayer(ctx, 629, 29 + pulse * .7, '#ffd276', frame, 4);
        beamLayer(ctx, 625, 15 + pulse * .35, '#fffef1', frame, 6);
        // High-speed pixel ribbons make the beam a continuous surge, not a box.
        for (let i = 0; i < 14; i++) {
            const x = 25 + (i * 87 + frame * 37) % 580;
            const y = (i % 2 ? 1 : -1) * (39 + (i * 13) % 19);
            streak(ctx, x, y, 55 + (i % 3) * 20, -y * .14, 2 + i % 3, i % 3 === 0 ? '#ffffff' : color);
        }
        arcStrokes(ctx, 0, 0, 55 + flicker(frame) * 5, '#fef3c7', frame, 4, .9, 5);
        shine(ctx, 0, 0, 46, '#ffffff');
    });
}
function drawMeteorAura(ctx, f, frame, color) {
    const x = f.x, y = f.y - 80;
    for (let i = 0; i < 7; i++) {
        const off = i * 31 + frame * 3;
        streak(ctx, x - 160 + off % 310, y - 185 + (i % 3) * 36, 24, 76, 3 + i % 2, i % 2 ? '#ffdb77' : color);
    }
    arcStrokes(ctx, x, y, 75, color, frame, 3, .85, 5);
    shine(ctx, x, y, 35, '#fff3cd');
}
function drawRush(ctx, f, frame, color) {
    withFacing(ctx, f, () => {
        const cx = 68, cy = -85;
        const phase = frame % 6;
        for (let k = 0; k < 6; k++) {
            const y = -145 + k * 23 + ((frame * 9) % 19);
            streak(ctx, -85 - (k % 3) * 28, y, 135 + k * 17, (k % 2 ? 9 : -7), 1.5 + k % 3, k % 2 ? color : '#ffffff');
        }
        const tilt = phase % 2 ? 1 : -1;
        path(ctx, [[cx - 42, cy - 73 * tilt], [cx + 17, cy - 8 * tilt], [cx + 100, cy + 55 * tilt], [cx + 42, cy + 5 * tilt], [cx + 10, cy - 16 * tilt]], color);
        streak(ctx, cx - 26, cy - 62 * tilt, 122, 116 * tilt, 5, '#ffffff');
        diamond(ctx, cx + 56, cy + 26 * tilt, 11, '#fff7cf');
    });
}
function drawSuplex(ctx, f, frame, color) {
    const x = f.x, y = f.y - 86;
    arcStrokes(ctx, x, y, 67 + frame % 7 * 2, color, frame, 3, 1.3, 7);
    arcStrokes(ctx, x, y, 94, '#fff0bf', -frame, 3, .65, 3);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + frame * .08;
        const r = 80 + (i % 2) * 18;
        diamond(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 8 + i % 3 * 4, i % 2 ? '#fff5cf' : color);
    }
}
function drawShotgun(ctx, f, frame, color) {
    withFacing(ctx, f, () => {
        const cy = -92;
        path(ctx, [[30, cy - 16], [105, cy - 42], [158, cy - 20], [180, cy], [158, cy + 21], [105, cy + 42], [30, cy + 17]], color);
        path(ctx, [[35, cy - 9], [120, cy - 23], [162, cy], [120, cy + 23], [35, cy + 9]], '#fef9cf');
        for (let k = 0; k < 9; k++) {
            const a = (k - 4) * .19;
            const x = 120 + k * 11 + (frame % 3) * 6;
            const y = cy + Math.sin(a) * 105;
            streak(ctx, x, y, 22 + k * 3, Math.sin(a) * 22, 2, k % 2 ? '#ffffff' : color);
        }
    });
}
function drawSpin(ctx, f, frame, color) {
    const x = f.x, y = f.y - 83;
    arcStrokes(ctx, x, y, 50, color, frame, 4, 1.25, 7);
    arcStrokes(ctx, x, y, 64, '#e9fff9', -frame, 3, .65, 3);
    for (let i = 0; i < 4; i++) {
        const a = frame * .25 + i * TAU / 4;
        streak(ctx, x + Math.cos(a) * 58, y + Math.sin(a) * 44, Math.cos(a + .6) * 28, Math.sin(a + .6) * 18, 3, color);
    }
}
function drawSlide(ctx, f, frame, color) {
    withFacing(ctx, f, () => {
        path(ctx, [[-22, -16], [40, -34], [114, -24], [142, -11], [116, -5], [30, -5]], color);
        streak(ctx, 20, -23, 115, -5, 4, '#ffffff');
        for (let i = 0; i < 4; i++)
            streak(ctx, -40 - i * 17, -7 - i * 4, 34 + i * 8, 3, 2, '#cbd5e1');
    });
}
function drawShoulder(ctx, f, frame, color) {
    withFacing(ctx, f, () => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(20, -93, 69, -1.7, 1.3);
        ctx.stroke();
        ctx.strokeStyle = '#fffbea';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(20, -93, 55, -1.45, .95);
        ctx.stroke();
        for (let k = 0; k < 5; k++)
            streak(ctx, -95 - k * 19, -132 + k * 24, 90 + (k % 3) * 14, 0, 2, k % 2 ? '#ffffff' : color);
        diamond(ctx, 76, -86, 9, '#fffdef');
    });
}
function drawTornado(ctx, f, frame, color) {
    const x = f.x, y = f.y - 88;
    for (let i = 0; i < 5; i++) {
        const h = 125 - i * 29;
        const r = 50 - i * 6;
        arcStrokes(ctx, x + (i % 2 ? 8 : -8), y - 60 + i * 24, r, color, frame + i * 12, 2, 1.5, 5 - i * .55);
        streak(ctx, x - 20 + i * 4, y - 70 + i * 25, 35, -16, 2, '#fff6f2');
    }
}
function drawUppercut(ctx, f, frame, color) {
    withFacing(ctx, f, () => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.arc(21, -105, 78, 2.2, 5.5);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(21, -105, 70, 2.3, 5.5);
        ctx.stroke();
        for (let i = 0; i < 4; i++)
            streak(ctx, 45 + i * 10, -130 - i * 22, 10, -32, 2 + i % 2, color);
    });
}
function drawDive(ctx, f, color) {
    withFacing(ctx, f, () => {
        path(ctx, [[-65, -115], [-10, -78], [103, -5], [55, -10], [-32, -53]], color);
        streak(ctx, -20, -70, 115, 62, 4, '#ffffff');
    });
}
/**
 * 16-bit presentation pass: all SUPER effects are painted at 320x180 and then
 * nearest-neighbor enlarged. The arena, portraits and character sprites remain
 * at their own resolution; only the super effects get chunky hardware pixels.
 */
const PIXEL_SCALE = 3;
let superFxCanvas = null;
function drawPixelSuper(ctx, draw) {
    if (typeof document === 'undefined') {
        draw(ctx);
        return;
    }
    if (!superFxCanvas) {
        superFxCanvas = document.createElement('canvas');
        superFxCanvas.width = 960 / PIXEL_SCALE;
        superFxCanvas.height = 540 / PIXEL_SCALE;
    }
    const fx = superFxCanvas.getContext('2d');
    if (!fx) {
        draw(ctx);
        return;
    }
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, superFxCanvas.width, superFxCanvas.height);
    fx.setTransform(1 / PIXEL_SCALE, 0, 0, 1 / PIXEL_SCALE, 0, 0);
    draw(fx);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(superFxCanvas, 0, 0, 960, 540);
    ctx.restore();
}
function drawAttackFX(ctx, f, frame) {
    const a = f.currentAttack;
    if (f.state !== 'ATTACK' || !a || f.stateFrame < a.startup || f.stateFrame >= a.startup + a.active)
        return;
    const color = f.profile.moveset.specialNeutral.primaryHex || '#38bdf8';
    ctx.save();
    switch (a.slot) {
        case 'SP_NEUTRAL':
            if (a.mechanic === 'SHORT_SHOTGUN_BLAST')
                drawShotgun(ctx, f, frame, color);
            break;
        case 'SP_FORWARD':
            if (a.mechanic === 'SPINNING_ADVANCE')
                drawSpin(ctx, f, frame, color);
            else if (a.mechanic === 'SLIDE_LOW_KICK')
                drawSlide(ctx, f, frame, color);
            else if (a.mechanic === 'ARMORED_SHOULDER_DASH')
                drawShoulder(ctx, f, frame, color);
            else if (a.mechanic === 'TELEPORT_BEHIND')
                drawRush(ctx, f, frame, color);
            else if (a.mechanic === 'COMMAND_GRAB_SLAM')
                drawSuplex(ctx, f, frame, color);
            break;
        case 'SP_UP':
            if (a.mechanic === 'VERTICAL_TORNADO')
                drawTornado(ctx, f, frame, color);
            else if (a.mechanic === 'DIVE_KICK_FROM_AIR' || a.mechanic === 'HIGH_LEAP_STOMP')
                drawDive(ctx, f, color);
            else
                drawUppercut(ctx, f, frame, color);
            break;
        case 'SUPER':
            drawPixelSuper(ctx, fx => {
                if (a.mechanic === 'GIANT_BEAM_LASER')
                    drawBeam(fx, f, frame, color);
                else if (a.mechanic === 'METEOR_SCREEN_DROP')
                    drawMeteorAura(fx, f, frame, color);
                else if (a.mechanic === 'MULTI_HIT_RUSH_COMBO')
                    drawRush(fx, f, frame, color);
                else if (a.mechanic === 'OMEGA_SUPLEX')
                    drawSuplex(fx, f, frame, color);
            });
            break;
    }
    ctx.restore();
}
/**
 * Fase 1 combate: lectura de golpes normales. Solo dibujo (sin RNG ni cambios
 * de estado): aviso corto durante el arranque de golpes fuertes y estela
 * durante los fotogramas activos. Color por altura: medio rojo, bajo cian,
 * alto naranja. Los jabs (LIGHT) no avisan porque arrancan en 3-5 fotogramas.
 */
function drawNormalAttackFX(ctx, f, frame) {
    const a = f.currentAttack;
    if (f.state !== 'ATTACK' || !a)
        return;
    const normal = a.slot === 'LIGHT' || a.slot === 'HEAVY' || a.slot === 'RUSH' || a.slot === 'LOW';
    const tellable = normal && a.slot !== 'LIGHT' || a.slot === 'SP_NEUTRAL' || a.slot === 'SP_FORWARD' || a.slot === 'SP_UP';
    const color = a.height === 'LOW' ? '#67e8f9' : a.height === 'OVERHEAD' ? '#fb923c' : '#fb7185';
    const heavy = a.slot === 'HEAVY' || a.slot === 'RUSH';
    const y = a.height === 'LOW' ? -26 : a.height === 'OVERHEAD' ? -120 : -78;
    if (f.stateFrame < a.startup) {
        if (!tellable || a.startup < 6)
            return;
        const t = clamp(f.stateFrame / Math.max(1, a.startup), 0, 1);
        ctx.save();
        ctx.translate(Q(f.x), Q(f.y));
        ctx.scale(f.facing, 1);
        ctx.globalAlpha = .55 + .35 * t;
        const r = Q(10 + t * 10);
        diamond(ctx, Q(34), y, r, color);
        diamond(ctx, Q(34), y, Q(r * .45), '#ffffff');
        streak(ctx, Q(52), y - 8, Q(14 + t * 10), 0, 1.5, '#ffffff');
        streak(ctx, Q(52), y + 8, Q(14 + t * 10), 0, 1.5, '#ffffff');
        ctx.restore();
        return;
    }
    if (!normal || f.stateFrame >= a.startup + a.active)
        return;
    const k = clamp((f.stateFrame - a.startup) / Math.max(1, a.active), 0, 1);
    const len = Q((heavy ? 96 : 70) + k * 22);
    const w = heavy ? 7 : 4;
    ctx.save();
    ctx.translate(Q(f.x), Q(f.y));
    ctx.scale(f.facing, 1);
    ctx.globalAlpha = clamp(.95 - k * .55, .3, .95);
    streak(ctx, Q(26), y, len, a.height === 'OVERHEAD' ? Q(24) : a.height === 'LOW' ? -Q(8) : -Q(14), w, color);
    streak(ctx, Q(30), y, Q(len * .8), a.height === 'OVERHEAD' ? Q(20) : a.height === 'LOW' ? -Q(6) : -Q(11), w * .4, '#ffffff');
    ctx.restore();
}
/** Slim angular parry/block shield in front of the actual sprite. */
function drawGuardFX(ctx, f, frame) {
    if (f.state !== 'BLOCK_STAND' && f.state !== 'BLOCK_CROUCH')
        return;
    const low = f.state === 'BLOCK_CROUCH';
    const height = low ? 63 : 112;
    const x = f.x + f.facing * (f.hurtbox.width * .47);
    const y = f.y - (low ? 43 : 87);
    ctx.save();
    ctx.translate(Q(x), Q(y));
    ctx.scale(f.facing, 1);
    const p = (f.blockstunFrames > 0 ? 1 : .55) + .1 * flicker(frame);
    ctx.globalAlpha = clamp(p, .25, .95);
    ctx.strokeStyle = low ? '#67e8f9' : '#93c5fd';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-4, -height * .52);
    ctx.quadraticCurveTo(35, -height * .43, 35, 0);
    ctx.quadraticCurveTo(35, height * .42, -4, height * .51);
    ctx.stroke();
    ctx.strokeStyle = '#e0faff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1, -height * .43);
    ctx.quadraticCurveTo(26, -height * .33, 26, 0);
    ctx.quadraticCurveTo(26, height * .32, 1, height * .44);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
        const yy = (i - 1) * height * .26;
        streak(ctx, 25, yy, 15 + (i % 2) * 9, (i - 1) * 7, 2, '#d1faff');
    }
    ctx.restore();
}
function drawSuperFlashRaw(ctx, f, remaining, frame) {
    // 26 frame activation: stylized vignette and radial rays, no giant solid disc.
    const progress = clamp((26 - remaining) / 26, 0, 1);
    const x = f.x, y = f.y - 92;
    ctx.save();
    ctx.fillStyle = 'rgba(7,8,30,.72)';
    ctx.fillRect(0, 0, 960, 540);
    const color = f.profile.moveset.specialNeutral.primaryHex || '#e879f9';
    for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU + frame * .015;
        const ri = 54 + progress * 75;
        const ro = 215 + progress * 120 + (i % 3) * 18;
        const x1 = x + Math.cos(a) * ri, y1 = y + Math.sin(a) * ri;
        streak(ctx, x1, y1, Math.cos(a) * (ro - ri), Math.sin(a) * (ro - ri), i % 3 === 0 ? 5 : 2, i % 4 === 0 ? '#fdf4d0' : color);
    }
    arcStrokes(ctx, x, y, 36 + progress * 130, '#fff3c4', frame, 4, 1.2, 6);
    arcStrokes(ctx, x, y, 24 + progress * 100, color, -frame, 5, .7, 4);
    diamond(ctx, x, y, 17 + flicker(frame) * 4, '#fffdf2');
    ctx.restore();
}
function drawSuperFlashFX(ctx, f, remaining, frame) {
    drawPixelSuper(ctx, fx => drawSuperFlashRaw(fx, f, remaining, frame));
}
function drawShockwaveFX(ctx, sw, frame) {
    const alpha = clamp(sw.alpha, 0, 1);
    if (alpha === 0)
        return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 4 + alpha * 2;
    const r = Math.max(2, sw.radius);
    for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + frame * .024;
        ctx.beginPath();
        ctx.arc(Q(sw.x), Q(sw.y), Q(r), a, a + .49);
        ctx.stroke();
        if (k % 2 === 0)
            streak(ctx, sw.x + Math.cos(a) * r, sw.y + Math.sin(a) * r, Math.cos(a) * 20, Math.sin(a) * 20, 3, '#fffbea');
    }
    ctx.restore();
}
function drawCrossSlashRaw(ctx, x, y, color, life) {
    const t = clamp(life / 16, 0, 1);
    ctx.save();
    ctx.globalAlpha = t;
    streak(ctx, x - 40, y - 43, 88, 90, 7, color);
    streak(ctx, x + 41, y - 44, -87, 93, 7, color);
    streak(ctx, x - 35, y - 38, 77, 78, 2, '#ffffff');
    streak(ctx, x + 36, y - 39, -77, 80, 2, '#ffffff');
    for (let i = 0; i < 4; i++)
        diamond(ctx, x + (i % 2 ? 1 : -1) * (20 + i * 8), y + (i - 2) * 23, 4 + i % 2 * 3, '#fff0bf');
    ctx.restore();
}
function drawCrossSlashFX(ctx, x, y, color, life) {
    drawPixelSuper(ctx, fx => drawCrossSlashRaw(fx, x, y, color, life));
}
function drawParticlesFX(ctx, particles) {
    ctx.save();
    for (const pt of particles) {
        if (pt.life <= 0)
            continue;
        const t = clamp(pt.life / (pt.maxLife || 20), 0, 1);
        const x = Q(pt.x), y = Q(pt.y), sz = clamp(pt.size, 2, 14);
        ctx.globalAlpha = clamp(t * .95, 0, 1);
        if (pt.kind === 'spark') {
            streak(ctx, x, y, -pt.vx * 2.7 * t, -pt.vy * 2.7 * t, sz * .44, pt.color);
            diamond(ctx, x, y, sz * .55, pt.life > pt.maxLife * .65 ? '#ffffff' : pt.color);
        }
        else if (pt.kind === 'energy') {
            diamond(ctx, x, y, sz * .72, pt.color);
            if (t > .7)
                diamond(ctx, x, y, sz * .23, '#fffdf4');
        }
        else if (pt.kind === 'dust') {
            path(ctx, [[x - sz, y], [x - sz * .3, y - sz * .55], [x + sz * .6, y - sz * .55], [x + sz, y], [x + sz * .4, y + sz * .3]], pt.color);
        }
        else {
            ctx.fillStyle = pt.color;
            ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
    }
    ctx.restore();
}
function drawMeteorRaw(ctx, m, frame) {
    const x = m.x, y = m.y, r = m.size * .55;
    ctx.save();
    streak(ctx, x - m.vx * 5, y - m.vy * 6, m.vx * 5, m.vy * 6, r * .58, m.color);
    streak(ctx, x - m.vx * 3.5, y - m.vy * 4, m.vx * 3.5, m.vy * 4, r * .3, '#ffe3a6');
    diamond(ctx, x, y, r, m.color);
    diamond(ctx, x, y, r * .59, '#fff3c7');
    for (let i = 0; i < 3; i++) {
        const tx = x - m.vx * (i * 2 + 3) + (i - 1) * 13;
        const ty = y - m.vy * (i * 3 + 4) + flicker(frame, i) * 7;
        diamond(ctx, tx, ty, 3 + i, '#fef9ef');
    }
    ctx.restore();
}
function drawMeteorFX(ctx, m, frame) {
    drawPixelSuper(ctx, fx => drawMeteorRaw(fx, m, frame));
}
/** All falling super meteors share one pixelated pass (cheaper on mobile). */
function drawSuperMeteorsFX(ctx, meteors, frame) {
    if (!meteors.length)
        return;
    drawPixelSuper(ctx, fx => { for (const meteor of meteors)
        drawMeteorRaw(fx, meteor, frame); });
}
function drawProjectileFX(ctx, p, frame) {
    ctx.save();
    if (p.mechanic === 'GROUND_SHOCKWAVE') {
        const x = p.x, y = 472;
        path(ctx, [[x - 37, y], [x - 26, y - 24], [x - 13, y - 15], [x, y - 52], [x + 14, y - 22], [x + 27, y - 29], [x + 40, y]], p.color);
        path(ctx, [[x - 17, y], [x - 8, y - 22], [x, y - 35], [x + 10, y - 21], [x + 19, y]], '#fdfde9');
        for (let i = 0; i < 4; i++)
            streak(ctx, x - 45 + i * 26, y - 4, 9, -7 - i % 2 * 4, 2, '#ffffff');
        ctx.restore();
        return;
    }
    if (p.mechanic === 'TRAP_MINE_DROP') {
        const pulse = flicker(frame) * 3;
        const r = 17 + pulse;
        diamond(ctx, p.x, p.y, r, p.armed ? p.color : '#64748b');
        diamond(ctx, p.x, p.y, r * .42, p.armed ? '#fff9e2' : '#d1d5db');
        arcStrokes(ctx, p.x, p.y, r + 10, p.armed ? p.color : '#94a3b8', frame, 3, .48, 3);
        ctx.restore();
        return;
    }
    const x = p.x, y = p.y;
    // The generated projectile image remains the centerpiece. These secondary
    // streaks reinforce motion but never replace custom art.
    const dir = p.vx >= 0 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
        const yy = y + (i - 1.5) * 13;
        streak(ctx, x - dir * (35 + i * 13), yy, dir * (23 + i * 6), i % 2 ? 4 : -3, 2 + i % 2, i % 2 ? p.color : '#fffbea');
    }
    arcStrokes(ctx, x, y, Math.max(12, p.radius * .9), p.color, frame, 2, .7, 2.5);
    ctx.restore();
}
function drawHitstopSparkFX(ctx, particles, hitstopFrames) {
    if (hitstopFrames <= 0)
        return;
    // Find a *recent* contact burst; older projectile trails are not impacts.
    let s;
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.kind === 'spark' && p.life >= p.maxLife - 9) {
            s = p;
            break;
        }
    }
    if (!s)
        return;
    const r = clamp(9 + hitstopFrames * 1.8, 12, 36);
    ctx.save();
    ctx.globalAlpha = clamp(hitstopFrames / 10, .25, .85);
    for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
        streak(ctx, x, y, Math.cos(a) * (r * .85), Math.sin(a) * (r * .85), i % 2 ? 2.5 : 4, i % 2 ? '#fffdf3' : s.color);
    }
    diamond(ctx, s.x, s.y, Math.min(15, r * .55), '#fffefa');
    ctx.restore();
}
/** 11-frame parry spark: tiny 16-bit light explosion with sharp 4px pixels. */
function drawParryBurstFX(ctx, burst) {
    const total = 16;
    const age = Math.max(0, total - burst.life);
    const radius = 10 + age * 4;
    const x = Math.round(burst.x / 4) * 4;
    const y = Math.round(burst.y / 4) * 4;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, burst.life / 11));
    // Fase 2: aro doble que se expande + destello al inicio, ademas de la cruz.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, Math.round(radius * 1.5), 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#7de6ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, Math.round(radius * 0.9), 0, TAU);
    ctx.stroke();
    // A small bright center + rectangular cross and four diagonal sparks.
    ctx.fillStyle = age < 5 ? '#ffffff' : '#d5ffff';
    const core = Math.max(4, 20 - age);
    ctx.fillRect(x - core / 2, y - core / 2, core, core);
    ctx.fillStyle = '#7de6ff';
    ctx.fillRect(x - radius, y - 4, radius * 2, 8);
    ctx.fillRect(x - 4, y - radius, 8, radius * 2);
    ctx.fillStyle = '#fff6ae';
    for (const direction of [-1, 1]) {
        ctx.fillRect(x + direction * (radius + 5), y - 2, 8, 4);
        ctx.fillRect(x - 2, y + direction * (radius + 5), 4, 8);
        ctx.fillRect(x + direction * Math.round(radius * .65), y - Math.round(radius * .65), 8, 8);
        ctx.fillRect(x + direction * Math.round(radius * .65), y + Math.round(radius * .65), 8, 8);
    }
    ctx.restore();
}
/**
 * Fase 2: barra de guardia pixelada sobre el luchador. Solo aparece cuando la
 * reserva no esta llena (o mientras se cubre), para no ensuciar la pantalla.
 * Si el servidor no envia guardMeter, no se dibuja nada.
 */
function drawGuardMeterFX(ctx, f, frame) {
    const g = f.guardMeter;
    if (typeof g !== 'number' || !Number.isFinite(g))
        return;
    const blocking = f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH';
    if ((g >= 99.5 && !blocking) || f.state === 'KO')
        return;
    const w = 56, h = 8;
    const x = Q(f.x - w / 2);
    // Altura del arte (medida ~194 px a escala 1, hurtbox 154): ancla sobre la cabeza dibujada, no sobre la hurtbox.
    const head = Math.round(196 * f.scale * (f.state === 'BLOCK_CROUCH' ? 0.82 : 1));
    const y = Q(f.y - head - 16);
    const k = Math.max(0, Math.min(1, g / 100));
    const low = k < 0.25;
    ctx.save();
    ctx.globalAlpha = low && frame % 8 < 4 ? 0.55 : 0.95;
    ctx.fillStyle = '#0a1426';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#26354f';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = k > 0.5 ? '#60a5fa' : k > 0.25 ? '#fbbf24' : '#f87171';
    ctx.fillRect(x, y, Math.round(w * k), h);
    ctx.fillStyle = '#ffffff66';
    ctx.fillRect(x, y, Math.round(w * k), 2);
    ctx.restore();
}

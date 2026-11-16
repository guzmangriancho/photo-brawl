import { FighterProfile } from '../types/fighter';

function px(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  scale = 4
) {
  ctx.fillStyle = color;
  ctx.fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale);
}

function drawOutlinedRect(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  outline = '#111118',
  scale = 4
) {
  px(ctx, ox, oy, x - 1, y, w + 2, h, outline, scale);
  px(ctx, ox, oy, x, y - 1, w, h + 2, outline, scale);
  px(ctx, ox, oy, x, y, w, h, fill, scale);
}

/**
 * 1. EL MOZO (Acrobatic Rushdown - Red scarf, white shirt, red sash, white pants)
 */
function drawElMozoCell(ctx: CanvasRenderingContext2D, cellIndex: number) {
  const col = cellIndex % 4;
  const row = Math.floor(cellIndex / 4);
  const ox = col * 256;
  const oy = row * 256;
  const S = 4;

  if (cellIndex === 15) {
    drawOutlinedRect(ctx, ox, oy, 24, 20, 14, 24, '#ef4444', '#7f1d1d', S);
    px(ctx, ox, oy, 28, 22, 10, 20, '#fca5a5', S);
    px(ctx, ox, oy, 32, 25, 6, 14, '#ffffff', S);
    px(ctx, ox, oy, 14, 24, 10, 3, '#dc2626', S);
    px(ctx, ox, oy, 12, 36, 12, 3, '#dc2626', S);
    return;
  }

  if (cellIndex === 13) {
    drawOutlinedRect(ctx, ox, oy, 10, 54, 22, 6, '#f8fafc', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, 32, 53, 16, 7, '#ffffff', '#18181b', S);
    px(ctx, ox, oy, 30, 53, 3, 7, '#dc2626', S);
    drawOutlinedRect(ctx, ox, oy, 48, 51, 9, 8, '#f5c29b', '#18181b', S);
    px(ctx, ox, oy, 50, 50, 8, 3, '#1e1b18', S);
    px(ctx, ox, oy, 46, 52, 4, 6, '#ef4444', S);
    px(ctx, ox, oy, 7, 54, 3, 6, '#dc2626', S);
    return;
  }

  let bounceY = 0;
  let leanX = 0;
  let legSpread = 0;
  let punchExtend = 0;
  let kickExtend = 0;
  let uppercutY = 0;
  let scarfWave = 0;
  let auraColor: string | null = null;

  switch (cellIndex) {
    case 1: bounceY = 1; scarfWave = 2; break;
    case 2: legSpread = 3; scarfWave = 1; break;
    case 3: legSpread = -3; bounceY = -1; scarfWave = 3; break;
    case 4: bounceY = -5; legSpread = 2; scarfWave = 4; break;
    case 5: leanX = -2; bounceY = 1; break;
    case 6: leanX = 3; punchExtend = 12; scarfWave = 3; break;
    case 7: leanX = 4; kickExtend = 15; scarfWave = 4; break;
    case 8: leanX = 3; punchExtend = 10; auraColor = '#ef4444'; scarfWave = 5; break;
    case 9: bounceY = 6; leanX = 5; kickExtend = 16; auraColor = '#f97316'; break;
    case 10: uppercutY = -6; leanX = 2; auraColor = '#facc15'; scarfWave = 5; break;
    case 11: bounceY = -2; auraColor = '#ef4444'; scarfWave = 6; break;
    case 12: leanX = -4; bounceY = 1; break;
    case 14: bounceY = -1; scarfWave = 4; break;
  }

  const baseX = 24 + leanX;
  const baseY = 16 + bounceY + uppercutY;

  if (auraColor) {
    ctx.fillStyle = auraColor + '55';
    ctx.fillRect((baseX - 5) * S + ox, (baseY - 4) * S + oy, 26 * S, 48 * S);
  }

  drawOutlinedRect(ctx, ox, oy, baseX - 9 - (scarfWave % 3), baseY + 11, 10, 4, '#dc2626', '#450a0a', S);
  drawOutlinedRect(ctx, ox, oy, baseX - 12, baseY + 14 + (scarfWave % 2), 9, 3, '#ef4444', '#450a0a', S);

  const footY = cellIndex === 4 || cellIndex === 10 ? 52 : 58;
  const hipY = baseY + 25;
  const legH = Math.max(8, footY - hipY);

  if (kickExtend > 0) {
    drawOutlinedRect(ctx, ox, oy, baseX + 1, hipY, 6, legH, '#e2e8f0', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX, footY, 8, 2, '#dc2626', '#18181b', S);
    const kickY = cellIndex === 9 ? footY - 4 : hipY + 2;
    drawOutlinedRect(ctx, ox, oy, baseX + 8, kickY, 10 + kickExtend, 5, '#ffffff', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 18 + kickExtend, kickY, 4, 5, '#dc2626', '#18181b', S);
  } else {
    drawOutlinedRect(ctx, ox, oy, baseX + 1 - legSpread, hipY, 6, legH, '#cbd5e1', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX - legSpread, footY, 8, 2, '#dc2626', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 8 + legSpread, hipY, 6, legH, '#ffffff', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 8 + legSpread, footY, 8, 2, '#dc2626', '#18181b', S);
  }

  drawOutlinedRect(ctx, ox, oy, baseX + 1, baseY + 11, 14, 14, '#ffffff', '#18181b', S);
  px(ctx, ox, oy, baseX + 1, baseY + 11, 4, 14, '#e2e8f0', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 1, baseY + 22, 14, 4, '#dc2626', '#450a0a', S);
  px(ctx, ox, oy, baseX + 12, baseY + 25, 3, 7, '#ef4444', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 2, baseY + 10, 12, 4, '#ef4444', '#450a0a', S);
  px(ctx, ox, oy, baseX + 9, baseY + 13, 4, 4, '#dc2626', S);

  drawOutlinedRect(ctx, ox, oy, baseX + 3, baseY + 1, 10, 9, '#f5c29b', '#18181b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 2, baseY - 2, 12, 4, '#1c1917', '#09090b', S);
  px(ctx, ox, oy, baseX + 4, baseY - 4, 3, 2, '#1c1917', S);
  px(ctx, ox, oy, baseX + 9, baseY - 4, 3, 2, '#1c1917', S);
  px(ctx, ox, oy, baseX + 9, baseY + 4, 2, 2, '#111118', S);
  px(ctx, ox, oy, baseX + 12, baseY + 4, 1, 2, '#111118', S);
  px(ctx, ox, oy, baseX + 9, baseY + 7, 3, 1, '#9a3412', S);

  if (cellIndex === 5) {
    drawOutlinedRect(ctx, ox, oy, baseX + 11, baseY + 3, 5, 14, '#f5c29b', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 11, baseY + 2, 5, 5, '#ef4444', '#18181b', S);
  } else if (cellIndex === 10 || cellIndex === 14 || cellIndex === 11) {
    drawOutlinedRect(ctx, ox, oy, baseX + 11, baseY - 8, 5, 16, '#f5c29b', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 10, baseY - 11, 6, 5, '#ef4444', '#18181b', S);
  } else {
    drawOutlinedRect(ctx, ox, oy, baseX - 2, baseY + 12, 4, 9, '#e0a980', '#18181b', S);
    const armW = 8 + punchExtend;
    drawOutlinedRect(ctx, ox, oy, baseX + 10, baseY + 12, armW, 5, '#f5c29b', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 10 + armW - 4, baseY + 11, 5, 6, '#ef4444', '#18181b', S);
  }
}

/**
 * 2. OSO MOSTAZA (Bulky Heavy Grappler in Mustard Puffer Jacket & Beard)
 */
function drawOsoMostazaCell(ctx: CanvasRenderingContext2D, cellIndex: number) {
  const col = cellIndex % 4;
  const row = Math.floor(cellIndex / 4);
  const ox = col * 256;
  const oy = row * 256;
  const S = 4;

  if (cellIndex === 15) {
    drawOutlinedRect(ctx, ox, oy, 18, 22, 28, 20, '#d97706', '#451a03', S);
    px(ctx, ox, oy, 22, 24, 20, 14, '#facc15', S);
    px(ctx, ox, oy, 26, 27, 12, 8, '#fef08a', S);
    return;
  }

  if (cellIndex === 13) {
    drawOutlinedRect(ctx, ox, oy, 6, 52, 22, 8, '#1e293b', '#09090b', S);
    drawOutlinedRect(ctx, ox, oy, 26, 49, 24, 11, '#eab308', '#422006', S);
    drawOutlinedRect(ctx, ox, oy, 50, 50, 10, 9, '#f1c29b', '#18181b', S);
    drawOutlinedRect(ctx, ox, oy, 50, 54, 10, 6, '#3f2312', '#18181b', S);
    return;
  }

  let bounceY = 0;
  let leanX = 0;
  let legSpread = 0;
  let punchExtend = 0;
  let slamPose = false;
  let uppercutY = 0;
  let armorGlow = false;

  switch (cellIndex) {
    case 1: bounceY = 1; break;
    case 2: legSpread = 2; break;
    case 3: legSpread = -2; bounceY = -1; break;
    case 4: bounceY = -4; break;
    case 5: leanX = -2; armorGlow = true; break;
    case 6: leanX = 3; punchExtend = 10; break;
    case 7: leanX = 4; punchExtend = 14; slamPose = true; break;
    case 8: bounceY = 3; slamPose = true; armorGlow = true; break;
    case 9: leanX = 6; punchExtend = 13; armorGlow = true; break;
    case 10: uppercutY = -5; armorGlow = true; break;
    case 11: bounceY = -2; armorGlow = true; break;
    case 12: leanX = -3; bounceY = 1; break;
    case 14: bounceY = -1; break;
  }

  const baseX = 18 + leanX;
  const baseY = 11 + bounceY + uppercutY;

  if (armorGlow) {
    ctx.fillStyle = '#facc1555';
    ctx.fillRect((baseX - 4) * S + ox, (baseY - 3) * S + oy, 34 * S, 52 * S);
  }

  const footY = cellIndex === 4 || cellIndex === 10 ? 52 : 58;
  const hipY = baseY + 31;
  const legH = Math.max(8, footY - hipY);

  drawOutlinedRect(ctx, ox, oy, baseX + 2 - legSpread, hipY, 9, legH, '#1e293b', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 1 - legSpread, footY, 11, 2, '#78350f', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 14 + legSpread, hipY, 9, legH, '#334155', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 14 + legSpread, footY, 11, 2, '#78350f', '#09090b', S);

  drawOutlinedRect(ctx, ox, oy, baseX, baseY + 11, 25, 21, '#eab308', '#422006', S);
  px(ctx, ox, oy, baseX, baseY + 11, 6, 21, '#ca8a04', S);
  px(ctx, ox, oy, baseX + 1, baseY + 16, 23, 1, '#854d0e', S);
  px(ctx, ox, oy, baseX + 1, baseY + 21, 23, 1, '#854d0e', S);
  px(ctx, ox, oy, baseX + 1, baseY + 26, 23, 1, '#854d0e', S);
  px(ctx, ox, oy, baseX + 16, baseY + 11, 2, 21, '#18181b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 4, baseY + 9, 17, 4, '#facc15', '#422006', S);

  drawOutlinedRect(ctx, ox, oy, baseX + 7, baseY + 1, 12, 10, '#f1c29b', '#18181b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 6, baseY - 3, 14, 5, '#1c1917', '#09090b', S);
  px(ctx, ox, oy, baseX + 7, baseY - 1, 12, 1, '#eab308', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 7, baseY + 6, 13, 6, '#3f2312', '#18181b', S);
  px(ctx, ox, oy, baseX + 13, baseY + 7, 4, 1, '#f1c29b', S);
  px(ctx, ox, oy, baseX + 14, baseY + 3, 2, 2, '#09090b', S);
  px(ctx, ox, oy, baseX + 17, baseY + 3, 2, 2, '#09090b', S);

  if (cellIndex === 5) {
    drawOutlinedRect(ctx, ox, oy, baseX + 18, baseY + 4, 8, 18, '#eab308', '#422006', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 19, baseY + 2, 7, 6, '#f1c29b', '#18181b', S);
  } else if (cellIndex === 10 || cellIndex === 11 || cellIndex === 14) {
    drawOutlinedRect(ctx, ox, oy, baseX + 19, baseY - 7, 7, 19, '#eab308', '#422006', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 19, baseY - 11, 7, 5, '#f1c29b', '#18181b', S);
  } else if (slamPose) {
    drawOutlinedRect(ctx, ox, oy, baseX + 16, baseY + 14, 12 + punchExtend, 8, '#eab308', '#422006', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 24 + punchExtend, baseY + 18, 8, 9, '#f1c29b', '#18181b', S);
  } else {
    drawOutlinedRect(ctx, ox, oy, baseX - 3, baseY + 13, 6, 12, '#ca8a04', '#422006', S);
    const armW = 11 + punchExtend;
    drawOutlinedRect(ctx, ox, oy, baseX + 15, baseY + 13, armW, 8, '#eab308', '#422006', S);
    drawOutlinedRect(ctx, ox, oy, baseX + 15 + armW - 4, baseY + 12, 7, 9, '#f1c29b', '#18181b', S);
  }
}

/**
 * 3. MAGA NEÓN (Cyberpunk Zoner Mage - Neon Cyan Visor, Dark Trench Coat, Floating Plasma Orbs)
 */
function drawMagaNeonCell(ctx: CanvasRenderingContext2D, cellIndex: number) {
  const col = cellIndex % 4;
  const row = Math.floor(cellIndex / 4);
  const ox = col * 256;
  const oy = row * 256;
  const S = 4;

  // Cell 15: Custom Projectile (Cyan Plasma Star Orb)
  if (cellIndex === 15) {
    drawOutlinedRect(ctx, ox, oy, 20, 20, 24, 24, '#0891b2', '#164e63', S);
    px(ctx, ox, oy, 24, 24, 16, 16, '#22d3ee', S);
    px(ctx, ox, oy, 28, 28, 8, 8, '#ffffff', S);
    return;
  }

  if (cellIndex === 13) {
    drawOutlinedRect(ctx, ox, oy, 10, 53, 38, 7, '#0f172a', '#020617', S);
    drawOutlinedRect(ctx, ox, oy, 48, 51, 9, 8, '#f5c29b', '#020617', S);
    px(ctx, ox, oy, 51, 53, 5, 2, '#22d3ee', S);
    return;
  }

  let bounceY = 0;
  let leanX = 0;
  let armExtend = 0;
  let orbRaise = 0;
  if (cellIndex === 1 || cellIndex === 3) bounceY = -1;
  if (cellIndex === 4) bounceY = -5;
  if (cellIndex === 6) { leanX = 3; armExtend = 12; }
  if (cellIndex === 7) { leanX = 4; armExtend = 16; }
  if (cellIndex === 8 || cellIndex === 9) { leanX = 3; armExtend = 14; orbRaise = -4; }
  if (cellIndex === 10 || cellIndex === 11 || cellIndex === 14) { orbRaise = -12; }
  if (cellIndex === 12) leanX = -4;

  const baseX = 24 + leanX;
  const baseY = 15 + bounceY;

  // Cyan Plasma Aura
  if (cellIndex >= 7 && cellIndex <= 11) {
    ctx.fillStyle = '#06b6d444';
    ctx.fillRect((baseX - 6) * S + ox, (baseY - 6) * S + oy, 28 * S, 50 * S);
  }

  // Cyber Boots & Leggings
  const footY = cellIndex === 4 ? 52 : 58;
  drawOutlinedRect(ctx, ox, oy, baseX + 2, baseY + 26, 5, footY - (baseY + 26), '#1e293b', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 9, baseY + 26, 5, footY - (baseY + 26), '#0f172a', '#09090b', S);
  px(ctx, ox, oy, baseX + 2, footY - 2, 6, 4, '#06b6d4', S);
  px(ctx, ox, oy, baseX + 9, footY - 2, 6, 4, '#06b6d4', S);

  // Flowing Dark Cyber Coat with Neon Cyan Trim
  drawOutlinedRect(ctx, ox, oy, baseX, baseY + 11, 16, 19, '#0f172a', '#020617', S);
  px(ctx, ox, oy, baseX, baseY + 11, 2, 19, '#22d3ee', S);
  px(ctx, ox, oy, baseX + 14, baseY + 11, 2, 19, '#22d3ee', S);
  px(ctx, ox, oy, baseX + 4, baseY + 14, 8, 2, '#38bdf8', S);

  // Head + Silver/Blue Hair + Glowing Cyber Visor
  drawOutlinedRect(ctx, ox, oy, baseX + 3, baseY + 1, 10, 9, '#f5c29b', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 1, baseY - 2, 13, 5, '#e0f2fe', '#09090b', S);
  px(ctx, ox, oy, baseX + 1, baseY + 2, 3, 9, '#bae6fd', S);
  // Glowing Cyan Visor
  drawOutlinedRect(ctx, ox, oy, baseX + 7, baseY + 3, 7, 3, '#22d3ee', '#083344', S);

  // Arms + Floating Plasma Orb
  const handX = baseX + 12 + armExtend;
  const handY = baseY + 12 + orbRaise;
  drawOutlinedRect(ctx, ox, oy, baseX + 9, baseY + 12, 6 + armExtend, 4, '#1e293b', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, handX + 2, handY - 3, 7, 7, '#22d3ee', '#083344', S);
  px(ctx, ox, oy, handX + 4, handY - 1, 3, 3, '#ffffff', S);
}

/**
 * 4. SOMBRA NINJA (Agile Trickster Shinobi - Purple Hood/Scarf, Dark Armor, Glowing Katana)
 */
function drawSombraNinjaCell(ctx: CanvasRenderingContext2D, cellIndex: number) {
  const col = cellIndex % 4;
  const row = Math.floor(cellIndex / 4);
  const ox = col * 256;
  const oy = row * 256;
  const S = 4;

  // Cell 15: Custom Projectile (4-Point Purple Shuriken)
  if (cellIndex === 15) {
    drawOutlinedRect(ctx, ox, oy, 22, 26, 20, 12, '#a855f7', '#3b0764', S);
    drawOutlinedRect(ctx, ox, oy, 26, 22, 12, 20, '#c084fc', '#3b0764', S);
    px(ctx, ox, oy, 30, 30, 4, 4, '#ffffff', S);
    return;
  }

  if (cellIndex === 13) {
    drawOutlinedRect(ctx, ox, oy, 10, 54, 38, 6, '#1e1b4b', '#09090b', S);
    drawOutlinedRect(ctx, ox, oy, 48, 51, 9, 8, '#581c87', '#09090b', S);
    return;
  }

  let bounceY = 2; // Low ninja crouch stance
  let leanX = 0;
  let slashExtend = 0;
  let legSpread = 2;
  if (cellIndex === 1) bounceY = 3;
  if (cellIndex === 2) { legSpread = 4; bounceY = 1; }
  if (cellIndex === 3) { legSpread = -3; bounceY = 2; }
  if (cellIndex === 4 || cellIndex === 10) bounceY = -6;
  if (cellIndex === 6) { leanX = 4; slashExtend = 14; }
  if (cellIndex === 7 || cellIndex === 9) { leanX = 6; slashExtend = 20; }
  if (cellIndex === 8) { leanX = 3; slashExtend = 10; }
  if (cellIndex === 12) leanX = -4;

  const baseX = 22 + leanX;
  const baseY = 16 + bounceY;

  if (cellIndex >= 8 && cellIndex <= 11) {
    ctx.fillStyle = '#a855f755';
    ctx.fillRect((baseX - 6) * S + ox, (baseY - 4) * S + oy, 30 * S, 48 * S);
  }

  // Flowing Purple Ninja Scarf
  drawOutlinedRect(ctx, ox, oy, baseX - 11, baseY + 10, 12, 4, '#7e22ce', '#2e1065', S);
  drawOutlinedRect(ctx, ox, oy, baseX - 14, baseY + 13, 10, 3, '#a855f7', '#2e1065', S);

  // Shinobi Legs
  const footY = cellIndex === 4 || cellIndex === 10 ? 51 : 58;
  drawOutlinedRect(ctx, ox, oy, baseX + 1 - legSpread, baseY + 25, 6, footY - (baseY + 25), '#1e1b4b', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 9 + legSpread, baseY + 25, 6, footY - (baseY + 25), '#312e81', '#09090b', S);

  // Dark Shinobi Torso + Purple Chest Wrap
  drawOutlinedRect(ctx, ox, oy, baseX + 1, baseY + 11, 14, 14, '#18181b', '#09090b', S);
  px(ctx, ox, oy, baseX + 2, baseY + 13, 12, 3, '#9333ea', S);
  px(ctx, ox, oy, baseX + 2, baseY + 19, 12, 3, '#7e22ce', S);

  // Hooded Ninja Head + Glowing Slit Eyes
  drawOutlinedRect(ctx, ox, oy, baseX + 2, baseY, 12, 10, '#581c87', '#09090b', S);
  drawOutlinedRect(ctx, ox, oy, baseX + 5, baseY + 4, 8, 3, '#f5c29b', '#09090b', S);
  px(ctx, ox, oy, baseX + 9, baseY + 5, 3, 2, '#e879f9', S);

  // Katana / Kunai Slash Blade
  drawOutlinedRect(ctx, ox, oy, baseX + 10, baseY + 13, 8, 4, '#581c87', '#09090b', S);
  const bladeLen = 10 + slashExtend;
  drawOutlinedRect(ctx, ox, oy, baseX + 16, baseY + 12, bladeLen, 3, '#e9d5ff', '#581c87', S);
  if (slashExtend > 0) {
    ctx.fillStyle = '#c084fc88';
    ctx.fillRect((baseX + 14) * S + ox, (baseY + 6) * S + oy, (bladeLen + 4) * S, 12 * S);
  }
}

function generateSheetDataUrl(drawCellFn: (ctx: CanvasRenderingContext2D, idx: number) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 1024, 1024);

  for (let i = 0; i < 16; i++) {
    drawCellFn(ctx, i);
  }
  return canvas.toDataURL('image/png');
}

function generatePortraitDataUrl(type: 'MOZO' | 'OSO' | 'MAGA' | 'NINJA'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#06152d';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 4;
  for (let x = 0; x <= 512; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y <= 512; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }

  const S = 8;
  if (type === 'MOZO') {
    drawOutlinedRect(ctx, 0, 0, 12, 42, 40, 22, '#ffffff', '#09090b', S);
    px(ctx, 0, 0, 12, 42, 10, 22, '#e2e8f0', S);
    drawOutlinedRect(ctx, 0, 0, 18, 36, 28, 9, '#ef4444', '#450a0a', S);
    drawOutlinedRect(ctx, 0, 0, 27, 43, 10, 14, '#dc2626', '#450a0a', S);
    drawOutlinedRect(ctx, 0, 0, 20, 14, 24, 23, '#f5c29b', '#09090b', S);
    drawOutlinedRect(ctx, 0, 0, 18, 7, 28, 9, '#1c1917', '#09090b', S);
    px(ctx, 0, 0, 22, 4, 6, 4, '#1c1917', S);
    px(ctx, 0, 0, 34, 4, 6, 4, '#1c1917', S);
    px(ctx, 0, 0, 24, 22, 4, 3, '#09090b', S);
    px(ctx, 0, 0, 35, 22, 4, 3, '#09090b', S);
    px(ctx, 0, 0, 26, 30, 11, 2, '#9a3412', S);
  } else if (type === 'OSO') {
    drawOutlinedRect(ctx, 0, 0, 6, 38, 52, 26, '#eab308', '#422006', S);
    px(ctx, 0, 0, 6, 46, 52, 2, '#854d0e', S);
    px(ctx, 0, 0, 6, 54, 52, 2, '#854d0e', S);
    px(ctx, 0, 0, 31, 38, 3, 26, '#18181b', S);
    drawOutlinedRect(ctx, 0, 0, 14, 33, 36, 8, '#facc15', '#422006', S);
    drawOutlinedRect(ctx, 0, 0, 19, 13, 26, 22, '#f1c29b', '#09090b', S);
    drawOutlinedRect(ctx, 0, 0, 17, 5, 30, 10, '#1c1917', '#09090b', S);
    px(ctx, 0, 0, 18, 11, 28, 2, '#eab308', S);
    drawOutlinedRect(ctx, 0, 0, 18, 23, 28, 14, '#3f2312', '#09090b', S);
    px(ctx, 0, 0, 27, 26, 10, 2, '#f1c29b', S);
    px(ctx, 0, 0, 23, 18, 4, 3, '#09090b', S);
    px(ctx, 0, 0, 36, 18, 4, 3, '#09090b', S);
  } else if (type === 'MAGA') {
    drawOutlinedRect(ctx, 0, 0, 10, 40, 44, 24, '#0f172a', '#020617', S);
    px(ctx, 0, 0, 14, 40, 4, 24, '#22d3ee', S);
    px(ctx, 0, 0, 46, 40, 4, 24, '#22d3ee', S);
    drawOutlinedRect(ctx, 0, 0, 20, 14, 24, 23, '#f5c29b', '#09090b', S);
    drawOutlinedRect(ctx, 0, 0, 16, 6, 32, 12, '#e0f2fe', '#09090b', S);
    drawOutlinedRect(ctx, 0, 0, 20, 19, 26, 7, '#22d3ee', '#083344', S);
    px(ctx, 0, 0, 23, 21, 20, 2, '#ffffff', S);
  } else {
    drawOutlinedRect(ctx, 0, 0, 10, 40, 44, 24, '#18181b', '#09090b', S);
    drawOutlinedRect(ctx, 0, 0, 16, 35, 32, 9, '#7e22ce', '#2e1065', S);
    drawOutlinedRect(ctx, 0, 0, 18, 8, 28, 28, '#581c87', '#09090b', S);
    drawOutlinedRect(ctx, 0, 0, 21, 18, 22, 7, '#f5c29b', '#09090b', S);
    px(ctx, 0, 0, 24, 20, 5, 3, '#e879f9', S);
    px(ctx, 0, 0, 35, 20, 5, 3, '#e879f9', S);
  }

  return canvas.toDataURL('image/png');
}

let cachedPresets: FighterProfile[] | null = null;

export function getPresetFighters(): FighterProfile[] {
  if (cachedPresets) return cachedPresets;

  const elMozo: FighterProfile = {
    id: 'preset_el_mozo',
    isPreset: true,
    createdAt: 1,
    fighterName: 'EL MOZO',
    subtitle: 'RELÁMPAGO DEL ENCIERRO',
    archetype: 'RUSHDOWN',
    stats: { hp: 20, speed: 34, power: 22, technique: 24 },
    passiveTrait: 'DOUBLE_JUMP',
    traitDescription: 'Doble Salto Acrobático en el aire para mezclar ataques y esquivar proyectiles.',
    moveset: {
      lightNormal: { name: 'JAB DE PEÑA', style: 'FAST_JAB' },
      heavyNormal: { name: 'PATADA DE CHUPINAZO', style: 'LAUNCHER_UPPER' },
      specialNeutral: {
        name: 'ONDA DE PAÑUELO',
        mechanic: 'STRAIGHT_FIREBALL',
        visualAction: 'glowing red handkerchief energy wave',
        primaryHex: '#ef4444',
      },
      specialForward: {
        name: 'BARRIDO DE ADOQUÍN',
        mechanic: 'SLIDE_LOW_KICK',
        visualAction: 'high-speed low sliding kick with red trail',
      },
      specialUp: {
        name: 'ASCENSO SAN FERMÍN',
        mechanic: 'INVINCIBLE_UPPERCUT',
        visualAction: 'rising invincible flaming uppercut knee',
      },
      ultimateSuper: {
        name: 'TORBELLINO DE LA PLAZA',
        mechanic: 'MULTI_HIT_RUSH_COMBO',
        visualAction: 'blazing 12-hit acrobatic crimson rush combo',
      },
    },
    visualDescriptionForSprite:
      'Spanish festival runner in white shirt, red neck kerchief, red waist sash, white pants, and red shoes.',
    spriteSheetDataUrl: generateSheetDataUrl(drawElMozoCell),
    portraitDataUrl: generatePortraitDataUrl('MOZO'),
    scaleMultiplier: 0.98,
  };

  const osoMostaza: FighterProfile = {
    id: 'preset_oso_mostaza',
    isPreset: true,
    createdAt: 2,
    fighterName: 'OSO MOSTAZA',
    subtitle: 'COLOSO DEL PLUMÍFERO',
    archetype: 'GRAPPLER_TANK',
    stats: { hp: 34, speed: 16, power: 33, technique: 17 },
    passiveTrait: 'HEAVY_ARMOR_STARTUP',
    traitDescription: 'Super Armor (absorbe 1 golpe sin retroceder) al iniciar ataques pesados y embestidas.',
    moveset: {
      lightNormal: { name: 'MANOTAZO DE OSO', style: 'QUICK_PALM' },
      heavyNormal: { name: 'MARTILLO ÁRTICO', style: 'OVERHEAD_SMASH' },
      specialNeutral: {
        name: 'TERREMOTO MOSTAZA',
        mechanic: 'GROUND_SHOCKWAVE',
        visualAction: 'amber seismic shockwave traveling along the ground',
        primaryHex: '#eab308',
      },
      specialForward: {
        name: 'ABRAZO DEL OSO',
        mechanic: 'COMMAND_GRAB_SLAM',
        visualAction: 'unblockable bear hug command grab slamming foe into the ground',
      },
      specialUp: {
        name: 'ALUD DE CUMBRE',
        mechanic: 'HIGH_LEAP_STOMP',
        visualAction: 'heavy leaping body splash stomp',
      },
      ultimateSuper: {
        name: 'SUPLEX AVALANCHA',
        mechanic: 'OMEGA_SUPLEX',
        visualAction: 'cataclysmic jumping german suplex with golden shockwave',
      },
    },
    visualDescriptionForSprite:
      'Large bearded brawler wearing a bulky mustard-yellow puffer jacket, black knit beanie, dark cargo pants, and boots.',
    spriteSheetDataUrl: generateSheetDataUrl(drawOsoMostazaCell),
    portraitDataUrl: generatePortraitDataUrl('OSO'),
    scaleMultiplier: 1.15,
  };

  const magaNeon: FighterProfile = {
    id: 'preset_maga_neon',
    isPreset: true,
    createdAt: 3,
    fighterName: 'MAGA NEÓN',
    subtitle: 'ARQUITECTA DE TRAMPAS',
    archetype: 'ZONER_MAGE',
    stats: { hp: 19, speed: 24, power: 25, technique: 32 },
    passiveTrait: 'FAST_METER_GAIN',
    traitDescription: 'Gana +40% de barra Super al lanzar proyectiles y controlar el espacio.',
    moveset: {
      lightNormal: { name: 'CHISPA ARCANA', style: 'FAST_JAB' },
      heavyNormal: { name: 'BARRIDO ETÉREO', style: 'SWEEP_TRIP' },
      specialNeutral: {
        name: 'MINA DE PLASMA',
        mechanic: 'TRAP_MINE_DROP',
        visualAction: 'floating cyan plasma proximity mine',
        primaryHex: '#06b6d4',
      },
      specialForward: {
        name: 'TORBELLINO CÍBER',
        mechanic: 'SPINNING_ADVANCE',
        visualAction: 'spinning cyan vortex advance',
      },
      specialUp: {
        name: 'COLUMNA DE PLASMA',
        mechanic: 'VERTICAL_TORNADO',
        visualAction: 'vertical cybernetic plasma tornado',
      },
      ultimateSuper: {
        name: 'CAÑÓN HIPER-LÁSER',
        mechanic: 'GIANT_BEAM_LASER',
        visualAction: 'screen-wide hyper cyan laser cannon',
      },
    },
    visualDescriptionForSprite:
      'Cyberpunk street mage with glowing cyan visor, silver hair, dark coat, and plasma orb.',
    spriteSheetDataUrl: generateSheetDataUrl(drawMagaNeonCell),
    portraitDataUrl: generatePortraitDataUrl('MAGA'),
    scaleMultiplier: 0.99,
  };

  const sombraNinja: FighterProfile = {
    id: 'preset_sombra_ninja',
    isPreset: true,
    createdAt: 4,
    fighterName: 'SOMBRA NINJA',
    subtitle: 'ESPECTRO DEL TEJADO',
    archetype: 'TRICKSTER',
    stats: { hp: 18, speed: 33, power: 23, technique: 26 },
    passiveTrait: 'AIR_DASH',
    traitDescription: 'Air-Dash aéreo (doble toque en el aire) para entrar desde ángulos impredecibles.',
    moveset: {
      lightNormal: { name: 'CORTE RÁPIDO', style: 'LOW_KICK' },
      heavyNormal: { name: 'TAJO LUNA LLENA', style: 'LONG_ROUNDHOUSE' },
      specialNeutral: {
        name: 'SHURIKEN RETORNO',
        mechanic: 'BOOMERANG_RETURN',
        visualAction: 'spinning purple boomerang shuriken',
        primaryHex: '#a855f7',
      },
      specialForward: {
        name: 'PASO FANTASMA',
        mechanic: 'TELEPORT_BEHIND',
        visualAction: 'instant shadow teleport behind opponent',
      },
      specialUp: {
        name: 'HALCÓN EN PICADO',
        mechanic: 'DIVE_KICK_FROM_AIR',
        visualAction: 'diagonal purple dive kick from mid-air',
      },
      ultimateSuper: {
        name: 'LLUVIA DE METEOROS',
        mechanic: 'METEOR_SCREEN_DROP',
        visualAction: 'orbital purple meteor drop from the sky',
      },
    },
    visualDescriptionForSprite:
      'Agile purple-hooded urban shinobi with scarf and glowing katana.',
    spriteSheetDataUrl: generateSheetDataUrl(drawSombraNinjaCell),
    portraitDataUrl: generatePortraitDataUrl('NINJA'),
    scaleMultiplier: 0.97,
  };

  cachedPresets = [elMozo, osoMostaza, magaNeon, sombraNinja];
  return cachedPresets;
}

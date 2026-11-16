"use strict";
/**
 * SpriteProcessor.ts
 * Processes raw 1024x1024 4x4 sprite sheets (on #00FF00 green background)
 * into clean transparent PNGs with:
 * 1. Chroma-Key removal + Anti-Spill green neutralization
 * 2. Bounding-box detection per cell (cells 0..14)
 * 3. Automatic Foot-Grounding so every character frame's lowest opaque pixel sits at Y = 242px
 * 4. Contextual cell 15: centered projectile or ground-aligned KO pose
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadImage = loadImage;
exports.resizePhotoForGemini = resizePhotoForGemini;
exports.processSpriteSheet = processSpriteSheet;
exports.processPortrait = processPortrait;
exports.readArtFile = readArtFile;
const SHEET_SIZE = 1024;
const GRID = 4;
const CELL_SIZE = 256;
const TARGET_FOOT_Y = 242;
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = src;
    });
}
/**
 * Resizes an uploaded user photo to max 768x768 JPEG base64 string (without prefix)
 */
async function resizePhotoForGemini(file, maxDim = 768) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    const img = await loadImage(dataUrl);
    let width = img.width;
    let height = img.height;
    if (width > maxDim || height > maxDim) {
        if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
        }
        else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
        }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const previewUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64 = previewUrl.split(',')[1];
    return { base64, mimeType: 'image/jpeg', previewUrl };
}
/**
 * Removes #00FF00 green screen and neutralizes green edge spill.
 */
function applyChromaKeyAndDespill(imageData) {
    const { width, height, data } = imageData;
    // IMPORTANT: don't erase green football shirts, accessories or projectiles.
    // Only pixels connected to the *outside of each cell* can be chroma background.
    // Treat each 256px cell separately so a character in one cell never leaks into
    // another when an AI-generated sheet uses slightly imperfect gutters.
    const removed = new Uint8Array(width * height);
    const queue = new Int32Array(CELL_SIZE * CELL_SIZE);
    const isChroma = (index) => {
        const offset = index * 4;
        if (data[offset + 3] <= 24)
            return true; // already transparent background
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        return g > 145 && g - r > 67 && g - b > 67 && r < 150 && b < 150;
    };
    for (let cellY = 0; cellY < height; cellY += CELL_SIZE) {
        for (let cellX = 0; cellX < width; cellX += CELL_SIZE) {
            const xEnd = Math.min(width, cellX + CELL_SIZE);
            const yEnd = Math.min(height, cellY + CELL_SIZE);
            let read = 0, write = 0;
            const enqueue = (x, y) => {
                const idx = y * width + x;
                if (removed[idx] || !isChroma(idx))
                    return;
                removed[idx] = 1;
                queue[write++] = idx;
            };
            for (let x = cellX; x < xEnd; x++) {
                enqueue(x, cellY);
                enqueue(x, yEnd - 1);
            }
            for (let y = cellY + 1; y < yEnd - 1; y++) {
                enqueue(cellX, y);
                enqueue(xEnd - 1, y);
            }
            while (read < write) {
                const idx = queue[read++];
                const x = idx % width, y = (idx / width) | 0;
                if (x > cellX)
                    enqueue(x - 1, y);
                if (x + 1 < xEnd)
                    enqueue(x + 1, y);
                if (y > cellY)
                    enqueue(x, y - 1);
                if (y + 1 < yEnd)
                    enqueue(x, y + 1);
            }
        }
    }
    // Keep enclosed green details. Only soften green fringe adjacent to removed
    // background; this avoids carving holes in brightly coloured outfits.
    for (let i = 0; i < width * height; i++) {
        const pos = i * 4;
        if (removed[i]) {
            data[pos + 3] = 0;
            continue;
        }
        const r = data[pos], g = data[pos + 1], b = data[pos + 2];
        const x = i % width, y = (i / width) | 0;
        const neighborsBackground = (x > 0 && removed[i - 1]) || (x + 1 < width && removed[i + 1]) ||
            (y > 0 && removed[i - width]) || (y + 1 < height && removed[i + width]);
        if (neighborsBackground && g > 110 && g > Math.max(r, b) + 25 && g - Math.max(r, b) < 80) {
            data[pos + 1] = Math.round(g * 0.7 + Math.max(r, b) * 0.3);
        }
    }
}
/**
 * Finds opaque pixel bounding box within a 256x256 cell ImageData.
 */
function findOpaqueBounds(cellData) {
    const { width, height, data } = cellData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 40) {
                if (x < minX)
                    minX = x;
                if (x > maxX)
                    maxX = x;
                if (y < minY)
                    minY = y;
                if (y > maxY)
                    maxY = y;
            }
        }
    }
    return {
        minX,
        minY,
        maxX,
        maxY,
        hasPixels: maxX >= minX && maxY >= minY,
    };
}
/**
 * Full 4x4 Sprite Sheet Processing Pipeline:
 * - Scales source to 1024x1024 with nearest-neighbor / crisp sampling
 * - Applies chroma key + anti-spill
 * - Foot-grounds cells 0..14 to Y = 242px and horizontally centers them cleanly
 * - Centers projectile cell 15; otherwise aligns KO cell 15 to the ground
 */
async function processSpriteSheet(rawDataUrl, lastCell = 'PROJECTILE') {
    const img = await loadImage(rawDataUrl);
    if (Math.abs(img.naturalWidth - img.naturalHeight) > Math.max(img.naturalWidth, img.naturalHeight) * 0.08) {
        throw new Error('El spritesheet debe ser cuadrado (16 celdas en cuadrícula 4×4).');
    }
    // Step 1: Draw onto 1024x1024 canvas
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = SHEET_SIZE;
    srcCanvas.height = SHEET_SIZE;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.imageSmoothingEnabled = false;
    srcCtx.drawImage(img, 0, 0, SHEET_SIZE, SHEET_SIZE);
    // Reject incompatible AI images instead of silently turning the whole scene into a character.
    // A transparent PNG is also accepted; generated sheets generally use chroma green.
    verifySheetBackground(srcCtx);
    // Step 2: Chroma key & despill across entire sheet
    const fullImageData = srcCtx.getImageData(0, 0, SHEET_SIZE, SHEET_SIZE);
    applyChromaKeyAndDespill(fullImageData);
    srcCtx.putImageData(fullImageData, 0, 0);
    // Step 3: Output canvas with Foot-Grounding per cell
    const outCanvas = document.createElement('canvas');
    outCanvas.width = SHEET_SIZE;
    outCanvas.height = SHEET_SIZE;
    const outCtx = outCanvas.getContext('2d');
    outCtx.imageSmoothingEnabled = false;
    // Measure reference horizontal center from Idle Frame 0 so poses stay anchored
    const idleData = srcCtx.getImageData(0, 0, CELL_SIZE, CELL_SIZE);
    const idleBounds = findOpaqueBounds(idleData);
    const referenceCenterX = idleBounds.hasPixels
        ? Math.round((idleBounds.minX + idleBounds.maxX) / 2)
        : 128;
    for (let idx = 0; idx < 16; idx++) {
        const col = idx % GRID;
        const row = Math.floor(idx / GRID);
        const sx = col * CELL_SIZE;
        const sy = row * CELL_SIZE;
        const cellData = srcCtx.getImageData(sx, sy, CELL_SIZE, CELL_SIZE);
        const bounds = findOpaqueBounds(cellData);
        if (!bounds.hasPixels) {
            // Fallback: if a cell came out empty, clone Idle cell 0 so character never disappears
            if (idx !== 0) {
                outCtx.drawImage(outCanvas, 0, 0, CELL_SIZE, CELL_SIZE, sx, sy, CELL_SIZE, CELL_SIZE);
            }
            continue;
        }
        const spriteW = bounds.maxX - bounds.minX + 1;
        const spriteH = bounds.maxY - bounds.minY + 1;
        // Slight trim inset (1px) if grid borders bled in at edges
        const trimLeft = bounds.minX <= 2 ? 2 : bounds.minX;
        const trimTop = bounds.minY <= 2 ? 2 : bounds.minY;
        const trimRight = bounds.maxX >= CELL_SIZE - 3 ? CELL_SIZE - 3 : bounds.maxX;
        const trimBottom = bounds.maxY >= CELL_SIZE - 3 ? CELL_SIZE - 3 : bounds.maxY;
        const cleanW = Math.max(1, trimRight - trimLeft + 1);
        const cleanH = Math.max(1, trimBottom - trimTop + 1);
        if (idx === 15 && lastCell === 'PROJECTILE') {
            // Cell 15: isolated projectile -> center horizontally and vertically in cell
            const destX = sx + Math.round((CELL_SIZE - cleanW) / 2);
            const destY = sy + Math.round((CELL_SIZE - cleanH) / 2);
            outCtx.drawImage(srcCanvas, sx + trimLeft, sy + trimTop, cleanW, cleanH, destX, destY, cleanW, cleanH);
        }
        else {
            // All full-body poses, including conditional KO cell 15, must share a ground baseline.
            const currentCenterX = Math.round((trimLeft + trimRight) / 2);
            // Blend cell center with reference center so attacks extend forward naturally without drifting backward
            const anchorX = idx <= 5 || idx >= 12
                ? 128 - currentCenterX
                : Math.max(-36, Math.min(48, 118 - trimLeft));
            const destX = sx + Math.max(4, Math.min(CELL_SIZE - cleanW - 4, trimLeft + anchorX));
            const destY = sy + Math.max(4, TARGET_FOOT_Y - cleanH);
            outCtx.drawImage(srcCanvas, sx + trimLeft, sy + trimTop, cleanW, cleanH, destX, destY, cleanW, cleanH);
        }
    }
    return outCanvas.toDataURL('image/png');
}
/** Detects flat green/transparent cell backgrounds before a sheet becomes playable. */
function verifySheetBackground(ctx) {
    const pixels = ctx.getImageData(0, 0, SHEET_SIZE, SHEET_SIZE).data;
    let clean = 0;
    let total = 0;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            for (const [cx, cy] of [[12, 12], [244, 12], [12, 244], [244, 244]]) {
                const at = (((row * 256 + cy) * SHEET_SIZE) + col * 256 + cx) * 4;
                const r = pixels[at], g = pixels[at + 1], b = pixels[at + 2], a = pixels[at + 3];
                if (a < 32 || (g > 145 && g > r + 65 && g > b + 65))
                    clean++;
                total++;
            }
        }
    }
    if (clean < total * 0.6) {
        throw new Error('El spritesheet no tiene fondo verde #00FF00 ni transparente en suficientes celdas. Regenera con el prompt o importa un PNG corregido.');
    }
    // A green canvas / single large illustration cannot be interpreted as sixteen poses.
    let occupiedCells = 0;
    for (let index = 0; index < 15; index++) {
        const ox = (index % 4) * 256, oy = Math.floor(index / 4) * 256;
        let colored = 0;
        for (let y = 16; y < 240; y += 8)
            for (let x = 16; x < 240; x += 8) {
                const at = (((oy + y) * SHEET_SIZE) + (ox + x)) * 4;
                const r = pixels[at], g = pixels[at + 1], b = pixels[at + 2], a = pixels[at + 3];
                if (a > 60 && !(g > 145 && g > r + 65 && g > b + 65))
                    colored++;
            }
        if (colored >= 10)
            occupiedCells++;
    }
    if (occupiedCells < 12)
        throw new Error(`Solo se reconocen ${occupiedCells}/15 poses del luchador. Se necesita una cuadrícula real de 4×4 con un personaje en casi todas las celdas.`);
}
/** Portrait can be uploaded in arbitrary aspect ratio; normalize it to a square 512x512. */
async function processPortrait(rawDataUrl) {
    const image = await loadImage(rawDataUrl);
    if (image.naturalWidth < 64 || image.naturalHeight < 64)
        throw new Error('El retrato es demasiado pequeño (mínimo 64 px).');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('Canvas no disponible.');
    ctx.imageSmoothingEnabled = false;
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 512, 512);
    return canvas.toDataURL('image/png');
}
async function readArtFile(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        throw new Error('Formato no compatible. Sube PNG, JPG o WEBP.');
    if (file.size > 15 * 1024 * 1024)
        throw new Error('El archivo supera el máximo de 15 MB.');
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.readAsDataURL(file);
    });
}

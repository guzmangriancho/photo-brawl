"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeChromaBackground = removeChromaBackground;
/**
 * Remove connected exterior green and *enclosed* chroma-green holes in each grid
 * cell. Distinguish holes from green clothing by requiring enclosed islands to be
 * almost entirely the key colour (#00FF00), not simply green-ish.
 */
function removeChromaBackground(surface, cellSize = 256) {
    const { width, height, data } = surface;
    const seen = new Uint8Array(width * height);
    const erased = new Uint8Array(width * height);
    const queue = new Int32Array(Math.min(cellSize, width) * Math.min(cellSize, height));
    const loose = (i) => {
        const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
        return data[p + 3] <= 24 || (g > 145 && g - r > 67 && g - b > 67 && r < 150 && b < 150);
    };
    const exact = (i) => {
        const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
        return data[p + 3] <= 24 || (g >= 215 && r <= 55 && b <= 55 && g - r >= 165 && g - b >= 165);
    };
    for (let cy = 0; cy < height; cy += cellSize)
        for (let cx = 0; cx < width; cx += cellSize) {
            const xEnd = Math.min(width, cx + cellSize), yEnd = Math.min(height, cy + cellSize);
            const flood = (xStart, yStart, exterior) => {
                const first = yStart * width + xStart;
                if (seen[first] || !loose(first))
                    return;
                let read = 0, write = 0, exactCount = 0;
                seen[first] = 1;
                queue[write++] = first;
                while (read < write) {
                    const i = queue[read++], x = i % width, y = (i / width) | 0;
                    if (exact(i))
                        exactCount++;
                    const add = (j) => { if (!seen[j] && loose(j)) {
                        seen[j] = 1;
                        queue[write++] = j;
                    } };
                    if (x > cx)
                        add(i - 1);
                    if (x + 1 < xEnd)
                        add(i + 1);
                    if (y > cy)
                        add(i - width);
                    if (y + 1 < yEnd)
                        add(i + width);
                }
                // A hole (between a body and a bent arm, between legs, etc.) is
                // enclosed. Require the chroma-key signature in nearly every pixel so
                // ordinary green clothes/effects are not erased just for being green.
                const transparent = exterior || (write >= 5 && exactCount / write >= 0.8);
                if (transparent)
                    for (let j = 0; j < write; j++)
                        erased[queue[j]] = 1;
            };
            for (let x = cx; x < xEnd; x++) {
                flood(x, cy, true);
                flood(x, yEnd - 1, true);
            }
            for (let y = cy + 1; y < yEnd - 1; y++) {
                flood(cx, y, true);
                flood(xEnd - 1, y, true);
            }
            for (let y = cy + 1; y < yEnd - 1; y++)
                for (let x = cx + 1; x < xEnd - 1; x++) {
                    const i = y * width + x;
                    if (!seen[i] && loose(i))
                        flood(x, y, false);
                }
        }
    // V14: Key-green fringes are frequently *not* connected components: the
    // generated edge pixels have a little foreground pigment mixed into them.
    // Keep solid green costume regions untouched, but neutralize the immediate
    // edge against a removed green background. No image blur: crisp pixel edges.
    const src = new Uint8ClampedArray(data);
    for (let i = 0; i < width * height; i++) {
        const p = i * 4;
        if (erased[i]) {
            data[p + 3] = 0;
            continue;
        }
        if (src[p + 3] === 0)
            continue;
        const x = i % width, y = (i / width) | 0;
        const touchesKey = (x > 0 && erased[i - 1]) || (x + 1 < width && erased[i + 1]) ||
            (y > 0 && erased[i - width]) || (y + 1 < height && erased[i + width]) ||
            (x > 0 && y > 0 && erased[i - width - 1]) || (x + 1 < width && y > 0 && erased[i - width + 1]) ||
            (x > 0 && y + 1 < height && erased[i + width - 1]) || (x + 1 < width && y + 1 < height && erased[i + width + 1]);
        if (!touchesKey)
            continue;
        const r = src[p], g = src[p + 1], b = src[p + 2];
        const excess = g - Math.max(r, b);
        if (excess <= 30 || g <= 120)
            continue;
        // Almost pure lime next to transparency is part of the chroma fringe.
        // Remaining pixels have some foreground: remove the green spill while
        // retaining their opaque, recognizable outline.
        if (g >= 175 && excess >= 115 && r < 105 && b < 105) {
            data[p + 3] = 0;
        }
        else if (excess >= 65) {
            data[p + 3] = Math.round(src[p + 3] * 0.68);
            data[p + 1] = Math.min(g, Math.max(r, b) + 22);
        }
        else {
            data[p + 1] = Math.min(g, Math.max(r, b) + 28);
        }
    }
}

"use strict";
/**
 * SoundFX.ts
 * Retro 16-bit Chiptune & Arcade Sound Synthesizer using Web Audio API.
 * Zero external audio files required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.soundFX = void 0;
class SoundFXEngine {
    ctx = null;
    muted = false;
    ensureContext() {
        if (this.muted)
            return null;
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
        return this.ctx;
    }
    playTone(freqStart, freqEnd, duration, type = 'square', gainPeak = 0.16, delay = 0) {
        const ctx = this.ensureContext();
        if (!ctx)
            return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }
    playNoise(duration, gainPeak = 0.18, filterFreq = 1200, delay = 0) {
        const ctx = this.ensureContext();
        if (!ctx)
            return;
        const now = ctx.currentTime + delay;
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(filterFreq, now);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(gainPeak, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + duration + 0.01);
    }
    whiff() {
        this.playNoise(0.07, 0.09, 1800);
        this.playTone(320, 140, 0.07, 'triangle', 0.08);
    }
    lightHit() {
        this.playNoise(0.08, 0.18, 2200);
        this.playTone(460, 110, 0.09, 'square', 0.16);
    }
    heavyHit() {
        this.playNoise(0.16, 0.28, 900);
        this.playTone(220, 48, 0.18, 'sawtooth', 0.24);
        this.playTone(130, 40, 0.22, 'square', 0.18);
    }
    block() {
        this.playTone(240, 180, 0.07, 'square', 0.14);
        this.playNoise(0.05, 0.1, 1400);
    }
    parry() {
        // Crisp 3rd-Strike style metallic chime
        this.playTone(987.77, 1318.5, 0.09, 'square', 0.22);
        this.playTone(1567.98, 2093, 0.18, 'triangle', 0.24, 0.04);
    }
    armorAbsorb() {
        this.playTone(110, 85, 0.14, 'sawtooth', 0.24);
        this.playTone(165, 110, 0.12, 'square', 0.18);
    }
    projectile() {
        this.playTone(680, 210, 0.18, 'sawtooth', 0.15);
        this.playTone(880, 320, 0.15, 'square', 0.1, 0.02);
    }
    commandGrab() {
        this.playTone(180, 620, 0.11, 'square', 0.2);
        this.playTone(140, 42, 0.28, 'sawtooth', 0.28, 0.14);
        this.playNoise(0.24, 0.3, 600, 0.14);
    }
    jump() {
        this.playTone(180, 440, 0.11, 'square', 0.1);
    }
    dash() {
        this.playNoise(0.09, 0.14, 2600);
        this.playTone(300, 520, 0.08, 'triangle', 0.1);
    }
    superFlash() {
        // Dramatic arcade super activation arpeggio
        const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
        notes.forEach((n, idx) => {
            this.playTone(n, n * 1.05, 0.12, 'square', 0.18, idx * 0.035);
        });
        this.playNoise(0.28, 0.2, 3200);
    }
    selectBeep() {
        this.playTone(587.33, 880, 0.07, 'square', 0.12);
    }
    confirmBeep() {
        this.playTone(523.25, 659.25, 0.08, 'square', 0.15);
        this.playTone(783.99, 1046.5, 0.14, 'square', 0.16, 0.07);
    }
    roundStart() {
        this.playTone(392, 392, 0.1, 'square', 0.16, 0);
        this.playTone(523.25, 523.25, 0.1, 'square', 0.16, 0.12);
        this.playTone(659.25, 783.99, 0.22, 'square', 0.2, 0.24);
    }
    koFanfare() {
        this.playNoise(0.35, 0.32, 500);
        this.playTone(220, 55, 0.45, 'sawtooth', 0.28);
        const victory = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
        victory.forEach((freq, i) => {
            this.playTone(freq, freq, i === victory.length - 1 ? 0.35 : 0.11, 'square', 0.16, 0.45 + i * 0.12);
        });
    }
}
exports.soundFX = new SoundFXEngine();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.soundFX = exports.SoundFXEngine = void 0;
const POLICIES = {
    whiff: { priority: 1, cooldown: 110, duration: 95, volume: .38 },
    jump: { priority: 1, cooldown: 120, duration: 140, volume: .48 },
    dash: { priority: 1, cooldown: 135, duration: 130, volume: .40 },
    light: { priority: 2, cooldown: 66, duration: 120, volume: .65 },
    block: { priority: 2, cooldown: 80, duration: 110, volume: .58 },
    projectile: { priority: 2, cooldown: 125, duration: 220, volume: .55 },
    heavy: { priority: 3, cooldown: 95, duration: 260, volume: .78 },
    armor: { priority: 3, cooldown: 150, duration: 200, volume: .73 },
    grab: { priority: 3, cooldown: 175, duration: 420, volume: .75 },
    parry: { priority: 4, cooldown: 145, duration: 270, volume: .90 },
    super: { priority: 5, cooldown: 500, duration: 510, volume: .95 },
    round: { priority: 5, cooldown: 450, duration: 600, volume: .68 },
    ko: { priority: 6, cooldown: 240, duration: 430, volume: 1 },
    victory: { priority: 7, cooldown: 800, duration: 1200, volume: .82 },
    select: { priority: 2, cooldown: 55, duration: 100, volume: .54 },
    confirm: { priority: 3, cooldown: 90, duration: 260, volume: .65 },
};
class SoundFXEngine {
    ctx = null;
    bus = null;
    active = [];
    last = new Map();
    currentGain = 1;
    crowded = false;
    focusUntil = 0;
    muted = false;
    /** Call once on entering/leaving four-player combat. */
    setCrowdedCombat(value) { this.crowded = value; this.active = []; this.last.clear(); }
    ensureContext() {
        if (this.muted || typeof window === 'undefined')
            return null;
        if (!this.ctx) {
            try {
                const Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor)
                    return null;
                this.ctx = new Ctor();
                const limiter = this.ctx.createDynamicsCompressor();
                limiter.threshold.value = -23;
                limiter.knee.value = 14;
                limiter.ratio.value = 4;
                limiter.attack.value = .004;
                limiter.release.value = .16;
                const master = this.ctx.createGain();
                master.gain.value = .63;
                limiter.connect(master);
                master.connect(this.ctx.destination);
                this.bus = limiter;
            }
            catch {
                return null;
            }
        }
        if (this.ctx.state === 'suspended')
            void this.ctx.resume().catch(() => { });
        return this.ctx;
    }
    /** An event is one logical sound, even when it consists of several oscillators. */
    cue(key, emit) {
        const ctx = this.ensureContext();
        if (!ctx)
            return;
        const now = ctx.currentTime * 1000, policy = POLICIES[key];
        const gap = policy.cooldown * (this.crowded && policy.priority <= 3 ? 1.8 : 1);
        if (now - (this.last.get(key) ?? -Infinity) < gap)
            return;
        this.active = this.active.filter(v => v.until > now);
        const budget = this.crowded ? 5 : 8;
        if (this.active.length >= budget && this.active.filter(v => v.priority >= policy.priority).length >= budget - 1)
            return;
        // During a knockout/super, foreground sounds must be heard rather than a shower of whiffs.
        if (now < this.focusUntil && policy.priority <= 2)
            return;
        this.last.set(key, now);
        this.active.push({ cue: key, priority: policy.priority, until: now + policy.duration });
        if (policy.priority >= 5)
            this.focusUntil = now + (key === 'victory' ? 660 : key === 'ko' ? 300 : 220);
        this.currentGain = policy.volume * (this.crowded && policy.priority <= 3 ? .67 : 1);
        try {
            emit();
        }
        finally {
            this.currentGain = 1;
        }
    }
    tone(a, b, d, kind = 'square', peak = .12, delay = 0) {
        const ctx = this.ctx, bus = this.bus;
        if (!ctx || !bus)
            return;
        const when = ctx.currentTime + delay;
        const oscillator = ctx.createOscillator(), volume = ctx.createGain();
        oscillator.type = kind;
        oscillator.frequency.setValueAtTime(a, when);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, b), when + d);
        volume.gain.setValueAtTime(.0001, when);
        volume.gain.linearRampToValueAtTime(Math.max(.0002, peak * this.currentGain), when + .008);
        volume.gain.exponentialRampToValueAtTime(.0001, when + d);
        oscillator.connect(volume);
        volume.connect(bus);
        oscillator.start(when);
        oscillator.stop(when + d + .025);
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    }
    noise(d, peak = .10, freq = 1200, delay = 0) {
        const ctx = this.ctx, bus = this.bus;
        if (!ctx || !bus)
            return;
        const when = ctx.currentTime + delay;
        const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * d)), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++)
            data[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), volume = ctx.createGain();
        source.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq, when);
        volume.gain.setValueAtTime(Math.max(.0002, peak * this.currentGain), when);
        volume.gain.exponentialRampToValueAtTime(.0001, when + d);
        source.connect(filter);
        filter.connect(volume);
        volume.connect(bus);
        source.start(when);
        source.stop(when + d + .015);
        source.onended = () => { source.disconnect(); filter.disconnect(); volume.disconnect(); };
    }
    whiff() { this.cue('whiff', () => { this.noise(.055, .065, 1500); this.tone(280, 150, .07, 'triangle', .05); }); }
    lightHit() { this.cue('light', () => { this.noise(.07, .095, 1600); this.tone(310, 125, .10, 'triangle', .12); }); }
    heavyHit() { this.cue('heavy', () => { this.noise(.13, .14, 800); this.tone(175, 54, .2, 'sawtooth', .15); }); }
    block() { this.cue('block', () => { this.tone(320, 210, .07, 'square', .10); this.noise(.043, .04, 1800); }); }
    parry() { this.cue('parry', () => { this.tone(988, 1318, .10, 'square', .18); this.tone(1568, 2093, .18, 'triangle', .14, .045); this.tone(2093, 2637, .14, 'triangle', .10, .10); this.noise(.03, .07, 3400); }); }
    guardBreak() { this.cue('armor', () => { this.tone(220, 70, .20, 'sawtooth', .15); this.noise(.12, .10, 900); this.tone(660, 330, .10, 'square', .09, .03); }); }
    armorAbsorb() { this.cue('armor', () => { this.tone(120, 75, .15, 'sawtooth', .13); this.tone(180, 100, .11, 'triangle', .08); }); }
    projectile() { this.cue('projectile', () => { this.tone(610, 210, .16, 'sawtooth', .10); }); }
    commandGrab() { this.cue('grab', () => { this.tone(160, 570, .12, 'square', .14); this.tone(160, 50, .25, 'triangle', .14, .11); }); }
    jump() { this.cue('jump', () => this.tone(180, 390, .10, 'triangle', .075)); }
    dash() { this.cue('dash', () => this.noise(.065, .07, 2100)); }
    superFlash() {
        this.cue('super', () => {
            [440, 554.37, 659.25, 880].forEach((freq, i) => this.tone(freq, freq * 1.05, .12, 'square', .12, i * .045));
            this.noise(.22, .09, 2600);
        });
    }
    selectBeep() { this.cue('select', () => this.tone(587, 880, .075, 'square', .09)); }
    confirmBeep() { this.cue('confirm', () => { this.tone(523, 659, .08, 'square', .11); this.tone(784, 1047, .13, 'triangle', .10, .075); }); }
    roundStart() {
        this.cue('round', () => {
            [392, 523, 659].forEach((freq, i) => this.tone(freq, freq, .12, 'square', .11, i * .13));
        });
    }
    /** Short, weighty hit sound for losing one stock. NOT a victory fanfare. */
    koImpact() {
        this.cue('ko', () => {
            this.noise(.22, .18, 630);
            this.tone(190, 45, .3, 'sawtooth', .20);
            this.tone(960, 520, .14, 'square', .11, .035);
        });
    }
    /** Played once for a FINISHED match, after the KO impact. */
    victoryFanfare() {
        this.cue('victory', () => {
            [523, 659, 784, 1046].forEach((freq, i) => this.tone(freq, freq, i === 3 ? .34 : .15, 'square', .125, .21 + i * .145));
        });
    }
    /** Backwards-compatible name for callers outside the combat engine. */
    koFanfare() { this.koImpact(); this.victoryFanfare(); }
}
exports.SoundFXEngine = SoundFXEngine;
exports.soundFX = new SoundFXEngine();

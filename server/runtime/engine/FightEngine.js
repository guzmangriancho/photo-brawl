"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FightEngine = exports.FLOOR_Y = exports.STAGE_HEIGHT = exports.STAGE_WIDTH = void 0;
const SpriteProcessor_1 = require("./SpriteProcessor");
const stages_1 = require("../data/stages");
const SoundFX_1 = require("./SoundFX");
const ArcadeVFX_1 = require("./ArcadeVFX");
// Visual assets are loaded only in browsers. The authoritative Node combat server
// never needs Image/DOM APIs. Frames render the old procedural background until ready.
const stageImageCache = new Map();
function readyStageImage(stage) {
    if (typeof Image === 'undefined')
        return null;
    const cached = stageImageCache.get(stage);
    if (cached !== undefined)
        return cached?.complete && cached.naturalWidth > 0 ? cached : null;
    const image = new Image();
    stageImageCache.set(stage, image);
    image.decoding = 'async';
    image.src = stages_1.STAGE_ART[stage].image;
    image.onerror = () => stageImageCache.set(stage, null);
    return null;
}
exports.STAGE_WIDTH = 960;
exports.STAGE_HEIGHT = 540;
exports.FLOOR_Y = 472;
const WALL_MARGIN = 64;
function createEmptyInput() {
    return {
        left: false,
        right: false,
        up: false,
        down: false,
        guard: false,
        light: false,
        heavy: false,
        spNeutral: false,
        spForward: false,
        spUp: false,
        superBtn: false,
        romanCancel: false,
        dashLeft: false,
        dashRight: false,
    };
}
class FightEngine {
    p1;
    p2;
    mode;
    stage;
    difficulty;
    showHitboxes = false;
    /** Separate Training-only view: show exact main floor, one-way tops and fighter feet. */
    showArenaCollisions = false;
    cameraZoom = 1;
    cameraX = exports.STAGE_WIDTH / 2;
    cameraY = exports.STAGE_HEIGHT / 2;
    trainingDummyMode = 'IDLE';
    frameCount = 0;
    hitstopFrames = 0;
    superFlashFrames = 0;
    superFlashOwner = 0;
    shakeIntensity = 0;
    roundTimerFrames = 99 * 60;
    /** roundOver means MATCH over; intermediate KOs trigger the next round automatically. */
    roundOver = false;
    roundNumber = 1;
    p1RoundWins = 0;
    p2RoundWins = 0;
    roundBreakFrames = 0;
    roundIntroFrames = 0;
    winnerName = null;
    announceText = 'ROUND 1 - FIGHT!';
    announceTimer = 75;
    projectiles = [];
    particles = [];
    callouts = [];
    afterimages = [];
    shockwaves = [];
    parryBursts = [];
    meteors = [];
    crossSlashes = [];
    nextProjId = 1;
    p1Input = createEmptyInput();
    p2Input = createEmptyInput();
    constructor(p1Profile, p2Profile, mode, stage, difficulty = 'NORMAL') {
        this.mode = mode;
        this.stage = stage;
        this.difficulty = difficulty;
        this.p1 = this.createFighterRuntime(0, p1Profile, 260, 1);
        this.p2 = this.createFighterRuntime(1, p2Profile, exports.STAGE_WIDTH - 260, -1);
    }
    createFighterRuntime(index, profile, startX, facing) {
        const maxHp = Math.round(850 + ((profile.stats.hp - 15) / 20) * 450);
        const isTank = profile.archetype === 'GRAPPLER_TANK';
        const scale = (profile.scaleMultiplier || (isTank ? 1.15 : 1.0)) * ((0, stages_1.getLargeArena)(this.stage)?.fighterScale ?? 1);
        return {
            index,
            profile,
            spriteSheet: null,
            x: startX,
            y: this.getStageFloorY(),
            vx: 0,
            vy: 0,
            facing,
            hp: maxHp,
            maxHp,
            meter: this.mode === 'TRAINING' ? 100 : 0,
            state: 'IDLE',
            stateFrame: 0,
            hitstunFrames: 0,
            blockstunFrames: 0,
            blockPressFrame: -999,
            hasArmorActive: false,
            invincibleFrames: 0,
            jumpsRemaining: profile.passiveTrait === 'DOUBLE_JUMP' ? 2 : 1,
            airDashUsed: false,
            dropThroughFrames: 0,
            lightChainCount: 0,
            comboCount: 0,
            comboDamage: 0,
            comboTimer: 0,
            damageScaling: 1,
            currentAttack: null,
            hurtbox: {
                width: Math.round((isTank ? 74 : 58) * scale),
                height: Math.round((isTank ? 168 : 154) * scale),
            },
            scale,
            prevInput: createEmptyInput(),
            actionPrevInput: createEmptyInput(),
            bufferedActions: [],
            bufferedDash: null,
            bufferedJumpFrame: null,
            lastTapLeftFrame: -999,
            lastTapRightFrame: -999,
            aiCooldown: 12,
            projectileCooldownFrames: 0,
            grabbedBy: null,
            grabSlamTimer: 0,
        };
    }
    async loadAssets() {
        const [img1, img2] = await Promise.all([
            (0, SpriteProcessor_1.loadImage)(this.p1.profile.spriteSheetDataUrl).catch(() => null),
            (0, SpriteProcessor_1.loadImage)(this.p2.profile.spriteSheetDataUrl).catch(() => null),
        ]);
        this.p1.spriteSheet = img1;
        this.p2.spriteSheet = img2;
        SoundFX_1.soundFX.roundStart();
    }
    /** Switch stages on online rematch without mixing the previous arena's scale. */
    setStage(stage) {
        if (this.stage === stage) {
            this.resetRound();
            this.frameCount = 0;
            return;
        }
        this.stage = stage;
        this.resetRound();
        this.frameCount = 0;
        this.cameraZoom = 1;
        this.cameraX = exports.STAGE_WIDTH / 2;
        this.cameraY = exports.STAGE_HEIGHT / 2;
    }
    /** Reset the entire match (for rematches), retaining already decoded art. */
    resetRound() {
        this.roundNumber = 1;
        this.p1RoundWins = 0;
        this.p2RoundWins = 0;
        this.roundBreakFrames = 0;
        this.roundIntroFrames = 0;
        this.resetFighters();
        this.announceText = 'ROUND 1 · FIGHT!';
        this.announceTimer = 75;
    }
    resetFighters() {
        const sprite1 = this.p1.spriteSheet, sprite2 = this.p2.spriteSheet;
        this.p1 = this.createFighterRuntime(0, this.p1.profile, 260, 1);
        this.p2 = this.createFighterRuntime(1, this.p2.profile, exports.STAGE_WIDTH - 260, -1);
        // Node has no window/Image; sprites are loaded only once on the browser.
        this.p1.spriteSheet = sprite1;
        this.p2.spriteSheet = sprite2;
        this.projectiles = [];
        this.particles = [];
        this.callouts = [];
        this.afterimages = [];
        this.shockwaves = [];
        this.parryBursts = [];
        this.meteors = [];
        this.crossSlashes = [];
        this.roundTimerFrames = 99 * 60;
        this.hitstopFrames = 0;
        this.superFlashFrames = 0;
        this.p1Input = createEmptyInput();
        this.p2Input = createEmptyInput();
        this.roundOver = false;
        this.winnerName = null;
    }
    completeRound(winner) {
        // A timeout tie replays the round; wins are never awarded twice.
        if (this.roundOver || this.roundBreakFrames > 0 || this.roundIntroFrames > 0)
            return;
        if (winner === 0)
            this.p1RoundWins++;
        if (winner === 1)
            this.p2RoundWins++;
        const roundWinner = winner === null ? 'EMPATE' : winner === 0 ? this.p1.profile.fighterName : this.p2.profile.fighterName;
        const matchWinner = this.p1RoundWins === 2 ? this.p1.profile.fighterName : this.p2RoundWins === 2 ? this.p2.profile.fighterName : null;
        if (matchWinner) {
            this.roundOver = true;
            this.winnerName = matchWinner;
            this.announceText = `${matchWinner} · ¡VICTORIA!`;
            this.announceTimer = 260;
        }
        else {
            this.roundBreakFrames = 120; // 2 seconds to see the KO, then the next round.
            this.announceText = winner === null ? '¡EMPATE! REPETIR RONDA' : `${roundWinner} · RONDA GANADA`;
            this.announceTimer = 120;
        }
    }
    setP1Mechanic(slot, mechanic, label) {
        const clonedMoveset = JSON.parse(JSON.stringify(this.p1.profile.moveset));
        if (slot === 'SP_NEUTRAL') {
            clonedMoveset.specialNeutral.mechanic = mechanic;
            if (label)
                clonedMoveset.specialNeutral.name = label;
        }
        else if (slot === 'SP_FORWARD') {
            clonedMoveset.specialForward.mechanic = mechanic;
            if (label)
                clonedMoveset.specialForward.name = label;
        }
        else if (slot === 'SP_UP') {
            clonedMoveset.specialUp.mechanic = mechanic;
            if (label)
                clonedMoveset.specialUp.name = label;
        }
        else if (slot === 'SUPER') {
            clonedMoveset.ultimateSuper.mechanic = mechanic;
            if (label)
                clonedMoveset.ultimateSuper.name = label;
        }
        this.p1.profile = {
            ...this.p1.profile,
            moveset: clonedMoveset,
        };
    }
    triggerP1MoveNow(slot) {
        if (slot === 'SUPER') {
            this.p1.meter = 100;
        }
        this.startMove(this.p1, this.p2, slot);
    }
    getSnapshot() {
        return {
            p1Hp: this.p1.hp,
            p1MaxHp: this.p1.maxHp,
            p1Meter: Math.floor(this.p1.meter),
            p1Combo: this.p1.comboCount,
            p1ChainStep: this.p1.state === 'ATTACK' && this.p1.currentAttack?.slot === 'LIGHT' && this.p1.currentAttack.hasHit ? this.p1.lightChainCount : 0,
            p1ComboDamage: Math.round(this.p1.comboDamage),
            p2Hp: this.p2.hp,
            p2MaxHp: this.p2.maxHp,
            p2Meter: Math.floor(this.p2.meter),
            p2Combo: this.p2.comboCount,
            p2ChainStep: this.p2.state === 'ATTACK' && this.p2.currentAttack?.slot === 'LIGHT' && this.p2.currentAttack.hasHit ? this.p2.lightChainCount : 0,
            p2ComboDamage: Math.round(this.p2.comboDamage),
            timer: Math.max(0, Math.ceil(this.roundTimerFrames / 60)),
            roundOver: this.roundOver,
            winnerName: this.winnerName,
            announceText: this.announceTimer > 0 ? this.announceText : null,
            roundNumber: this.roundNumber, p1RoundWins: this.p1RoundWins, p2RoundWins: this.p2RoundWins,
            roundBreakFrames: this.roundBreakFrames, roundIntroFrames: this.roundIntroFrames,
        };
    }
    /** Network wire format: never transmits sprite images, source photos or player input history. */
    exportNetworkState() {
        const fighter = (f) => ({
            x: f.x, y: f.y, vx: f.vx, vy: f.vy, facing: f.facing, hp: f.hp, maxHp: f.maxHp,
            meter: f.meter, state: f.state, stateFrame: f.stateFrame, hitstunFrames: f.hitstunFrames,
            blockstunFrames: f.blockstunFrames, invincibleFrames: f.invincibleFrames,
            projectileCooldownFrames: f.projectileCooldownFrames,
            lightChainCount: f.lightChainCount, comboCount: f.comboCount, comboDamage: f.comboDamage,
            comboTimer: f.comboTimer, jumpsRemaining: f.jumpsRemaining, airDashUsed: f.airDashUsed,
            hasArmorActive: f.hasArmorActive, currentAttack: f.currentAttack,
            grabbedBy: f.grabbedBy, grabSlamTimer: f.grabSlamTimer,
        });
        return {
            frame: this.frameCount, snapshot: this.getSnapshot(), p1: fighter(this.p1), p2: fighter(this.p2),
            projectiles: this.projectiles.map(({ spriteSheet, ...p }) => p),
            particles: this.particles, callouts: this.callouts, afterimages: this.afterimages,
            shockwaves: this.shockwaves, parryBursts: this.parryBursts, meteors: this.meteors, crossSlashes: this.crossSlashes,
            superFlashFrames: this.superFlashFrames, superFlashOwner: this.superFlashOwner,
            hitstopFrames: this.hitstopFrames, shakeIntensity: this.shakeIntensity,
            announceTimer: this.announceTimer, roundTimerFrames: this.roundTimerFrames,
        };
    }
    /** Render-only client state; server always owns physics, health and timers. */
    applyNetworkState(state) {
        if (!state || state.frame < this.frameCount)
            return;
        this.frameCount = state.frame;
        Object.assign(this.p1, state.p1);
        Object.assign(this.p2, state.p2);
        // Wire data only contains ownerIndex, never the Image object. Restore the
        // actual projectile art from the *owner's* loaded sheet on each snapshot.
        this.projectiles = state.projectiles.map((value) => {
            const p = value;
            return { ...p, spriteSheet: p.ownerIndex === 0 ? this.p1.spriteSheet : this.p2.spriteSheet };
        });
        this.particles = state.particles;
        this.callouts = state.callouts;
        this.afterimages = state.afterimages;
        this.shockwaves = state.shockwaves;
        this.parryBursts = (state.parryBursts || []);
        this.meteors = state.meteors;
        this.crossSlashes = state.crossSlashes;
        this.superFlashFrames = state.superFlashFrames;
        this.superFlashOwner = state.superFlashOwner;
        this.hitstopFrames = state.hitstopFrames;
        this.shakeIntensity = state.shakeIntensity;
        this.announceTimer = state.announceTimer;
        this.roundTimerFrames = state.roundTimerFrames;
        this.roundOver = state.snapshot.roundOver;
        this.winnerName = state.snapshot.winnerName;
        this.announceText = state.snapshot.announceText;
        this.roundNumber = state.snapshot.roundNumber;
        this.p1RoundWins = state.snapshot.p1RoundWins;
        this.p2RoundWins = state.snapshot.p2RoundWins;
        this.roundBreakFrames = state.snapshot.roundBreakFrames;
        this.roundIntroFrames = state.snapshot.roundIntroFrames;
    }
    queueNetworkAction(index, slot) {
        const f = index === 0 ? this.p1 : this.p2;
        if (this.roundOver || this.roundBreakFrames > 0 || this.roundIntroFrames > 0 || (slot === 'SUPER' && f.meter < 100))
            return;
        f.bufferedActions.push({ slot, frame: this.frameCount });
        if (f.bufferedActions.length > 4)
            f.bufferedActions.shift();
    }
    queueNetworkJump(index) {
        if (!this.roundOver && !this.roundBreakFrames && !this.roundIntroFrames)
            (index === 0 ? this.p1 : this.p2).bufferedJumpFrame = this.frameCount;
    }
    queueNetworkDash(index, dir) {
        if (!this.roundOver && !this.roundBreakFrames && !this.roundIntroFrames)
            (index === 0 ? this.p1 : this.p2).bufferedDash = { dir, frame: this.frameCount };
    }
    /** Captura pulsaciones incluso durante HITSTOP. La orden dura ~0,38 s,
     * y puede ser consumida por el siguiente enlace válido de un combo.
     * Nunca hacemos auto-combos con un botón mantenido: exige taps nuevos. */
    captureCommands(f, input) {
        const prev = f.actionPrevInput;
        const pressed = (key) => input[key] && !prev[key];
        let slot = null;
        if (pressed('superBtn') && f.meter >= 100)
            slot = 'SUPER';
        else if (pressed('spUp'))
            slot = 'SP_UP';
        else if (pressed('spForward'))
            slot = 'SP_FORWARD';
        else if (pressed('spNeutral')) {
            const forward = (f.facing === 1 && input.right) || (f.facing === -1 && input.left);
            slot = input.up ? 'SP_UP' : forward ? 'SP_FORWARD' : 'SP_NEUTRAL';
        }
        else if (pressed('heavy'))
            slot = 'HEAVY';
        else if (pressed('light'))
            slot = 'LIGHT';
        if (input.guard)
            f.bufferedActions = [];
        if (slot !== null && !input.guard && !this.roundOver && !this.roundBreakFrames && !this.roundIntroFrames) {
            f.bufferedActions.push({ slot, frame: this.frameCount });
            if (f.bufferedActions.length > 4)
                f.bufferedActions.shift();
        }
        if (pressed('dashLeft'))
            f.bufferedDash = { dir: -1, frame: this.frameCount };
        if (pressed('dashRight'))
            f.bufferedDash = { dir: 1, frame: this.frameCount };
        f.actionPrevInput = { ...input };
        f.bufferedActions = f.bufferedActions.filter((entry) => this.frameCount - entry.frame <= 32);
        if (f.bufferedDash && this.frameCount - f.bufferedDash.frame > 12)
            f.bufferedDash = null;
    }
    /** Eventos desde pantalla táctil, capturados al tocar sin depender de RAF. */
    queueTouchAction(slot) {
        if (this.roundOver || this.roundBreakFrames > 0 || this.roundIntroFrames > 0 || (slot === 'SUPER' && this.p1.meter < 100))
            return;
        this.p1.bufferedActions.push({ slot, frame: this.frameCount });
        if (this.p1.bufferedActions.length > 4)
            this.p1.bufferedActions.shift();
    }
    /** Independent jump press: reliably survives short taps between animation frames. */
    queueTouchJump() {
        if (!this.roundOver && !this.roundBreakFrames && !this.roundIntroFrames)
            this.p1.bufferedJumpFrame = this.frameCount;
    }
    queueTouchDash(dir) {
        if (!this.roundOver && !this.roundBreakFrames && !this.roundIntroFrames)
            this.p1.bufferedDash = { dir, frame: this.frameCount };
    }
    /** Se usa al pausar: nunca debe ejecutarse un golpe almacenado al reanudar. */
    clearBufferedCommands() {
        for (const fighter of [this.p1, this.p2]) {
            fighter.bufferedActions = [];
            fighter.bufferedDash = null;
            fighter.bufferedJumpFrame = null;
        }
    }
    takeCommand(f) {
        while (f.bufferedActions.length) {
            const command = f.bufferedActions.shift();
            if (this.frameCount - command.frame > 32)
                continue;
            if (command.slot === 'SUPER' && f.meter < 100)
                continue;
            return command.slot;
        }
        return null;
    }
    step() {
        this.frameCount++;
        if (this.roundBreakFrames > 0) {
            this.roundBreakFrames--;
            if (this.roundBreakFrames === 0) {
                this.roundNumber++;
                this.resetFighters();
                this.roundIntroFrames = 180; // 3, 2, 1, FIGHT on server and local alike.
                this.announceTimer = 180;
            }
            return;
        }
        if (this.roundIntroFrames > 0) {
            this.announceText = `RONDA ${this.roundNumber} · ${Math.ceil(this.roundIntroFrames / 60)}`;
            this.announceTimer = 10;
            this.roundIntroFrames--;
            if (this.roundIntroFrames === 0) {
                // Held buttons during the countdown must not become phantom attacks.
                this.p1.actionPrevInput = { ...this.p1Input };
                this.p2.actionPrevInput = { ...this.p2Input };
                this.announceText = '¡FIGHT!';
                this.announceTimer = 55;
            }
            return;
        }
        if (this.roundOver)
            return;
        if (this.announceTimer > 0)
            this.announceTimer--;
        if (this.shakeIntensity > 0)
            this.shakeIntensity = Math.max(0, this.shakeIntensity - 0.85);
        // La CPU también mantiene sus órdenes coherentes durante el hitstop.
        if ((this.mode === '1P_VS_CPU' || this.mode === 'CPU_VS_CPU') && !this.roundOver) {
            this.p2Input = this.computeCpuInput(this.p2, this.p1);
        }
        else if (this.mode === 'TRAINING' && !this.roundOver) {
            this.p2Input = this.computeTrainingDummyInput(this.p2, this.p1);
        }
        if (this.mode === 'CPU_VS_CPU' && !this.roundOver) {
            this.p1Input = this.computeCpuInput(this.p1, this.p2);
        }
        this.captureCommands(this.p1, this.p1Input);
        this.captureCommands(this.p2, this.p2Input);
        if (this.superFlashFrames > 0) {
            this.superFlashFrames--;
            this.updateParticles();
            return;
        }
        if (this.hitstopFrames > 0) {
            this.hitstopFrames--;
            this.updateParticles();
            return;
        }
        if (!this.roundOver && this.mode !== 'TRAINING') {
            if (this.roundTimerFrames > 0)
                this.roundTimerFrames--;
            else
                this.finishRoundByTimeout();
        }
        this.updateFighter(this.p1, this.p2, this.p1Input);
        this.updateFighter(this.p2, this.p1, this.p2Input);
        // Solo el muñeco del tutorial: anticipación visible para aprender el timing.
        // No modifica jabs de jugadores, CPU normal ni el servidor online.
        if (this.mode === 'TRAINING' && this.trainingDummyMode === 'TUTORIAL_JABS' &&
            this.p2.currentAttack?.slot === 'LIGHT' && this.p2.stateFrame <= 1) {
            this.p2.currentAttack.startup = 30;
        }
        this.resolveCharacterCollision();
        this.resolveAttackCollisions(this.p1, this.p2);
        this.resolveAttackCollisions(this.p2, this.p1);
        this.updateProjectiles();
        this.updateParticles();
        this.updateAfterimages();
        if (this.mode === 'TRAINING') {
            if (this.p1.hp < this.p1.maxHp && this.p1.comboTimer === 0 && this.p2.comboTimer === 0) {
                this.p1.hp = Math.min(this.p1.maxHp, this.p1.hp + 4);
            }
            if (this.p2.hp < this.p2.maxHp && this.p1.comboTimer === 0 && this.p2.comboTimer === 0) {
                this.p2.hp = Math.min(this.p2.maxHp, this.p2.hp + 4);
            }
            this.p1.meter = 100;
            this.p2.meter = 100;
        }
        this.p1.prevInput = { ...this.p1Input };
        this.p2.prevInput = { ...this.p2Input };
    }
    finishRoundByTimeout() {
        const p1Ratio = this.p1.hp / this.p1.maxHp;
        const p2Ratio = this.p2.hp / this.p2.maxHp;
        const winner = Math.abs(p1Ratio - p2Ratio) < 0.000001 ? null : p1Ratio > p2Ratio ? 0 : 1;
        if (winner !== null)
            (winner === 0 ? this.p1 : this.p2).state = 'VICTORY';
        this.completeRound(winner);
        SoundFX_1.soundFX.koFanfare();
    }
    getWalkSpeed(f) {
        return 3.5 + ((f.profile.stats.speed - 15) / 20) * 3.8;
    }
    getGravity(f) {
        return f.profile.archetype === 'GRAPPLER_TANK' ? 0.78 : 0.68;
    }
    getPowerMultiplier(f) {
        return 0.85 + ((f.profile.stats.power - 15) / 20) * 0.45;
    }
    getMeterGainMultiplier(f) {
        const base = 0.85 + ((f.profile.stats.technique - 15) / 20) * 0.45;
        return f.profile.passiveTrait === 'FAST_METER_GAIN' ? base * 1.4 : base;
    }
    addMeter(f, amount) {
        const nextMeter = f.meter + amount * this.getMeterGainMultiplier(f);
        f.meter = nextMeter >= 99.2 ? 100 : Math.min(100, nextMeter);
    }
    getStageFloorY() {
        return (0, stages_1.getLargeArena)(this.stage)?.floorY ?? exports.FLOOR_Y;
    }
    /** Support is resolved from exact platform TOP edges, never the artwork. */
    supportSurface(f) {
        const arena = (0, stages_1.getLargeArena)(this.stage);
        const floorY = this.getStageFloorY();
        if (Math.abs(f.y - floorY) <= 0.75)
            return 'FLOOR';
        if (!arena || f.dropThroughFrames > 0)
            return null;
        const top = arena.platforms.find(p => f.x >= p.x1 && f.x <= p.x2 && Math.abs(f.y - p.y) <= 0.75);
        return top?.id ?? null;
    }
    isGrounded(f) {
        return f.vy >= 0 && (this.supportSurface(f) !== null ||
            (!(0, stages_1.getLargeArena)(this.stage) && f.y >= exports.FLOOR_Y));
    }
    /**
     * Guilty Gear style ROMAN CANCEL ([E] or SP1+SP2 simultaneous):
     * Costs 50% Super Meter, cancels ANY attack/recovery/dash into neutral stance with a shockwave.
     */
    tryRomanCancel(f, opp, input) {
        const rcPressed = input.romanCancel && !f.prevInput.romanCancel;
        if (!rcPressed || f.meter < 50)
            return false;
        if (f.state !== 'ATTACK' && f.state !== 'DASH')
            return false;
        f.meter -= 50;
        f.currentAttack = null;
        f.hasArmorActive = false;
        f.lightChainCount = 0;
        f.state = this.isGrounded(f) ? 'IDLE' : 'JUMP';
        f.stateFrame = 0;
        f.vx *= 0.25;
        this.hitstopFrames = 5;
        SoundFX_1.soundFX.parry();
        this.shockwaves.push({
            x: f.x,
            y: f.y - 80,
            radius: 16,
            maxRadius: 145,
            color: '#e879f9',
            alpha: 0.9,
        });
        this.addCallout(f.x, f.y - 165, 'ROMAN CANCEL!', '#e879f9');
        // Slight slowdown pushback if opponent is right next to you
        if (Math.abs(opp.x - f.x) < 135 && opp.state === 'HURT') {
            opp.hitstunFrames += 10;
        }
        return true;
    }
    updateFighter(f, opp, input) {
        f.stateFrame++;
        if (f.invincibleFrames > 0)
            f.invincibleFrames--;
        if (f.comboTimer > 0) {
            f.comboTimer--;
            if (f.comboTimer === 0) {
                f.comboCount = 0;
                f.comboDamage = 0;
                f.damageScaling = 1;
            }
        }
        const grounded = this.isGrounded(f);
        if (f.projectileCooldownFrames > 0)
            f.projectileCooldownFrames--;
        if (f.dropThroughFrames > 0)
            f.dropThroughFrames--;
        if (input.guard) {
            f.bufferedActions = [];
            f.bufferedDash = null;
        }
        if (grounded &&
            !this.roundOver &&
            (f.state === 'IDLE' ||
                f.state === 'CROUCH' ||
                f.state === 'WALK_FWD' ||
                f.state === 'WALK_BACK' ||
                f.state === 'BLOCK_STAND' ||
                f.state === 'BLOCK_CROUCH')) {
            f.facing = opp.x >= f.x ? 1 : -1;
        }
        // La guardia se activa con SU botón, independientemente del movimiento.
        const holdingCrouch = input.down;
        if (input.guard && !f.prevInput.guard)
            f.blockPressFrame = this.frameCount;
        if (this.roundOver) {
            this.applyPhysics(f);
            return;
        }
        // Handle being physically hoisted & slammed by a Command Grab / Omega Suplex!
        if (f.grabbedBy !== null) {
            const grabber = f.grabbedBy === 0 ? this.p1 : this.p2;
            f.grabSlamTimer++;
            if (f.grabSlamTimer < 16) {
                // Hoisted high above grabber's head!
                f.x = grabber.x + grabber.facing * 12;
                f.y = grabber.y - Math.round(135 * grabber.scale) - Math.sin((f.grabSlamTimer / 16) * Math.PI) * 55;
                f.vx = 0;
                f.vy = 0;
                return;
            }
            else {
                // Slam straight into the canvas floor!
                f.grabbedBy = null;
                f.grabSlamTimer = 0;
                f.x = Math.max(WALL_MARGIN, Math.min(exports.STAGE_WIDTH - WALL_MARGIN, grabber.x + grabber.facing * 58));
                f.y = this.getStageFloorY() - 4;
                f.vy = -9.5;
                f.vx = grabber.facing * 7.5;
                f.state = 'KNOCKDOWN';
                f.stateFrame = 0;
                this.shakeIntensity = 18;
                SoundFX_1.soundFX.commandGrab();
                this.shockwaves.push({
                    x: f.x,
                    y: this.getStageFloorY() - 8,
                    radius: 14,
                    maxRadius: 155,
                    color: '#facc15',
                    alpha: 1.0,
                });
                this.spawnHitSparks(f.x, this.getStageFloorY() - 12, '#facc15', 26);
                return;
            }
        }
        // Roman Cancel available during any Attack or Dash!
        if (this.tryRomanCancel(f, opp, input)) {
            this.applyPhysics(f);
            return;
        }
        if (f.state === 'HURT') {
            f.hitstunFrames--;
            this.applyPhysics(f);
            if (f.hitstunFrames <= 0 && grounded) {
                f.state = 'IDLE';
                f.stateFrame = 0;
            }
            return;
        }
        if (f.state === 'KNOCKDOWN') {
            this.applyPhysics(f);
            if (grounded && f.stateFrame > 34) {
                f.state = 'IDLE';
                f.stateFrame = 0;
                f.invincibleFrames = 14;
            }
            return;
        }
        if ((f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH') && f.blockstunFrames > 0) {
            f.blockstunFrames--;
            this.applyPhysics(f);
            if (f.blockstunFrames <= 0) {
                f.state = input.guard ? (holdingCrouch ? 'BLOCK_CROUCH' : 'BLOCK_STAND') : holdingCrouch ? 'CROUCH' : 'IDLE';
                f.stateFrame = 0;
            }
            return;
        }
        // Active Attack & Gatling / Special Cancel System
        if (f.state === 'ATTACK' && f.currentAttack) {
            this.processAttackMotion(f, opp);
            // Anima al menos el arranque + 2 fotogramas antes del siguiente golpe.
            // El input anticipado no se pierde: permanece en la cola hasta poder enlazar.
            if (f.currentAttack.hasHit && f.stateFrame >= f.currentAttack.startup + 2) {
                if (this.tryCancelAttack(f, opp))
                    return;
            }
            const totalFrames = f.currentAttack.startup + f.currentAttack.active + f.currentAttack.recovery;
            this.applyPhysics(f);
            if (f.stateFrame >= totalFrames) {
                f.currentAttack = null;
                f.hasArmorActive = false;
                f.lightChainCount = 0;
                f.state = grounded ? 'IDLE' : 'JUMP';
                f.stateFrame = 0;
            }
            return;
        }
        // Dash State
        if (f.state === 'DASH' && !input.guard) {
            if (f.stateFrame % 3 === 0) {
                this.afterimages.push({
                    x: f.x,
                    y: f.y,
                    cell: grounded ? 2 : 4,
                    facing: f.facing,
                    alpha: 0.45,
                    tint: f.profile.moveset.specialNeutral.primaryHex,
                });
            }
            this.applyPhysics(f);
            if (f.stateFrame >= 12) {
                f.vx *= 0.45;
                f.state = grounded ? 'IDLE' : 'JUMP';
                f.stateFrame = 0;
            }
            return;
        }
        // Check Attack Inputs
        if (!input.guard && this.tryStartAttack(f, opp, input)) {
            return;
        }
        // Flick horizontal táctil (con buffer corto) o doble tap de teclado.
        if (f.bufferedDash && !input.guard) {
            const dash = f.bufferedDash;
            f.bufferedDash = null;
            if (grounded || (f.profile.passiveTrait === 'AIR_DASH' && !f.airDashUsed)) {
                this.triggerDash(f, dash.dir, !grounded);
                return;
            }
        }
        // Double-Tap Dash & Air-Dash
        const leftPressed = input.left && !f.prevInput.left;
        const rightPressed = input.right && !f.prevInput.right;
        if (leftPressed && !input.guard) {
            if (this.frameCount - f.lastTapLeftFrame <= 14) {
                if (grounded || (f.profile.passiveTrait === 'AIR_DASH' && !f.airDashUsed)) {
                    this.triggerDash(f, -1, !grounded);
                    return;
                }
            }
            f.lastTapLeftFrame = this.frameCount;
        }
        if (rightPressed && !input.guard) {
            if (this.frameCount - f.lastTapRightFrame <= 14) {
                if (grounded || (f.profile.passiveTrait === 'AIR_DASH' && !f.airDashUsed)) {
                    this.triggerDash(f, 1, !grounded);
                    return;
                }
            }
            f.lastTapRightFrame = this.frameCount;
        }
        // Jump & Double Jump
        const upPressed = input.up && !f.prevInput.up;
        const queuedJump = f.bufferedJumpFrame !== null && this.frameCount - f.bufferedJumpFrame <= 14;
        // V32: only a NEW straight-down direction (no horizontal component) drops
        // through a one-way platform. Diagonal down-left/down-right NEVER drops.
        // Comparing the pure-down state also detects a diagonal -> straight-down
        // transition without requiring the player to release the joystick first.
        const pureDown = input.down && !input.left && !input.right;
        const prevPureDown = f.prevInput.down && !f.prevInput.left && !f.prevInput.right;
        if (!input.guard && pureDown && !prevPureDown && grounded &&
            this.supportSurface(f) !== 'FLOOR' && (0, stages_1.getLargeArena)(this.stage)) {
            f.bufferedJumpFrame = null;
            f.dropThroughFrames = 18;
            f.y += 3;
            f.vy = 2;
            f.state = 'JUMP';
            f.stateFrame = 0;
            this.spawnDust(f.x, f.y, 3);
        }
        else if (!input.guard && (upPressed || queuedJump) && f.jumpsRemaining > 0 && !pureDown) {
            f.bufferedJumpFrame = null;
            // A little more reach for big multi-tier arenas; even tanks can reach the first tier.
            const stageJump = (0, stages_1.getLargeArena)(this.stage) ? 1.22 : 1;
            f.vy = (f.profile.archetype === 'GRAPPLER_TANK' ? -13.2 : -14.8) * stageJump;
            f.y -= 2;
            f.jumpsRemaining--;
            f.state = 'JUMP';
            f.stateFrame = 0;
            SoundFX_1.soundFX.jump();
            this.spawnDust(f.x, f.y, 6);
        }
        if (f.bufferedJumpFrame !== null && this.frameCount - f.bufferedJumpFrame > 14)
            f.bufferedJumpFrame = null;
        // Horizontal & Crouch Movement
        const walkSpd = this.getWalkSpeed(f);
        if (grounded) {
            if (holdingCrouch) {
                f.vx = 0;
                f.state = input.guard ? 'BLOCK_CROUCH' : 'CROUCH';
            }
            else if (input.left !== input.right) {
                const dir = input.left ? -1 : 1;
                // Puedes caminar tanto hacia el rival como hacia atrás CON la guardia levantada.
                f.vx = dir * walkSpd * (input.guard ? 0.57 : (dir === f.facing ? 1 : 0.82));
                f.state = input.guard ? 'BLOCK_STAND' : dir === f.facing ? 'WALK_FWD' : 'WALK_BACK';
            }
            else {
                f.vx = 0;
                f.state = input.guard ? 'BLOCK_STAND' : 'IDLE';
            }
        }
        else {
            if (input.left && !input.right) {
                f.vx = Math.max(-walkSpd * 0.95, f.vx - 0.55);
            }
            else if (input.right && !input.left) {
                f.vx = Math.min(walkSpd * 0.95, f.vx + 0.55);
            }
            f.state = 'JUMP';
        }
        this.applyPhysics(f);
    }
    triggerDash(f, dir, isAir) {
        f.state = 'DASH';
        f.stateFrame = 0;
        const speedBonus = this.getWalkSpeed(f) * 2.15;
        f.vx = dir * speedBonus;
        if (isAir) {
            f.vy = -1.5;
            f.airDashUsed = true;
        }
        SoundFX_1.soundFX.dash();
        this.spawnDust(f.x, f.y, 7);
    }
    applyPhysics(f) {
        const arena = (0, stages_1.getLargeArena)(this.stage);
        if (arena) {
            const wasSupported = this.isGrounded(f);
            const prevY = f.y;
            f.x = Math.max(WALL_MARGIN, Math.min(exports.STAGE_WIDTH - WALL_MARGIN, f.x + f.vx));
            f.y += f.vy;
            // Descending feet can land on the *top* of the first one-way surface crossed.
            // Ascending feet never collide with an underside or side of a platform.
            const candidates = [
                ...arena.platforms.filter(p => f.dropThroughFrames === 0),
                { id: 'FLOOR', x1: 0, x2: exports.STAGE_WIDTH, y: arena.floorY },
            ];
            const landing = f.vy >= 0
                ? candidates.filter(p => f.x >= p.x1 && f.x <= p.x2 &&
                    (p.id === 'FLOOR' || prevY <= p.y + 0.75) && f.y >= p.y - 0.75)
                    .sort((a, b) => a.y - b.y)[0]
                : undefined;
            if (landing) {
                f.y = landing.y;
                f.vy = 0;
                if (!wasSupported) {
                    f.jumpsRemaining = f.profile.passiveTrait === 'DOUBLE_JUMP' ? 2 : 1;
                    f.airDashUsed = false;
                    this.spawnDust(f.x, f.y, 5);
                    if (f.state === 'JUMP') {
                        f.state = 'IDLE';
                        f.stateFrame = 0;
                    }
                }
            }
            else {
                f.vy += this.getGravity(f);
            }
            if (this.isGrounded(f) && !['WALK_FWD', 'BLOCK_STAND', 'BLOCK_CROUCH', 'DASH'].includes(f.state)) {
                f.vx *= 0.82;
                if (Math.abs(f.vx) < 0.15)
                    f.vx = 0;
            }
            return;
        }
        // Preserve original arena physics byte-for-byte for the five classic maps.
        const wasAirborne = f.y < exports.FLOOR_Y;
        f.x += f.vx;
        f.y += f.vy;
        if (f.y < exports.FLOOR_Y) {
            f.vy += this.getGravity(f);
        }
        else {
            f.y = exports.FLOOR_Y;
            f.vy = 0;
            if (wasAirborne) {
                f.jumpsRemaining = f.profile.passiveTrait === 'DOUBLE_JUMP' ? 2 : 1;
                f.airDashUsed = false;
                this.spawnDust(f.x, exports.FLOOR_Y, 5);
                if (f.state === 'JUMP') {
                    f.state = 'IDLE';
                    f.stateFrame = 0;
                }
            }
        }
        if (f.y >= exports.FLOOR_Y && f.state !== 'WALK_FWD' && f.state !== 'BLOCK_STAND' &&
            f.state !== 'BLOCK_CROUCH' && f.state !== 'DASH') {
            f.vx *= 0.82;
            if (Math.abs(f.vx) < 0.15)
                f.vx = 0;
        }
        f.x = Math.max(WALL_MARGIN, Math.min(exports.STAGE_WIDTH - WALL_MARGIN, f.x));
    }
    resolveCharacterCollision() {
        const minDist = (this.p1.hurtbox.width + this.p2.hurtbox.width) * 0.42;
        const dx = this.p2.x - this.p1.x;
        const dy = Math.abs(this.p2.y - this.p1.y);
        if (Math.abs(dx) < minDist && dy < 95) {
            const overlap = (minDist - Math.abs(dx)) / 2;
            const pushDir = dx >= 0 ? 1 : -1;
            this.p1.x = Math.max(WALL_MARGIN, this.p1.x - pushDir * overlap);
            this.p2.x = Math.min(exports.STAGE_WIDTH - WALL_MARGIN, this.p2.x + pushDir * overlap);
        }
    }
    /** Gatling intuitivo: GOLPE → GOLPE → REMATE, luego TÉCNICA.
     * Los ataques cancelan únicamente al confirmar impacto/bloqueo.
     * Un SUPER al 100% también puede cancelar un ataque o una técnica. */
    tryCancelAttack(f, opp) {
        if (!f.currentAttack || !f.bufferedActions.length)
            return false;
        const current = f.currentAttack.slot;
        const command = f.bufferedActions[0];
        if (this.frameCount - command.frame > 32) {
            f.bufferedActions.shift();
            return false;
        }
        const next = command.slot;
        if (next === 'SUPER' && f.meter >= 100 && current !== 'SUPER') {
            f.bufferedActions.shift();
            this.startMove(f, opp, 'SUPER');
            return true;
        }
        if (current === 'LIGHT' || current === 'HEAVY' || current === 'LOW' || current === 'RUSH') {
            if (next === 'SP_UP' || next === 'SP_FORWARD' || next === 'SP_NEUTRAL') {
                if (next === 'SP_NEUTRAL' &&
                    (f.projectileCooldownFrames > 0 ||
                        (f.profile.moveset.specialNeutral.mechanic !== 'SHORT_SHOTGUN_BLAST' && this.projectiles.some(p => p.ownerIndex === f.index)))) {
                    f.bufferedActions.shift();
                    return false;
                }
                f.bufferedActions.shift();
                this.startMove(f, opp, next);
                return true;
            }
        }
        // Gatlings: opener de avance > jab > jab > remate, o jab > bajo/fuerte > técnica.
        // La dirección modifica el remate sin añadir botones permanentes.
        if ((current === 'LIGHT' || current === 'RUSH') &&
            (next === 'LIGHT' || next === 'HEAVY' || next === 'LOW' || next === 'RUSH')) {
            f.bufferedActions.shift();
            const resolved = next === 'LIGHT' && f.lightChainCount >= 2 ? 'HEAVY'
                : next === 'RUSH' ? 'LIGHT' : next;
            this.startMove(f, opp, resolved);
            return true;
        }
        return false;
    }
    tryStartAttack(f, opp, _input) {
        const next = this.takeCommand(f);
        if (!next)
            return false;
        if (next === 'SP_NEUTRAL' &&
            (f.projectileCooldownFrames > 0 ||
                (f.profile.moveset.specialNeutral.mechanic !== 'SHORT_SHOTGUN_BLAST' && this.projectiles.some(p => p.ownerIndex === f.index))))
            return false;
        if (next === 'LIGHT' || next === 'RUSH' || next === 'LOW')
            f.lightChainCount = 0;
        this.startMove(f, opp, next);
        return true;
    }
    startMove(f, opp, slot) {
        f.facing = opp.x >= f.x ? 1 : -1;
        f.state = 'ATTACK';
        f.stateFrame = 0;
        f.hasArmorActive = false;
        const pwr = this.getPowerMultiplier(f);
        const techBonus = Math.floor((f.profile.stats.technique - 15) / 7);
        const reachBonus = f.profile.passiveTrait === 'LONG_REACH_LIMBS' ? 28 : 0;
        const isTank = f.profile.archetype === 'GRAPPLER_TANK';
        const hasHeavyArmorPassive = f.profile.passiveTrait === 'HEAVY_ARMOR_STARTUP';
        const grounded = this.isGrounded(f);
        if (slot === 'LIGHT') {
            f.lightChainCount++;
            const style = f.profile.moveset.lightNormal.style;
            const isLow = style === 'LOW_KICK';
            f.currentAttack = {
                slot: 'LIGHT',
                name: f.profile.moveset.lightNormal.name,
                mechanic: style,
                startup: isTank ? 5 : 3,
                active: 4,
                recovery: Math.max(5, (isTank ? 9 : 7) - techBonus),
                damage: Math.round((isTank ? 44 : 34) * pwr),
                hitstun: 13,
                blockstun: 9,
                pushback: 3.4,
                launchY: 0,
                knockdown: false,
                isGrab: false,
                height: !grounded ? 'OVERHEAD' : isLow ? 'LOW' : 'MID',
                hasArmor: false,
                invincible: false,
                hitbox: {
                    offsetX: 28,
                    offsetY: isLow ? -34 : -96,
                    width: 68 + reachBonus,
                    height: 36,
                },
                hasHit: false,
            };
            f.vx = f.facing * 3.4;
            SoundFX_1.soundFX.whiff();
        }
        else if (slot === 'RUSH') {
            // Avance + A: apertura ofensiva con mayor alcance, enlazable al jab.
            f.lightChainCount = 0;
            f.currentAttack = {
                slot: 'RUSH', name: 'PASO + GOLPE', mechanic: 'DASH_PUNCH',
                startup: isTank ? 8 : 5, active: 5, recovery: 9,
                damage: Math.round(48 * pwr), hitstun: 19, blockstun: 11,
                pushback: 3.2, launchY: 0, knockdown: false, isGrab: false,
                height: grounded ? 'MID' : 'OVERHEAD', hasArmor: false, invincible: false,
                hitbox: { offsetX: 34, offsetY: -105, width: 105 + reachBonus, height: 54 },
                hasHit: false,
            };
            f.vx = f.facing * (this.getWalkSpeed(f) * 1.9);
            SoundFX_1.soundFX.whiff();
        }
        else if (slot === 'LOW') {
            // Abajo + A: alternativa baja para mezclar guardias y continuar hacia B.
            f.currentAttack = {
                slot: 'LOW', name: 'GOLPE BAJO', mechanic: 'LOW_KICK',
                startup: 5, active: 5, recovery: 10,
                damage: Math.round(55 * pwr), hitstun: 19, blockstun: 12,
                pushback: 3.6, launchY: 0, knockdown: false, isGrab: false,
                height: 'LOW', hasArmor: false, invincible: false,
                hitbox: { offsetX: 30, offsetY: -38, width: 90 + reachBonus, height: 36 },
                hasHit: false,
            };
            f.vx = f.facing * 2.8;
            SoundFX_1.soundFX.whiff();
        }
        else if (slot === 'HEAVY') {
            const style = f.profile.moveset.heavyNormal.style;
            f.hasArmorActive = hasHeavyArmorPassive;
            const height = !grounded || style === 'OVERHEAD_SMASH'
                ? 'OVERHEAD'
                : style === 'SWEEP_TRIP'
                    ? 'LOW'
                    : 'MID';
            f.currentAttack = {
                slot: 'HEAVY',
                name: f.profile.moveset.heavyNormal.name,
                mechanic: style,
                startup: isTank ? 10 : 7,
                active: 6,
                recovery: Math.max(10, (isTank ? 17 : 14) - techBonus),
                damage: Math.round((isTank ? 94 : 78) * pwr),
                hitstun: 22,
                blockstun: 14,
                pushback: 9,
                launchY: style === 'LAUNCHER_UPPER' ? -14.2 : 0,
                knockdown: style === 'SWEEP_TRIP' || style === 'OVERHEAD_SMASH',
                isGrab: false,
                height,
                hasArmor: hasHeavyArmorPassive,
                invincible: false,
                hitbox: {
                    offsetX: 30,
                    offsetY: style === 'SWEEP_TRIP' ? -32 : -112,
                    width: 88 + reachBonus,
                    height: 54,
                },
                hasHit: false,
            };
            f.vx = f.facing * 4.2;
            SoundFX_1.soundFX.whiff();
        }
        else if (slot === 'SP_NEUTRAL') {
            const mech = f.profile.moveset.specialNeutral.mechanic;
            const isShotgun = mech === 'SHORT_SHOTGUN_BLAST';
            f.currentAttack = {
                slot: 'SP_NEUTRAL',
                name: f.profile.moveset.specialNeutral.name,
                mechanic: mech,
                startup: isShotgun ? 7 : 9,
                active: isShotgun ? 8 : 6,
                recovery: Math.max(11, 16 - techBonus),
                damage: Math.round((isShotgun ? 95 : 70) * pwr),
                hitstun: 19,
                blockstun: 14,
                pushback: isShotgun ? 14 : 8,
                launchY: isShotgun ? -9 : 0,
                knockdown: isShotgun,
                isGrab: false,
                height: mech === 'GROUND_SHOCKWAVE' ? 'LOW' : 'MID',
                hasArmor: hasHeavyArmorPassive,
                invincible: false,
                hitbox: isShotgun
                    ? { offsetX: 28, offsetY: -120, width: 145 + reachBonus, height: 92 }
                    : null,
                hasHit: false,
            };
            f.vx = -f.facing * 1.5;
        }
        else if (slot === 'SP_FORWARD') {
            const mech = f.profile.moveset.specialForward.mechanic;
            const isGrab = mech === 'COMMAND_GRAB_SLAM';
            const isArmored = mech === 'ARMORED_SHOULDER_DASH' || hasHeavyArmorPassive;
            const isSpin = mech === 'SPINNING_ADVANCE';
            const isTeleport = mech === 'TELEPORT_BEHIND';
            f.hasArmorActive = isArmored;
            if (isTeleport) {
                this.spawnHitSparks(f.x, f.y - 75, '#a855f7', 16);
                f.x = Math.max(WALL_MARGIN + 20, Math.min(exports.STAGE_WIDTH - WALL_MARGIN - 20, opp.x + opp.facing * -72));
                f.facing = opp.x >= f.x ? 1 : -1;
                this.spawnHitSparks(f.x, f.y - 75, '#a855f7', 16);
                SoundFX_1.soundFX.dash();
            }
            f.currentAttack = {
                slot: 'SP_FORWARD',
                name: f.profile.moveset.specialForward.name,
                mechanic: mech,
                startup: isGrab ? 7 : isTeleport ? 6 : 8,
                active: isGrab ? 6 : isSpin ? 16 : 12,
                recovery: Math.max(12, 18 - techBonus),
                damage: Math.round((isGrab ? 132 : isSpin ? 105 : 90) * pwr),
                hitstun: 22,
                blockstun: 15,
                pushback: isGrab ? 12 : 9,
                launchY: isGrab ? -12.5 : 0,
                knockdown: true,
                isGrab,
                height: mech === 'SLIDE_LOW_KICK' ? 'LOW' : isTeleport ? 'OVERHEAD' : 'MID',
                hasArmor: isArmored,
                invincible: isTeleport,
                hitbox: {
                    offsetX: isGrab ? 22 : 26,
                    offsetY: mech === 'SLIDE_LOW_KICK' ? -36 : -114,
                    width: isGrab ? 74 + reachBonus : 84 + reachBonus,
                    height: mech === 'SLIDE_LOW_KICK' ? 36 : 88,
                },
                hasHit: false,
                multiHitInterval: isSpin ? 4 : undefined,
            };
        }
        else if (slot === 'SP_UP') {
            const mech = f.profile.moveset.specialUp.mechanic;
            const isInvincible = mech === 'INVINCIBLE_UPPERCUT';
            const isDive = mech === 'DIVE_KICK_FROM_AIR';
            const isTornado = mech === 'VERTICAL_TORNADO';
            const isStomp = mech === 'HIGH_LEAP_STOMP';
            if (isInvincible)
                f.invincibleFrames = 15;
            f.hasArmorActive = hasHeavyArmorPassive;
            f.currentAttack = {
                slot: 'SP_UP',
                name: f.profile.moveset.specialUp.name,
                mechanic: mech,
                startup: isDive ? 4 : 5,
                active: isDive ? 18 : 14,
                recovery: Math.max(13, 19 - techBonus),
                damage: Math.round((isStomp ? 112 : 98) * pwr),
                hitstun: 24,
                blockstun: 15,
                pushback: 7,
                launchY: isDive ? 0 : -14.8,
                knockdown: true,
                isGrab: false,
                height: isDive || isStomp ? 'OVERHEAD' : 'MID',
                hasArmor: hasHeavyArmorPassive,
                invincible: isInvincible,
                hitbox: {
                    offsetX: isTornado ? -10 : 18,
                    offsetY: isDive ? -95 : -150,
                    width: (isTornado ? 110 : 82) + reachBonus,
                    height: isDive ? 95 : 130,
                },
                hasHit: false,
                multiHitInterval: isTornado ? 4 : undefined,
            };
            if (isDive) {
                if (grounded) {
                    // Hop up quickly then dive
                    f.y -= 48;
                }
                f.vx = f.facing * 11.5;
                f.vy = 12.5;
            }
            else if (isTornado) {
                f.vx = f.facing * 2.2;
                f.vy = -8.5;
                f.y -= 4;
            }
            else {
                f.vy = -14.5;
                f.y -= 4;
                f.vx = f.facing * (isStomp ? 7.2 : 3.2);
            }
            SoundFX_1.soundFX.jump();
        }
        else if (slot === 'SUPER') {
            f.meter = 0;
            f.invincibleFrames = 38;
            this.superFlashFrames = 26;
            this.superFlashOwner = f.index;
            this.shakeIntensity = 12;
            SoundFX_1.soundFX.superFlash();
            this.spawnHitSparks(f.x, f.y - 90, '#facc15', 30);
            this.addCallout(f.x, f.y - 175, '★ ' + f.profile.moveset.ultimateSuper.name + ' ★', '#facc15');
            const mech = f.profile.moveset.ultimateSuper.mechanic;
            if (mech === 'METEOR_SCREEN_DROP') {
                f.y = Math.max(140, opp.y - 190);
                f.x = opp.x;
                f.vy = 15;
                for (let m = 0; m < 4; m++) {
                    this.meteors.push({
                        x: opp.x - 140 + m * 95 - f.facing * 90,
                        y: -60 - m * 95,
                        vx: f.facing * 4.5,
                        vy: 15 + m * 1.5,
                        color: f.profile.moveset.specialNeutral.primaryHex || '#a855f7',
                        size: 38 + (m % 2) * 12,
                    });
                }
            }
            else if (mech === 'OMEGA_SUPLEX' && Math.abs(opp.x - f.x) < 195) {
                f.x = opp.x - f.facing * 50;
            }
            f.currentAttack = {
                slot: 'SUPER',
                name: f.profile.moveset.ultimateSuper.name,
                mechanic: mech,
                startup: 4,
                active: 32,
                recovery: 16,
                damage: Math.round(265 * pwr),
                hitstun: 32,
                blockstun: 22,
                pushback: 15,
                launchY: -15.5,
                knockdown: true,
                isGrab: mech === 'OMEGA_SUPLEX',
                height: mech === 'METEOR_SCREEN_DROP' ? 'OVERHEAD' : 'MID',
                hasArmor: true,
                invincible: true,
                hitbox: mech === 'GIANT_BEAM_LASER'
                    ? { offsetX: 24, offsetY: -145, width: 660, height: 120 }
                    : mech === 'METEOR_SCREEN_DROP'
                        ? { offsetX: -130, offsetY: -180, width: 260, height: 195 }
                        : { offsetX: 16, offsetY: -145, width: 175, height: 135 },
                hasHit: false,
                multiHitInterval: mech === 'MULTI_HIT_RUSH_COMBO' || mech === 'GIANT_BEAM_LASER' ? 4 : undefined,
            };
        }
        const arenaScale = (0, stages_1.getLargeArena)(this.stage)?.fighterScale ?? 1;
        if (arenaScale !== 1 && f.currentAttack?.hitbox) {
            const hitbox = f.currentAttack.hitbox;
            f.currentAttack.hitbox = {
                offsetX: Math.round(hitbox.offsetX * arenaScale),
                offsetY: Math.round(hitbox.offsetY * arenaScale),
                width: Math.round(hitbox.width * (slot === 'SUPER' && f.currentAttack.mechanic === 'GIANT_BEAM_LASER' ? 1 : arenaScale)),
                height: Math.round(hitbox.height * arenaScale),
            };
        }
    }
    processAttackMotion(f, opp) {
        const atk = f.currentAttack;
        if (!atk)
            return;
        if (atk.slot === 'SP_NEUTRAL' && f.stateFrame === atk.startup) {
            this.spawnSpecialProjectile(f);
        }
        if (atk.slot === 'SP_FORWARD' &&
            f.stateFrame >= atk.startup &&
            f.stateFrame <= atk.startup + atk.active) {
            if (atk.mechanic === 'SLIDE_LOW_KICK') {
                f.vx = f.facing * 11.2;
            }
            else if (atk.mechanic === 'ARMORED_SHOULDER_DASH' || atk.mechanic === 'SPINNING_ADVANCE') {
                f.vx = f.facing * 9.2;
            }
            else if (atk.mechanic === 'COMMAND_GRAB_SLAM') {
                f.vx = f.facing * 6.8;
            }
            if (f.stateFrame % 3 === 0) {
                this.afterimages.push({
                    x: f.x,
                    y: f.y,
                    cell: f.profile.spriteSheetLayoutVersion === 2 ? 11 : 9,
                    facing: f.facing,
                    alpha: 0.45,
                    tint: f.profile.moveset.specialNeutral.primaryHex,
                });
            }
        }
        if (atk.slot === 'SUPER' &&
            f.stateFrame >= atk.startup &&
            f.stateFrame <= atk.startup + atk.active) {
            if (atk.mechanic === 'MULTI_HIT_RUSH_COMBO' || atk.mechanic === 'OMEGA_SUPLEX') {
                f.vx = f.facing * 10.2;
            }
            else if (atk.mechanic === 'METEOR_SCREEN_DROP') {
                f.x += (opp.x - f.x) * 0.16;
            }
            if (f.stateFrame % 2 === 0) {
                this.afterimages.push({
                    x: f.x,
                    y: f.y,
                    cell: f.profile.spriteSheetLayoutVersion === 2 ? 13 : 11,
                    facing: f.facing,
                    alpha: 0.55,
                    tint: '#facc15',
                });
            }
        }
    }
    spawnSpecialProjectile(f) {
        const sp = f.profile.moveset.specialNeutral;
        const mech = sp.mechanic;
        if (f.projectileCooldownFrames > 0 || (mech !== 'SHORT_SHOTGUN_BLAST' &&
            this.projectiles.some(p => p.ownerIndex === f.index)))
            return;
        if (mech === 'SHORT_SHOTGUN_BLAST') {
            f.projectileCooldownFrames = 45; // ráfaga corta también necesita descanso
            SoundFX_1.soundFX.heavyHit();
            this.shockwaves.push({
                x: f.x + f.facing * 45,
                y: f.y - 78,
                radius: 14,
                maxRadius: 115,
                color: sp.primaryHex,
                alpha: 0.9,
            });
            this.spawnHitSparks(f.x + f.facing * 95, f.y - 78, sp.primaryHex, 22);
            return;
        }
        f.projectileCooldownFrames = 70; // ~1,17 s a 60 FPS; las minas también ocupan un único hueco.
        SoundFX_1.soundFX.projectile();
        const pwr = this.getPowerMultiplier(f);
        const stageScale = (0, stages_1.getLargeArena)(this.stage)?.fighterScale ?? 1;
        const spawnX = f.x + f.facing * 52 * stageScale;
        const spawnY = mech === 'GROUND_SHOCKWAVE'
            ? this.getStageFloorY() - 22 * stageScale
            : mech === 'TRAP_MINE_DROP'
                ? this.getStageFloorY() - 46 * stageScale
                : f.y - 84 * stageScale;
        let vx = f.facing * 8.6;
        let vy = 0;
        let ttl = 115;
        let height = 'MID';
        let bouncesLeft = 0;
        if (mech === 'ARCING_LOB_OBJECT') {
            vx = f.facing * 6.8;
            vy = -10.8;
            height = 'OVERHEAD';
            bouncesLeft = 2;
            ttl = 150;
        }
        else if (mech === 'GROUND_SHOCKWAVE') {
            vx = f.facing * 8.0;
            height = 'LOW';
        }
        else if (mech === 'BOOMERANG_RETURN') {
            vx = f.facing * 9.8;
            ttl = 105;
        }
        else if (mech === 'TRAP_MINE_DROP') {
            vx = f.facing * 3.8;
            ttl = 300;
        }
        this.projectiles.push({
            id: this.nextProjId++,
            ownerIndex: f.index,
            x: spawnX,
            y: spawnY,
            vx,
            vy,
            radius: (mech === 'GROUND_SHOCKWAVE' ? 32 : mech === 'TRAP_MINE_DROP' ? 28 : 24) * stageScale,
            damage: Math.round((mech === 'TRAP_MINE_DROP' ? 88 : 72) * pwr),
            hitstun: 19,
            color: sp.primaryHex,
            mechanic: mech,
            height,
            ttl,
            maxTtl: ttl,
            bouncesLeft,
            armed: mech !== 'TRAP_MINE_DROP',
            spriteSheet: f.spriteSheet,
            useSpriteArt: f.profile.spriteSheetLayoutVersion !== 2 || f.profile.spriteSheetLastCell === 'PROJECTILE',
            facing: f.facing,
        });
    }
    /**
     * High/Low/Overhead Guard Validation:
     * - Standing guard blocks MID and OVERHEAD, but gets hit by LOW!
     * - Crouching guard blocks MID and LOW, but gets hit by OVERHEAD!
     */
    canGuardAttack(defender, defInput, height) {
        if (!this.isGrounded(defender))
            return false;
        if (defender.state === 'ATTACK' || defender.state === 'HURT')
            return false;
        const holdingCrouch = defInput.down;
        if (!defInput.guard)
            return false;
        if (holdingCrouch) {
            // Crouching block beats LOW and MID, loses to OVERHEAD
            return height !== 'OVERHEAD';
        }
        else {
            // Standing back block beats OVERHEAD and MID, loses to LOW
            return height !== 'LOW';
        }
    }
    resolveAttackCollisions(attacker, defender) {
        const atk = attacker.currentAttack;
        if (!atk || !atk.hitbox)
            return;
        const isActive = attacker.stateFrame >= atk.startup && attacker.stateFrame < atk.startup + atk.active;
        if (!isActive)
            return;
        if (atk.hasHit) {
            if (!atk.multiHitInterval)
                return;
            if (atk.lastHitFrame !== undefined &&
                attacker.stateFrame - atk.lastHitFrame < atk.multiHitInterval) {
                return;
            }
        }
        if (defender.invincibleFrames > 0 || defender.state === 'KNOCKDOWN' || defender.state === 'KO') {
            return;
        }
        const hbX = attacker.facing === 1
            ? attacker.x + atk.hitbox.offsetX
            : attacker.x - atk.hitbox.offsetX - atk.hitbox.width;
        const hbY = attacker.y + atk.hitbox.offsetY;
        const hbW = atk.hitbox.width;
        const hbH = atk.hitbox.height;
        const defX = defender.x - defender.hurtbox.width / 2;
        const defY = defender.y - defender.hurtbox.height;
        const defW = defender.hurtbox.width;
        const defH = defender.hurtbox.height;
        const intersects = hbX < defX + defW &&
            hbX + hbW > defX &&
            hbY < defY + defH &&
            hbY + hbH > defY;
        if (!intersects)
            return;
        // Check Counter Hit (hit defender during their own attack startup frames!)
        const isCounterHit = defender.state === 'ATTACK' &&
            defender.currentAttack !== null &&
            defender.stateFrame < defender.currentAttack.startup;
        atk.hasHit = true;
        atk.lastHitFrame = attacker.stateFrame;
        atk.hitCountDone = (atk.hitCountDone || 0) + 1;
        const hitX = (Math.max(hbX, defX) + Math.min(hbX + hbW, defX + defW)) / 2;
        const hitY = (Math.max(hbY, defY) + Math.min(hbY + hbH, defY + defH)) / 2;
        const defInput = defender.index === 0 ? this.p1Input : this.p2Input;
        const validGuard = !atk.isGrab && this.canGuardAttack(defender, defInput, atk.height);
        // Parry de jab: pulsar GUARDIA justo antes del contacto (5 fotogramas).
        // Interrumpe el jab y deja espacio para que el defensor pueda responder.
        if (atk.slot === 'LIGHT' && validGuard && this.frameCount - defender.blockPressFrame <= 4) {
            SoundFX_1.soundFX.parry();
            this.hitstopFrames = 5;
            defender.invincibleFrames = 12;
            defender.state = defInput.down ? 'BLOCK_CROUCH' : 'BLOCK_STAND';
            defender.stateFrame = 0;
            defender.blockstunFrames = 0;
            attacker.currentAttack = null;
            attacker.bufferedActions = [];
            attacker.lightChainCount = 0;
            attacker.state = 'HURT';
            attacker.stateFrame = 0;
            attacker.hitstunFrames = 18;
            attacker.vx = -attacker.facing * 11;
            this.addMeter(defender, 16);
            this.parryBursts.push({ x: hitX, y: hitY, life: 11, facing: defender.facing });
            this.addCallout(defender.x, defender.y - 155, 'PARRY!', '#befaff');
            return;
        }
        // 2. Check Normal Guard (High/Low validated)
        if (validGuard) {
            SoundFX_1.soundFX.block();
            const chipDamage = atk.slot === 'LIGHT' || atk.slot === 'HEAVY' ? 0 : Math.ceil(atk.damage * 0.14);
            defender.hp = Math.max(1, defender.hp - chipDamage);
            defender.state = defInput.down ? 'BLOCK_CROUCH' : 'BLOCK_STAND';
            defender.blockstunFrames = atk.blockstun;
            this.addMeter(attacker, 5);
            this.addMeter(defender, 6);
            this.applyCornerAwarePushback(attacker, defender, atk.pushback * 0.8);
            this.spawnHitSparks(hitX, hitY, '#60a5fa', 10, attacker.facing);
            this.addCallout(defender.x, defender.y - 140, 'GUARD', '#93c5fd');
            return;
        }
        // 3. Check Super Armor on Defender
        if (defender.hasArmorActive && !atk.isGrab && atk.slot !== 'SUPER') {
            defender.hasArmorActive = false;
            const armorDmg = Math.round(atk.damage * 0.65);
            defender.hp = Math.max(1, defender.hp - armorDmg);
            this.hitstopFrames = 4;
            SoundFX_1.soundFX.armorAbsorb();
            this.spawnHitSparks(hitX, hitY, '#facc15', 14, attacker.facing);
            this.addCallout(defender.x, defender.y - 150, 'SUPER ARMOR!', '#facc15');
            return;
        }
        // 4. Clean Hit Connects! (Apply +25% Counter Hit bonus if applicable)
        const rawDamage = atk.multiHitInterval ? Math.round(atk.damage / 5) : atk.damage;
        const counterMult = isCounterHit ? 1.25 : 1.0;
        const scaledDamage = Math.max(8, Math.round(rawDamage * counterMult * attacker.damageScaling));
        defender.hp = Math.max(0, defender.hp - scaledDamage);
        if (isCounterHit && atk.hitCountDone === 1) {
            this.addCallout(defender.x, defender.y - 170, 'COUNTER HIT!', '#fb7185');
        }
        if (attacker.profile.passiveTrait === 'VAMPIRIC_ON_SPECIAL' &&
            (atk.slot === 'SP_NEUTRAL' ||
                atk.slot === 'SP_FORWARD' ||
                atk.slot === 'SP_UP' ||
                atk.slot === 'SUPER')) {
            const heal = Math.round(scaledDamage * 0.25);
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
            this.addCallout(attacker.x, attacker.y - 155, `+${heal} HP`, '#4ade80');
        }
        attacker.comboCount++;
        attacker.comboDamage += scaledDamage;
        attacker.comboTimer = 60;
        attacker.damageScaling = Math.max(0.45, attacker.damageScaling - 0.08);
        this.addMeter(attacker, atk.slot === 'SUPER' ? 0 : 12);
        this.addMeter(defender, 8);
        if (atk.slot === 'SUPER') {
            this.hitstopFrames = 11;
            this.shakeIntensity = 15;
            SoundFX_1.soundFX.heavyHit();
            this.shockwaves.push({
                x: hitX,
                y: hitY,
                radius: 15,
                maxRadius: 150,
                color: '#facc15',
                alpha: 0.9,
            });
        }
        else if (atk.isGrab) {
            this.hitstopFrames = 9;
            this.shakeIntensity = 14;
            SoundFX_1.soundFX.commandGrab();
            this.shockwaves.push({
                x: defender.x,
                y: this.getStageFloorY() - 12,
                radius: 12,
                maxRadius: 130,
                color: '#f43f5e',
                alpha: 0.9,
            });
        }
        else if (atk.slot === 'LIGHT') {
            this.hitstopFrames = 3;
            this.shakeIntensity = 4;
            SoundFX_1.soundFX.lightHit();
        }
        else {
            this.hitstopFrames = 6;
            this.shakeIntensity = 8;
            SoundFX_1.soundFX.heavyHit();
        }
        this.spawnHitSparks(hitX, hitY, atk.slot === 'LIGHT' ? '#fef08a' : atk.slot === 'SUPER' ? '#fcd34d' : '#fb923c', atk.slot === 'LIGHT' ? 10 : atk.slot === 'SUPER' ? 28 : 18, attacker.facing);
        // KO hits get the full contact burst as well as ordinary hits.
        if (defender.hp <= 0) {
            this.triggerKnockout(attacker, defender);
            return;
        }
        if (atk.isGrab) {
            defender.grabbedBy = attacker.index;
            defender.grabSlamTimer = 0;
            defender.state = 'HURT';
            defender.stateFrame = 0;
            if (atk.slot === 'SUPER') {
                // Omega Suplex leaps high into the air together!
                attacker.vy = -15.5;
                attacker.y -= 6;
            }
        }
        else if (atk.knockdown) {
            defender.state = 'KNOCKDOWN';
            defender.stateFrame = 0;
            defender.vy = atk.launchY !== 0 ? atk.launchY : -8.5;
            defender.y -= 2;
            defender.vx = attacker.facing * (atk.pushback * 0.7);
        }
        else {
            defender.state = 'HURT';
            defender.stateFrame = 0;
            const normalPressure = (atk.slot === 'LIGHT' || atk.slot === 'HEAVY' || atk.slot === 'RUSH' || atk.slot === 'LOW') && attacker.comboCount >= 3;
            // El tercer normal puede rematar, pero ya no encierra al rival en hitstun infinito.
            defender.hitstunFrames = normalPressure ? 7 : atk.hitstun + (isCounterHit ? 5 : 0);
            if (atk.slot === 'LIGHT' && attacker.lightChainCount >= 2)
                defender.hitstunFrames = Math.min(defender.hitstunFrames, 9);
            if (atk.launchY !== 0) {
                defender.vy = atk.launchY;
                defender.y -= 2;
            }
            const pressurePush = normalPressure ? atk.pushback + 13 :
                atk.slot === 'LIGHT' && attacker.lightChainCount >= 2 ? atk.pushback + 4 : atk.pushback;
            this.applyCornerAwarePushback(attacker, defender, pressurePush);
            if (normalPressure)
                attacker.vx = -attacker.facing * 4;
        }
        if (atk.slot === 'SUPER' && atk.mechanic === 'MULTI_HIT_RUSH_COMBO') {
            this.crossSlashes.push({
                x: defender.x + (Math.random() - 0.5) * 40,
                y: defender.y - 75 + (Math.random() - 0.5) * 45,
                color: attacker.profile.moveset.specialNeutral.primaryHex || '#ef4444',
                life: 16,
            });
        }
        if (atk.isGrab) {
            this.addCallout(defender.x, defender.y - 150, 'COMMAND GRAB!', '#f43f5e');
        }
    }
    applyCornerAwarePushback(attacker, defender, pushAmount) {
        const dir = attacker.facing;
        const targetX = defender.x + dir * pushAmount * 2.2;
        if (targetX <= WALL_MARGIN + 8 || targetX >= exports.STAGE_WIDTH - WALL_MARGIN - 8) {
            defender.vx = dir * pushAmount * 0.25;
            attacker.vx = -dir * pushAmount * 0.75;
        }
        else {
            defender.vx = dir * pushAmount;
        }
    }
    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.ttl--;
            if (p.mechanic === 'ARCING_LOB_OBJECT') {
                p.vy += 0.48;
                if (p.y >= this.getStageFloorY() - 18) {
                    p.y = this.getStageFloorY() - 18;
                    if ((p.bouncesLeft || 0) > 0) {
                        p.bouncesLeft--;
                        p.vy = -8.5;
                        this.spawnDust(p.x, this.getStageFloorY(), 4);
                    }
                    else {
                        p.vy = -4.5;
                    }
                }
            }
            else if (p.mechanic === 'BOOMERANG_RETURN' && !p.returning && p.ttl === Math.floor(p.maxTtl * 0.52)) {
                p.returning = true;
                p.vx = -p.vx * 1.05;
            }
            else if (p.mechanic === 'TRAP_MINE_DROP') {
                p.vx *= 0.86;
                if (p.maxTtl - p.ttl >= 18) {
                    p.armed = true;
                }
            }
            p.x += p.vx;
            p.y += p.vy;
            if (this.frameCount % 2 === 0) {
                this.particles.push({
                    x: p.x,
                    y: p.y,
                    vx: (Math.random() - 0.5) * 1.8,
                    vy: (Math.random() - 0.5) * 1.8,
                    size: p.mechanic === 'GROUND_SHOCKWAVE' ? 7 : 5,
                    color: p.color,
                    kind: 'energy',
                    life: 10,
                    maxLife: 10,
                });
            }
            if (p.ttl <= 0 || p.x < -50 || p.x > exports.STAGE_WIDTH + 50) {
                this.projectiles.splice(i, 1);
                continue;
            }
            if (!p.armed)
                continue;
            const attacker = p.ownerIndex === 0 ? this.p1 : this.p2;
            const defender = p.ownerIndex === 0 ? this.p2 : this.p1;
            if (defender.invincibleFrames > 0 || defender.state === 'KO' || defender.state === 'KNOCKDOWN') {
                continue;
            }
            const defLeft = defender.x - defender.hurtbox.width / 2;
            const defRight = defender.x + defender.hurtbox.width / 2;
            const defTop = defender.y - defender.hurtbox.height;
            const defBottom = defender.y;
            if (p.x + p.radius > defLeft &&
                p.x - p.radius < defRight &&
                p.y + p.radius > defTop &&
                p.y - p.radius < defBottom) {
                const defInput = defender.index === 0 ? this.p1Input : this.p2Input;
                const validGuard = this.canGuardAttack(defender, defInput, p.height);
                if (validGuard && this.frameCount - defender.blockPressFrame <= 4) {
                    SoundFX_1.soundFX.parry();
                    this.addMeter(defender, 15);
                    this.parryBursts.push({ x: p.x, y: p.y, life: 11, facing: defender.facing });
                    this.addCallout(defender.x, defender.y - 150, 'PARRY!', '#38bdf8');
                    this.projectiles.splice(i, 1);
                    continue;
                }
                if (validGuard) {
                    SoundFX_1.soundFX.block();
                    defender.hp = Math.max(1, defender.hp - Math.ceil(p.damage * 0.12));
                    defender.state = defInput.down ? 'BLOCK_CROUCH' : 'BLOCK_STAND';
                    defender.blockstunFrames = 7;
                    this.applyCornerAwarePushback(attacker, defender, 8);
                    this.spawnHitSparks(p.x, p.y, '#60a5fa', 10);
                    this.projectiles.splice(i, 1);
                    continue;
                }
                const dmg = Math.max(10, Math.round(p.damage * attacker.damageScaling));
                defender.hp = Math.max(0, defender.hp - dmg);
                attacker.comboCount++;
                attacker.comboDamage += dmg;
                attacker.comboTimer = 55;
                attacker.damageScaling = Math.max(0.45, attacker.damageScaling - 0.08);
                if (attacker.profile.passiveTrait === 'VAMPIRIC_ON_SPECIAL') {
                    const heal = Math.round(dmg * 0.25);
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
                }
                this.addMeter(attacker, 10);
                this.addMeter(defender, 7);
                this.hitstopFrames = 5;
                this.shakeIntensity = p.mechanic === 'TRAP_MINE_DROP' ? 11 : 7;
                SoundFX_1.soundFX.heavyHit();
                if (p.mechanic === 'TRAP_MINE_DROP') {
                    this.shockwaves.push({
                        x: p.x,
                        y: p.y,
                        radius: 12,
                        maxRadius: 110,
                        color: p.color,
                        alpha: 0.95,
                    });
                }
                this.spawnHitSparks(p.x, p.y, p.color, 18, p.vx >= 0 ? 1 : -1);
                if (defender.hp <= 0) {
                    this.triggerKnockout(attacker, defender);
                }
                else if (p.mechanic === 'TRAP_MINE_DROP') {
                    defender.state = 'KNOCKDOWN';
                    defender.stateFrame = 0;
                    defender.vy = -10.5;
                    defender.y -= 2;
                }
                else {
                    defender.state = 'HURT';
                    defender.stateFrame = 0;
                    defender.hitstunFrames = attacker.comboCount >= 3 ? 9 : p.hitstun;
                    defender.vx = (p.vx >= 0 ? 1 : -1) * 6.5;
                }
                this.projectiles.splice(i, 1);
            }
        }
    }
    triggerKnockout(winner, loser) {
        if (this.roundOver || this.roundBreakFrames > 0)
            return;
        winner.state = 'VICTORY';
        winner.stateFrame = 0;
        loser.state = 'KO';
        loser.stateFrame = 0;
        loser.vy = -10;
        loser.vx = winner.facing * 9;
        this.hitstopFrames = 16;
        this.shakeIntensity = 18;
        this.completeRound(winner.index);
        // Keep an intermediate KO visible until the next-round countdown.
        if (!this.roundOver) {
            this.announceText = `K.O.! ${winner.profile.fighterName}`;
            this.announceTimer = 120;
        }
        SoundFX_1.soundFX.koFanfare();
        this.spawnHitSparks(loser.x, loser.y - 70, '#facc15', 32);
    }
    computeTrainingDummyInput(dummy, player) {
        const inp = createEmptyInput();
        if (this.trainingDummyMode === 'IDLE')
            return inp;
        if (this.trainingDummyMode === 'MASH_LIGHT') {
            // Alternates light attack every ~28 frames so you can test Parry & Counter Hits!
            if (this.frameCount % 28 === 0) {
                inp.light = true;
            }
            return inp;
        }
        if (this.trainingDummyMode === 'TUTORIAL_JABS') {
            // Lentos y telegráficos, solo para practicar bloqueo y parry con tacto.
            if (this.frameCount % 100 === 0)
                inp.light = true;
            return inp;
        }
        if (this.trainingDummyMode === 'GUARD_HIGH') {
            inp.guard = true;
            return inp;
        }
        if (this.trainingDummyMode === 'GUARD_LOW') {
            inp.guard = true;
            inp.down = true;
            return inp;
        }
        if (this.trainingDummyMode === 'GUARD_ALL') {
            inp.guard = true;
            if (player.state === 'ATTACK' && player.currentAttack?.height === 'LOW') {
                inp.down = true;
            }
            return inp;
        }
        return inp;
    }
    computeCpuInput(cpu, player) {
        const inp = createEmptyInput();
        if (cpu.aiCooldown > 0)
            cpu.aiCooldown--;
        // CPUs can confirm hits into short, readable chains instead of doing only
        // isolated attacks. EASY does it occasionally, HARD more reliably.
        const attack = cpu.currentAttack;
        if (cpu.state === 'ATTACK' && attack?.hasHit && cpu.bufferedActions.length === 0 &&
            cpu.stateFrame >= attack.startup &&
            cpu.stateFrame <= attack.startup + attack.active + 2) {
            const chance = this.difficulty === 'HARD' ? 0.74 : this.difficulty === 'NORMAL' ? 0.46 : 0.2;
            if (Math.random() < chance) {
                let followUp = null;
                if (attack.slot === 'LIGHT') {
                    followUp = cpu.lightChainCount === 1 ? 'LIGHT' : 'HEAVY';
                }
                else if (attack.slot === 'HEAVY' && Math.random() < 0.55) {
                    followUp = 'SP_FORWARD';
                }
                if (followUp)
                    cpu.bufferedActions.push({ slot: followUp, frame: this.frameCount });
            }
        }
        const dist = Math.abs(player.x - cpu.x);
        const dirToPlayer = player.x >= cpu.x ? 1 : -1;
        const arch = cpu.profile.archetype;
        const reactionDelay = this.difficulty === 'EASY' ? 24 : this.difficulty === 'NORMAL' ? 13 : 6;
        // Smart High/Low blocking based on incoming attack height!
        if (player.state === 'ATTACK' &&
            dist < 175 &&
            Math.random() < (this.difficulty === 'HARD' ? 0.68 : 0.34)) {
            inp.guard = true;
            if (player.currentAttack?.height === 'LOW')
                inp.down = true;
            return inp;
        }
        if (cpu.aiCooldown === 0) {
            cpu.aiCooldown = reactionDelay + Math.floor(Math.random() * 10);
            // Navigate toward the rival across tiers instead of staying below them.
            if ((0, stages_1.getLargeArena)(this.stage) && player.y < cpu.y - 70 && this.isGrounded(cpu)) {
                inp.up = true;
                if (dirToPlayer === 1)
                    inp.right = true;
                else
                    inp.left = true;
                return inp;
            }
            if (cpu.meter >= 100) {
                const isBeam = cpu.profile.moveset.ultimateSuper.mechanic === 'GIANT_BEAM_LASER';
                if (isBeam || dist < 290) {
                    inp.superBtn = true;
                    return inp;
                }
            }
            if (arch === 'ZONER_MAGE') {
                if (dist > 250) {
                    inp.spNeutral = true;
                }
                else if (dist < 110) {
                    inp.spUp = true;
                }
                else {
                    if (dirToPlayer === 1)
                        inp.left = true;
                    else
                        inp.right = true;
                }
            }
            else if (arch === 'GRAPPLER_TANK') {
                if (dist < 100) {
                    inp.spForward = Math.random() < 0.62;
                    inp.heavy = !inp.spForward;
                }
                else if (dist < 260 && Math.random() < 0.38) {
                    inp.spForward = true;
                }
                else {
                    if (dirToPlayer === 1)
                        inp.right = true;
                    else
                        inp.left = true;
                }
            }
            else {
                if (dist < 100) {
                    const roll = Math.random();
                    if (roll < 0.42)
                        inp.light = true;
                    else if (roll < 0.7)
                        inp.heavy = true;
                    else if (roll < 0.86)
                        inp.spUp = true;
                    else
                        inp.spForward = true;
                }
                else if (dist < 270) {
                    if (Math.random() < 0.44) {
                        inp.spForward = true;
                    }
                    else {
                        if (dirToPlayer === 1)
                            inp.right = true;
                        else
                            inp.left = true;
                        if (Math.random() < 0.22)
                            inp.up = true;
                    }
                }
                else {
                    if (Math.random() < 0.42) {
                        inp.spNeutral = true;
                    }
                    else {
                        if (dirToPlayer === 1)
                            inp.right = true;
                        else
                            inp.left = true;
                    }
                }
            }
        }
        else {
            if (arch === 'ZONER_MAGE' && dist < 220) {
                if (dirToPlayer === 1)
                    inp.left = true;
                else
                    inp.right = true;
            }
            else if (dist > 105) {
                if (dirToPlayer === 1)
                    inp.right = true;
                else
                    inp.left = true;
            }
        }
        return inp;
    }
    spawnDust(x, y, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 28,
                y: y - 4,
                vx: (Math.random() - 0.5) * 3.5,
                vy: -Math.random() * 2.5 - 0.5,
                size: 6,
                color: '#e2e8f0',
                kind: 'dust',
                life: 16,
                maxLife: 16,
            });
        }
    }
    spawnHitSparks(x, y, color, count, direction = 0) {
        for (let i = 0; i < count; i++) {
            const angle = direction === 0 ? Math.random() * Math.PI * 2
                : (direction === 1 ? 0 : Math.PI) + (Math.random() - .5) * Math.PI * 1.65;
            const spd = 2 + Math.random() * 7.5;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                size: 5 + Math.floor(Math.random() * 5),
                color: i % 3 === 0 ? '#ffffff' : color,
                kind: 'spark',
                life: 14 + Math.floor(Math.random() * 8),
                maxLife: 22,
            });
        }
    }
    addCallout(x, y, text, color) {
        this.callouts.push({ x, y, vy: -1.1, text, color, life: 46 });
    }
    updateParticles() {
        // Keep wire snapshots and mobile draw costs bounded during long supers.
        if (this.particles.length > 160)
            this.particles.splice(0, this.particles.length - 160);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life--;
            if (pt.life <= 0)
                this.particles.splice(i, 1);
        }
        for (let i = this.callouts.length - 1; i >= 0; i--) {
            const c = this.callouts[i];
            c.y += c.vy;
            c.life--;
            if (c.life <= 0)
                this.callouts.splice(i, 1);
        }
        for (let i = this.parryBursts.length - 1; i >= 0; i--) {
            if (--this.parryBursts[i].life <= 0)
                this.parryBursts.splice(i, 1);
        }
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += (sw.maxRadius - sw.radius) * 0.25;
            sw.alpha -= 0.07;
            if (sw.alpha <= 0)
                this.shockwaves.splice(i, 1);
        }
        for (let i = this.meteors.length - 1; i >= 0; i--) {
            const m = this.meteors[i];
            m.x += m.vx;
            m.y += m.vy;
            this.particles.push({
                x: m.x,
                y: m.y,
                vx: (Math.random() - 0.5) * 3,
                vy: -2 - Math.random() * 2,
                size: 7,
                color: m.color,
                kind: 'energy',
                life: 12,
                maxLife: 12,
            });
            if (m.y >= this.getStageFloorY() - 12) {
                this.shockwaves.push({
                    x: m.x,
                    y: this.getStageFloorY() - 6,
                    radius: 10,
                    maxRadius: 95,
                    color: m.color,
                    alpha: 0.9,
                });
                this.spawnHitSparks(m.x, this.getStageFloorY() - 12, '#facc15', 14);
                this.shakeIntensity = 10;
                this.meteors.splice(i, 1);
            }
        }
        for (let i = this.crossSlashes.length - 1; i >= 0; i--) {
            this.crossSlashes[i].life--;
            if (this.crossSlashes[i].life <= 0)
                this.crossSlashes.splice(i, 1);
        }
    }
    updateAfterimages() {
        for (let i = this.afterimages.length - 1; i >= 0; i--) {
            this.afterimages[i].alpha -= 0.06;
            if (this.afterimages[i].alpha <= 0) {
                this.afterimages.splice(i, 1);
            }
        }
    }
    getSpriteCellForFighter(f) {
        // Custom 4x4 layouts optimize scarce frames for TWO consecutive poses per normal attack.
        // Preset/legacy fighters retain the V8 mapping unchanged.
        if (f.profile.spriteSheetLayoutVersion === 2) {
            if (f.state === 'KO' || f.state === 'KNOCKDOWN')
                return f.profile.spriteSheetLastCell === 'KO' ? 15 : 14;
            if (f.state === 'VICTORY')
                return 0;
            if (f.state === 'HURT')
                return 14;
            if (f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH')
                return 5;
            if (f.state === 'ATTACK' && f.currentAttack) {
                const atk = f.currentAttack;
                switch (atk.slot) {
                    case 'LIGHT':
                    case 'RUSH': return f.stateFrame < atk.startup ? 6 : 7;
                    case 'LOW':
                    case 'HEAVY': return f.stateFrame < atk.startup ? 8 : 9;
                    case 'SP_NEUTRAL': return 10;
                    case 'SP_FORWARD': return 11;
                    case 'SP_UP': return 12;
                    case 'SUPER': return 13;
                }
            }
            if (!this.isGrounded(f) || f.state === 'JUMP')
                return 4;
            if (f.state === 'WALK_FWD' || f.state === 'WALK_BACK' || f.state === 'DASH')
                return Math.floor(this.frameCount / 7) % 2 === 0 ? 2 : 3;
            return Math.floor(this.frameCount / 14) % 2 === 0 ? 0 : 1;
        }
        if (f.state === 'KO' || f.state === 'KNOCKDOWN')
            return 13;
        if (f.state === 'VICTORY')
            return 14;
        if (f.state === 'HURT')
            return 12;
        if (f.state === 'BLOCK_STAND' || f.state === 'BLOCK_CROUCH')
            return 5;
        if (f.state === 'ATTACK' && f.currentAttack) {
            switch (f.currentAttack.slot) {
                case 'LIGHT':
                case 'RUSH':
                    return 6;
                case 'LOW':
                    return 7;
                case 'HEAVY':
                    return 7;
                case 'SP_NEUTRAL':
                    return 8;
                case 'SP_FORWARD':
                    return 9;
                case 'SP_UP':
                    return 10;
                case 'SUPER':
                    return 11;
            }
        }
        if (!this.isGrounded(f) || f.state === 'JUMP')
            return 4;
        if (f.state === 'WALK_FWD' || f.state === 'WALK_BACK' || f.state === 'DASH') {
            return Math.floor(this.frameCount / 7) % 2 === 0 ? 2 : 3;
        }
        return Math.floor(this.frameCount / 14) % 2 === 0 ? 0 : 1;
    }
    render(ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        if (this.shakeIntensity > 0) {
            const sx = Math.round((Math.random() - 0.5) * this.shakeIntensity * 2);
            const sy = Math.round((Math.random() - 0.5) * this.shakeIntensity * 2);
            ctx.translate(sx, sy);
        }
        const arena = (0, stages_1.getLargeArena)(this.stage);
        if (arena) {
            const distance = Math.abs(this.p1.x - this.p2.x);
            const midpoint = (this.p1.x + this.p2.x) / 2;
            const sameSide = (this.p1.x < 450 && this.p2.x < 450) ||
                (this.p1.x > 510 && this.p2.x > 510);
            const desiredZoom = sameSide && distance < 330
                ? 1 + 0.1 * Math.max(0, Math.min(1, (330 - distance) / 230))
                : 1;
            this.cameraZoom += (desiredZoom - this.cameraZoom) * 0.06;
            const visibleHalf = exports.STAGE_WIDTH / (2 * this.cameraZoom);
            const targetX = Math.max(visibleHalf, Math.min(exports.STAGE_WIDTH - visibleHalf, midpoint));
            this.cameraX += (targetX - this.cameraX) * 0.065;
            this.cameraX = Math.max(visibleHalf, Math.min(exports.STAGE_WIDTH - visibleHalf, this.cameraX));
            this.cameraY = exports.STAGE_HEIGHT / 2;
            ctx.translate(exports.STAGE_WIDTH / 2, exports.STAGE_HEIGHT / 2);
            ctx.scale(this.cameraZoom, this.cameraZoom);
            ctx.translate(-this.cameraX, -this.cameraY);
        }
        else {
            this.cameraZoom = 1;
            this.cameraX = exports.STAGE_WIDTH / 2;
            this.cameraY = exports.STAGE_HEIGHT / 2;
        }
        this.renderStage(ctx);
        if (this.superFlashFrames > 0) {
            (0, ArcadeVFX_1.drawSuperFlashFX)(ctx, this.superFlashOwner === 0 ? this.p1 : this.p2, this.superFlashFrames, this.frameCount);
        }
        this.renderShadow(ctx, this.p1);
        this.renderShadow(ctx, this.p2);
        for (const img of this.afterimages) {
            const owner = Math.abs(img.x - this.p1.x) < Math.abs(img.x - this.p2.x) ? this.p1 : this.p2;
            if (owner.spriteSheet) {
                ctx.save();
                ctx.globalAlpha = img.alpha;
                this.drawSpriteCell(ctx, owner.spriteSheet, img.cell, img.x, img.y, img.facing, owner.scale);
                ctx.restore();
            }
        }
        const first = this.p1.state === 'ATTACK' ? this.p2 : this.p1;
        const second = first === this.p1 ? this.p2 : this.p1;
        this.renderFighter(ctx, first);
        this.renderFighter(ctx, second);
        for (const p of this.projectiles) {
            this.renderProjectile(ctx, p);
        }
        // Mechanic-specific impact FX, all presentation-only and snapshot-safe.
        (0, ArcadeVFX_1.drawSuperMeteorsFX)(ctx, this.meteors, this.frameCount);
        for (const cs of this.crossSlashes)
            (0, ArcadeVFX_1.drawCrossSlashFX)(ctx, cs.x, cs.y, cs.color, cs.life);
        for (const sw of this.shockwaves)
            (0, ArcadeVFX_1.drawShockwaveFX)(ctx, sw, this.frameCount);
        for (const burst of this.parryBursts)
            (0, ArcadeVFX_1.drawParryBurstFX)(ctx, burst);
        (0, ArcadeVFX_1.drawParticlesFX)(ctx, this.particles);
        (0, ArcadeVFX_1.drawHitstopSparkFX)(ctx, this.particles, this.hitstopFrames);
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        for (const c of this.callouts) {
            ctx.fillStyle = '#000000';
            ctx.fillText(c.text, Math.round(c.x) + 2, Math.round(c.y) + 2);
            ctx.fillStyle = c.color;
            ctx.fillText(c.text, Math.round(c.x), Math.round(c.y));
        }
        if (this.showArenaCollisions && (0, stages_1.getLargeArena)(this.stage))
            this.renderArenaCollisionDebug(ctx);
        if (this.showHitboxes) {
            this.renderDebugBoxes(ctx, this.p1);
            this.renderDebugBoxes(ctx, this.p2);
        }
        ctx.restore();
    }
    renderStage(ctx) {
        const background = readyStageImage(this.stage);
        if (background) {
            // Images are painted at a consistent native 16:9 stage size. Pixel fighters
            // still use nearest-neighbour rendering after the background is drawn.
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(background, 0, 0, exports.STAGE_WIDTH, exports.STAGE_HEIGHT);
            ctx.imageSmoothingEnabled = false;
            return;
        }
        if (this.stage === 'SKI_RESORT') {
            const sky = ctx.createLinearGradient(0, 0, 0, exports.FLOOR_Y);
            sky.addColorStop(0, '#0284c7');
            sky.addColorStop(0.65, '#7dd3fc');
            sky.addColorStop(1, '#e0f2fe');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, exports.STAGE_WIDTH, exports.FLOOR_Y);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(760, 56, 48, 48);
            ctx.fillStyle = '#bae6fd';
            this.drawTriangle(ctx, 40, 380, 220, 140, 410, 380);
            this.drawTriangle(ctx, 310, 380, 540, 110, 770, 380);
            this.drawTriangle(ctx, 640, 380, 840, 155, 1020, 380);
            ctx.fillStyle = '#ffffff';
            this.drawTriangle(ctx, 175, 200, 220, 140, 268, 200);
            this.drawTriangle(ctx, 485, 180, 540, 110, 598, 180);
            this.drawTriangle(ctx, 790, 215, 840, 155, 892, 215);
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 190);
            ctx.lineTo(exports.STAGE_WIDTH, 130);
            ctx.stroke();
            const gondolaX = ((this.frameCount * 0.6) % (exports.STAGE_WIDTH + 120)) - 60;
            const gondolaY = 190 - (gondolaX / exports.STAGE_WIDTH) * 60;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(Math.round(gondolaX), Math.round(gondolaY) + 4, 28, 20);
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(Math.round(gondolaX) + 4, Math.round(gondolaY) + 8, 20, 8);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(90, 320, 120, 70);
            ctx.fillStyle = '#451a03';
            this.drawTriangle(ctx, 76, 320, 150, 280, 224, 320);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(112, 342, 20, 20);
            ctx.fillRect(166, 342, 20, 20);
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 388, exports.STAGE_WIDTH, exports.STAGE_HEIGHT - 388);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(0, exports.FLOOR_Y, exports.STAGE_WIDTH, 8);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(0, exports.FLOOR_Y + 8, exports.STAGE_WIDTH, exports.STAGE_HEIGHT - exports.FLOOR_Y - 8);
        }
        else if (this.stage === 'NIGHT_PLAZA') {
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, exports.STAGE_WIDTH, exports.FLOOR_Y);
            ctx.fillStyle = '#fef08a';
            for (let i = 0; i < 28; i++) {
                const sx = (i * 137) % exports.STAGE_WIDTH;
                const sy = (i * 53) % 210;
                if ((this.frameCount + i * 7) % 40 < 30) {
                    ctx.fillRect(sx, sy, 3, 3);
                }
            }
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(80, 170, 800, 230);
            ctx.fillStyle = '#334155';
            ctx.fillRect(110, 195, 740, 195);
            for (let wx = 150; wx <= 770; wx += 120) {
                ctx.fillStyle = '#f59e0b';
                ctx.fillRect(wx, 225, 44, 62);
                ctx.fillStyle = '#dc2626';
                ctx.fillRect(wx - 4, 290, 52, 24);
            }
            ctx.fillStyle = '#334155';
            ctx.fillRect(0, 396, exports.STAGE_WIDTH, exports.STAGE_HEIGHT - 396);
            ctx.fillStyle = '#1e293b';
            for (let gx = 0; gx < exports.STAGE_WIDTH; gx += 48) {
                ctx.fillRect(gx, exports.FLOOR_Y, 44, 14);
                ctx.fillRect(gx + 24, exports.FLOOR_Y + 18, 44, 14);
            }
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(0, exports.FLOOR_Y - 4, exports.STAGE_WIDTH, 4);
        }
        else {
            const grad = ctx.createLinearGradient(0, 0, 0, exports.FLOOR_Y);
            grad.addColorStop(0, '#1d4ed8');
            grad.addColorStop(0.55, '#f97316');
            grad.addColorStop(1, '#fde047');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, exports.STAGE_WIDTH, exports.FLOOR_Y);
            ctx.fillStyle = '#fef9c3';
            ctx.fillRect(430, 120, 96, 96);
            ctx.fillStyle = '#4c1d95';
            this.drawTriangle(ctx, -40, 400, 260, 190, 560, 400);
            ctx.fillStyle = '#5b21b6';
            this.drawTriangle(ctx, 410, 400, 720, 170, 1020, 400);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(0, 396, exports.STAGE_WIDTH, exports.STAGE_HEIGHT - 396);
            ctx.fillStyle = '#d97706';
            ctx.fillRect(0, exports.FLOOR_Y - 4, exports.STAGE_WIDTH, 8);
            ctx.fillStyle = '#451a03';
            ctx.fillRect(0, exports.FLOOR_Y + 4, exports.STAGE_WIDTH, exports.STAGE_HEIGHT - exports.FLOOR_Y - 4);
        }
    }
    drawTriangle(ctx, x1, y1, x2, y2, x3, y3) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fill();
    }
    renderShadow(ctx, f) {
        // Layered contact shadow: a soft diffuse penumbra + a tighter ambient-occlusion
        // footprint. Airborne shadows fade and detach from the fighter; the gameplay
        // ground line remains unchanged. Everything is presentation-only.
        const ground = (0, stages_1.getLargeArena)(this.stage);
        const supportingY = ground?.platforms.find(p => p.x1 <= f.x && f.x <= p.x2 && Math.abs(f.y - p.y) < 1)?.y ?? this.getStageFloorY();
        const jumpHeight = Math.max(0, supportingY - f.y);
        const air = Math.min(1, jumpHeight / 220);
        const opacity = 1 - air * 0.76;
        const spread = 1 + air * 0.36;
        const centerX = Math.round(f.x + f.facing * Math.min(17, jumpHeight * 0.1));
        const centerY = (this.supportSurface(f) ? f.y : this.getStageFloorY()) + 2;
        const rx = Math.round(48 * f.scale * spread);
        const ry = Math.max(4, Math.round(9 * f.scale));
        ctx.save();
        ctx.translate(centerX, centerY);
        // Scale a circular radial gradient to an elliptical surface. Avoids the
        // visible rectangular sticker used previously, even on pale snow stages.
        ctx.save();
        ctx.scale(rx, ry);
        const penumbra = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1);
        penumbra.addColorStop(0, `rgba(8, 12, 27, ${0.38 * opacity})`);
        penumbra.addColorStop(0.36, `rgba(9, 14, 30, ${0.29 * opacity})`);
        penumbra.addColorStop(0.75, `rgba(8, 13, 28, ${0.105 * opacity})`);
        penumbra.addColorStop(1, 'rgba(8, 13, 28, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fillStyle = penumbra;
        ctx.fill();
        ctx.restore();
        // Small grounding core only while feet are near the floor. Deliberately
        // elliptical, never a horizontal block or a hard-edged black patch.
        if (air < 0.5) {
            ctx.save();
            ctx.scale(Math.max(1, rx * 0.58), Math.max(1, ry * 0.34));
            const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
            contact.addColorStop(0, `rgba(4, 9, 19, ${0.26 * (1 - air * 2)})`);
            contact.addColorStop(1, 'rgba(4, 9, 19, 0)');
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.fillStyle = contact;
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }
    renderFighter(ctx, f) {
        const cell = this.getSpriteCellForFighter(f);
        // Each attack and guard has its own crisp arcade silhouette. Never draw
        // a debug-style rectangle over a fighter during actual gameplay.
        (0, ArcadeVFX_1.drawAttackFX)(ctx, f, this.frameCount);
        (0, ArcadeVFX_1.drawGuardFX)(ctx, f, this.frameCount);
        if (f.spriteSheet) {
            ctx.save();
            if (f.invincibleFrames > 0 && this.frameCount % 2 === 0) {
                ctx.globalAlpha = 0.7;
            }
            // Subtle crouch squash when crouching block so high/low stance is visually readable
            const crouchScaleY = f.state === 'BLOCK_CROUCH' ? 0.82 : 1.0;
            let rotAngle = 0;
            if (f.grabbedBy !== null) {
                rotAngle = Math.PI * 0.85; // Upside down when hoisted!
            }
            else if (f.state === 'ATTACK' && f.currentAttack) {
                if (f.currentAttack.mechanic === 'SPINNING_ADVANCE') {
                    rotAngle = (this.frameCount * 0.45) * f.facing;
                }
                else if (f.currentAttack.mechanic === 'DIVE_KICK_FROM_AIR') {
                    rotAngle = 0.58 * f.facing;
                }
            }
            // When the projectile occupies cell 15, reuse the recoil frame for KO with a fall rotation.
            if (f.profile.spriteSheetLayoutVersion === 2 && f.state === 'KO' && f.profile.spriteSheetLastCell === 'PROJECTILE')
                rotAngle = 1.52 * f.facing;
            this.drawSpriteCell(ctx, f.spriteSheet, cell, f.x, f.y, f.facing, f.scale, crouchScaleY, rotAngle);
            ctx.restore();
        }
        else {
            ctx.fillStyle = f.index === 0 ? '#ef4444' : '#eab308';
            ctx.fillRect(f.x - 30 * f.scale, f.y - 150 * f.scale, 60 * f.scale, 150 * f.scale);
        }
    }
    drawSpriteCell(ctx, sheet, cell, x, y, facing, scale, scaleYMult = 1.0, rotation = 0) {
        const col = cell % 4;
        const row = Math.floor(cell / 4);
        const sx = col * 256;
        const sy = row * 256;
        const drawW = Math.round(216 * scale);
        const drawH = Math.round(216 * scale * scaleYMult);
        const footOffset = Math.round((14 / 256) * drawH);
        ctx.save();
        if (rotation !== 0) {
            ctx.translate(Math.round(x), Math.round(y - drawH * 0.45));
            ctx.rotate(rotation);
            ctx.scale(facing, 1);
            ctx.drawImage(sheet, sx, sy, 256, 256, Math.round(-drawW / 2), Math.round(-drawH * 0.55), drawW, drawH);
        }
        else {
            ctx.translate(Math.round(x), Math.round(y + footOffset));
            ctx.scale(facing, 1);
            ctx.drawImage(sheet, sx, sy, 256, 256, Math.round(-drawW / 2), -drawH, drawW, drawH);
        }
        ctx.restore();
    }
    renderProjectile(ctx, p) {
        (0, ArcadeVFX_1.drawProjectileFX)(ctx, p, this.frameCount);
        if (p.mechanic === 'GROUND_SHOCKWAVE' || p.mechanic === 'TRAP_MINE_DROP')
            return;
        if (p.spriteSheet && p.useSpriteArt !== false) {
            const sx = 3 * 256, sy = 3 * 256, size = 96 * ((0, stages_1.getLargeArena)(this.stage)?.fighterScale ?? 1);
            ctx.save();
            ctx.translate(Math.round(p.x), Math.round(p.y));
            if (p.mechanic === 'BOOMERANG_RETURN' || p.mechanic === 'ARCING_LOB_OBJECT')
                ctx.rotate(this.frameCount * .35 * p.facing);
            else
                ctx.scale(p.facing, 1);
            ctx.drawImage(p.spriteSheet, sx, sy, 256, 256, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
        else {
            // Generated fighters without an isolated projectile still get a designed
            // faceted energy orb, not a featureless circle.
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6, r = p.radius * (i % 2 ? .72 : 1.12);
                const x = Math.cos(a) * r, y = Math.sin(a) * r;
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#fefce8';
            ctx.beginPath();
            ctx.arc(0, 0, p.radius * .42, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    /** The camera transform is active: debug lines follow actual physics pixels. */
    renderArenaCollisionDebug(ctx) {
        const arena = (0, stages_1.getLargeArena)(this.stage);
        if (!arena)
            return;
        ctx.save();
        ctx.font = '10px monospace';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#b9ff77';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, arena.floorY);
        ctx.lineTo(exports.STAGE_WIDTH, arena.floorY);
        ctx.stroke();
        ctx.fillStyle = '#b9ff77';
        ctx.fillText('FLOOR y=' + arena.floorY, 68, arena.floorY - 5);
        for (const p of arena.platforms) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#00f5ff';
            ctx.beginPath();
            ctx.moveTo(p.x1, p.y);
            ctx.lineTo(p.x2, p.y);
            ctx.stroke();
            ctx.fillStyle = '#00f5ff';
            ctx.fillRect(p.x1 - 2, p.y - 5, 4, 10);
            ctx.fillRect(p.x2 - 2, p.y - 5, 4, 10);
            ctx.fillStyle = '#071522';
            const label = p.id + ' [' + p.x1 + '..' + p.x2 + ', y=' + p.y + ']';
            const labelX = Math.max(5, Math.min(740, p.x1 + 5));
            ctx.fillRect(labelX - 2, p.y - 22, Math.min(215, label.length * 6.5 + 5), 17);
            ctx.fillStyle = '#a0faff';
            ctx.fillText(label, labelX, p.y - 8);
        }
        for (const fighter of [this.p1, this.p2]) {
            const isGrounded = this.isGrounded(fighter);
            ctx.fillStyle = fighter.index === 0 ? '#ffdf5a' : '#ff88e3';
            ctx.fillRect(fighter.x - 4, fighter.y - 4, 8, 8);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(fighter.x, fighter.y);
            ctx.lineTo(fighter.x, fighter.y - 95 * fighter.scale);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillText((fighter.index === 0 ? 'P1 ' : 'P2 ') + Math.round(fighter.x) + ',' + Math.round(fighter.y) +
                ' ' + (isGrounded ? 'APOYADO' : 'AIRE'), fighter.x - 25, fighter.y - 8);
        }
        ctx.restore();
    }
    renderDebugBoxes(ctx, f) {
        // Hurtbox (Green)
        ctx.strokeStyle = '#22c55e';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.lineWidth = 2;
        const hMult = f.state === 'BLOCK_CROUCH' ? 0.72 : 1.0;
        const h = Math.round(f.hurtbox.height * hMult);
        const hx = f.x - f.hurtbox.width / 2;
        const hy = f.y - h;
        ctx.fillRect(hx, hy, f.hurtbox.width, h);
        ctx.strokeRect(hx, hy, f.hurtbox.width, h);
        // Active Hitbox color-coded by attack height:
        // RED = MID | CYAN = LOW (must crouch block) | ORANGE = OVERHEAD (must stand block)
        const atk = f.currentAttack;
        if (f.state === 'ATTACK' &&
            atk &&
            atk.hitbox &&
            f.stateFrame >= atk.startup &&
            f.stateFrame < atk.startup + atk.active) {
            const bx = f.facing === 1
                ? f.x + atk.hitbox.offsetX
                : f.x - atk.hitbox.offsetX - atk.hitbox.width;
            const by = f.y + atk.hitbox.offsetY;
            ctx.strokeStyle =
                atk.height === 'LOW'
                    ? '#06b6d4'
                    : atk.height === 'OVERHEAD'
                        ? '#f97316'
                        : '#ef4444';
            ctx.fillStyle =
                atk.height === 'LOW'
                    ? 'rgba(6, 182, 212, 0.35)'
                    : atk.height === 'OVERHEAD'
                        ? 'rgba(249, 115, 22, 0.35)'
                        : 'rgba(239, 68, 68, 0.35)';
            ctx.fillRect(bx, by, atk.hitbox.width, atk.hitbox.height);
            ctx.strokeRect(bx, by, atk.hitbox.width, atk.hitbox.height);
        }
    }
}
exports.FightEngine = FightEngine;

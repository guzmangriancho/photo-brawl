"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTROL_KEYS = exports.ONLINE_PROTOCOL = void 0;
exports.packControls = packControls;
exports.unpackControls = unpackControls;
exports.ONLINE_PROTOCOL = 1;
exports.CONTROL_KEYS = [
    'left', 'right', 'up', 'down', 'light', 'heavy', 'spNeutral', 'spForward', 'spUp',
    'superBtn', 'romanCancel', 'dashLeft', 'dashRight',
];
function packControls(input) {
    let value = 0;
    exports.CONTROL_KEYS.forEach((key, i) => { if (input[key])
        value |= (1 << i); });
    return value;
}
function unpackControls(value) {
    const result = {};
    exports.CONTROL_KEYS.forEach((key, i) => { result[key] = Boolean(value & (1 << i)); });
    return result;
}

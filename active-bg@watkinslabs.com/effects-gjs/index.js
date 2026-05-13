// effects-gjs/index.js
// Central registry. Each entry maps an effect id (matching the gsetting
// value) to a factory function `(cfg, W, H) => { update, paint }`.

import aurora        from './aurora.js';
import blueprint     from './blueprint.js';
import circuit       from './circuit.js';
import coderain      from './coderain.js';
import constellation from './constellation.js';
import linkfield     from './linkfield.js';
import meshwarp      from './meshwarp.js';
import neural        from './neural.js';
import nodegraph     from './nodegraph.js';
import particles     from './particles.js';
import phaseflow     from './phaseflow.js';
import radar         from './radar.js';
import scanner       from './scanner.js';
import signalrings   from './signalrings.js';
import wavegrid      from './wavegrid.js';

const REGISTRY = {
    aurora, blueprint, circuit, coderain, constellation,
    linkfield, meshwarp, neural, nodegraph, particles,
    phaseflow, radar, scanner, signalrings, wavegrid,
};

export function getEffectFactory(name) {
    return REGISTRY[name] || null;
}

export function isPorted(name) {
    return !!REGISTRY[name];
}

export function portedNames() {
    return Object.keys(REGISTRY);
}

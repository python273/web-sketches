function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d', {alpha:false});
    ctx.scale(dpr, dpr);
    return ctx;
}

const canvas = document.getElementById('canvas');
const ctx = setupCanvas(canvas);

const cx = canvas.clientWidth;
const cy = canvas.clientHeight;

const vec2_dist = (a, b) => (
    Math.sqrt(Math.pow(a.x-b.x, 2) + Math.pow(a.y-b.y, 2))
);
const vec2_len = (a) => vec2_dist(a, {x: 0, y: 0});
const vec2_unit = (a) => {
    const len = vec2_len(a);
    return {x: a.x / len, y: a.y / len};
};
const vec2_randunit = () => vec2_unit({
    x: Math.random() - 0.5,
    y: Math.random() - 0.5
});

const vec2_add = (a, b) => ({x: a.x + b.x, y: a.y + b.y});
const vec2_mul = (a, s) => ({x: a.x * s, y: a.y * s});
const vec2_sub = (a, b) => vec2_add(a, vec2_mul(b, -1));

const numOfParticles = 1024;

const particleDataSize = 8;
const particles = new Float64Array(numOfParticles * particleDataSize);
function initParticles(particles) {
    for (let i = 0; i < particles.length; i += particleDataSize) {
        const rad = Math.random() * Math.PI * 2;
        let sx = Math.cos(rad);
        let sy = Math.sin(rad);
        sx /= 16.0;
        sy /= 16.0;
        
        const radius = 4 + Math.random() * 8;
        // const radius = 8;

        // particles[i + 0] = Math.max(radius, Math.min(cx - radius, Math.random() * cx));
        // particles[i + 1] = Math.max(radius, Math.min(cx - radius, Math.random() * cy));
        particles[i + 0] = cx / 2 + (Math.random() - 0.5) * 50.0;
        particles[i + 1] = cy / 2 + (Math.random() - 0.5) * 50.0;
        particles[i + 2] = radius;
        particles[i + 3] = 128.0 + Math.random() * 127.0;
        particles[i + 4] = 64.0 + Math.random() * 128.0;
        particles[i + 5] = 64.0 + Math.random() * 128.0;
        particles[i + 6] = sx;
        particles[i + 7] = sy;
    }
}
initParticles(particles);

ctx.fillStyle = 'white';
ctx.fillRect(0, 0, cx, cy);
ctx.fillStyle = 'black';

let prev = null;


function render(ctx, particles, d, timestamp) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, cx, cy);
    // ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    // ctx.fillRect(0, 0, cx, cy);
    // ctx.clearRect(0, 0, cx, cy);

    for (let i = 0; i < particles.length; i += particleDataSize) {
        particles[i + 0] += Math.random() * 0.01;
        particles[i + 1] += Math.random() * 0.01;
        // particles[i + 1] += Math.random() * 0.01 + 0.6;
    }
    for (let i = 0; i < particles.length; i += particleDataSize) {
        particles[i + 0] += (cx / 2 - particles[i + 0]) / 200.0;
        // particles[i + 1] += (cy / 2 - particles[i + 1]) / 200.0;
        // particles[i + 1] += Math.random() * 0.01 + 0.6;
    }

    for (let i = 0; i < particles.length; i += particleDataSize) {
        const x = particles[i + 0];
        const y = particles[i + 1];
        const radius = particles[i + 2];
        const sx = particles[i + 6];
        const sy = particles[i + 7];

        // const newx = x + (sx * d) + Math.cos(timestamp / 20000.0)/200.0;
        // const newy = y + (sy * d) + Math.sin(timestamp / 20000.0)/200.0;

        // particles[i + 0] = newx > 1.0 ? newx % 1.0 : (newx < 0.0 ? (1.0 - newx): newx);
        // particles[i + 1] = newy > 1.0 ? newy % 1.0 : (newy < 0.0 ? (1.0 - newy) : newy);
        // let newx = x;
        // let newy = y;
        let newx = x + sx * 20.0;
        let newy = y + sy * 1.0;
        for (let j = i + particleDataSize; j < particles.length; j += particleDataSize) {
        // for (let j = 0; j < particles.length; j += particleDataSize) {
            // if (i == j) continue;
            const jx = particles[j + 0];
            const jy = particles[j + 1];
            const jradius = particles[j + 2];
            const dist = vec2_dist({x: newx, y: newy}, {x: jx, y: jy});
            if (dist >= (radius + jradius)) { continue; }
            let dir = vec2_sub({x: newx, y: newy}, {x: jx, y: jy});
            dir = vec2_unit(dir);
            dir = vec2_mul(dir, (radius + jradius) - dist);
            dir = vec2_mul(dir, 0.5);

            // particles[j + 0] += -dir.x;
            // particles[j + 1] += -dir.y;

            let jnewx = jx - dir.x;
            let jnewy = jy - dir.y;
            particles[j + 0] = Math.min(cx - jradius, Math.max(jradius, jnewx));
            particles[j + 1] = Math.min(cx - jradius, Math.max(jradius, jnewy));

            // dir = vec2_mul(dir, 0.6);
            // dir = vec2_mul(dir, 0.05);
            newx += dir.x;
            newy += dir.y;

            newx = Math.min(cx - radius, Math.max(radius, newx));
            newy = Math.min(cx - radius, Math.max(radius, newy));
        }

        newx = Math.min(cx - radius, Math.max(radius, newx));
        newy = Math.min(cx - radius, Math.max(radius, newy));
        particles[i + 0] = newx;
        particles[i + 1] = newy;
    }

    for (let i = 0; i < particles.length; i += particleDataSize) {
        const x = particles[i + 0];
        const y = particles[i + 1];
        const radius = particles[i + 2];
        const r = particles[i + 3];
        const g = particles[i + 4];
        const b = particles[i + 5];

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1.0)`;

        ctx.beginPath();
        ctx.arc(Math.floor(x), Math.floor(y), radius, 0, 2 * Math.PI);
        // ctx.moveTo(x * cx, y * cy);
        // ctx.lineTo(newx * cx, newy * cy);
        ctx.stroke();
    }
}

function step(timestamp) {
    if (!prev) {
        prev = timestamp;
        window.requestAnimationFrame(step);
        return;
    }

    // const delta = (timestamp - prev) / 1000.0;
    const delta = 1 / 60.0;

    render(ctx, particles, delta, timestamp);

    prev = timestamp;

    window.requestAnimationFrame(step);
}

// window.requestAnimationFrame(step);
// setInterval(() => {
//     window.requestAnimationFrame(step);
// }, 100);

window.requestAnimationFrame(step);

// step(0.0);

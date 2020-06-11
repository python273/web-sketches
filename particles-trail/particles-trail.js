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

const numOfParticles = 1000;

const particleSize = 7;
const particles = new Float64Array(numOfParticles * particleSize);
function initParticles(particles) {
    for (let i = 0; i < particles.length; i += particleSize) {
        const rad = Math.random() * Math.PI * 2
        let sx = Math.cos(rad);
        let sy = Math.sin(rad);
        // const dist = lenOfVec2(sx, sy);
        // sx /= dist;
        // sy /= dist;
        sx /= 16.0;
        sy /= 16.0;

        particles[i + 0] = Math.random();
        particles[i + 1] = Math.random();
        particles[i + 2] = sx;
        particles[i + 3] = sy;
        particles[i + 4] = 255.0;
        particles[i + 5] = 64.0 + Math.random() * 127.0;
        particles[i + 6] = 64.0 + Math.random() * 127.0;
    }
}
initParticles(particles);

const cx = canvas.clientWidth;
const cy = canvas.clientHeight;

ctx.fillStyle = 'white';
ctx.fillRect(0, 0, cx, cy);
ctx.fillStyle = 'black';

var prev = null;

function lenOfVec2(x, y) {
    return Math.sqrt(x ** 2 + y ** 2)
}


function distBetween(x1, y1, x2, y2) {
    return Math.sqrt((x1-x2) ** 2 + (y1-y2) ** 2)
}


function render(ctx, particles, d, timestamp) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, cx, cy);

    for (let i = 0; i < particles.length; i += particleSize) {
        const x = particles[i + 0];
        const y = particles[i + 1];
        const sx = particles[i + 2];
        const sy = particles[i + 3];
        const r = particles[i + 4];
        const g = particles[i + 5];
        const b = particles[i + 6];

        // const newx = x + (sx * d) + Math.cos(timestamp / 20000.0)/200.0;
        // const newy = y + (sy * d) + Math.sin(timestamp / 20000.0)/200.0;

        const newx = x + (sx * d);
        const newy = y + (sy * d);

        particles[i + 0] = newx > 1.0 ? newx % 1.0 : (newx < 0.0 ? (1.0 - newx): newx);
        particles[i + 1] = newy > 1.0 ? newy % 1.0 : (newy < 0.0 ? (1.0 - newy) : newy);

        // particles[i + 0] = newx > 1.0 ? 1.0 : (newx < 0.0 ? 0.0 : newx);
        // particles[i + 1] = newy > 1.0 ? 1.0 : (newy < 0.0 ? 0.0 : newy);
        // particles[i + 2] = ((0.0 < newx && newx < 1.0) ? sx : -sx);
        // particles[i + 3] = ((0.0 < newy && newy < 1.0) ? sy : -sy);

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1.0)`;

        ctx.beginPath();
        ctx.moveTo(x * cx, y * cy);
        ctx.lineTo(newx * cx, newy * cy);
        ctx.stroke();
    }
}

function step(timestamp) {
    if (!prev) {
        prev = timestamp;
        window.requestAnimationFrame(step);
        return;
    }

    const delta = (timestamp - prev) / 1000.0;

    render(ctx, particles, delta, timestamp);

    prev = timestamp;

    window.requestAnimationFrame(step);
}

// for (let i = 0; i < 30; i++) {
//     render(ctx, particles, 1.0 / 30.0);
// }

window.requestAnimationFrame(step);

// window.requestAnimationFrame(step);
// setTimeout(() => {
//     window.requestAnimationFrame(step);
// }, 100);

// setInterval(() => {
//     window.requestAnimationFrame(step);
// }, 100);

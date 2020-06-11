document.addEventListener('gesturestart', event => event.preventDefault(), false);
document.addEventListener('contextmenu', event => event.preventDefault(), false);

let cx = null;
let cy = null;
let blockSize = 20;
const gap = 4;
let fullSize = blockSize + gap;

const mapWidth = 10;
const mapHeight = 20;

function createCanvas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {alpha: false});
    updateCanvasSizeToWindow(canvas, ctx);
    document.body.appendChild(canvas);

    window.onresize = () => {updateCanvasSizeToWindow(canvas, ctx)};

    return [canvas, ctx];
}

function updateCanvasSizeToWindow(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;

    cx = window.innerWidth;
    cy = window.innerHeight;

    // console.log('Window Size:', dpr, cx, cy);

    canvas.width = cx * dpr;
    canvas.height = cy * dpr;
    canvas.style.width = `${cx}px`;
    canvas.style.height = `${cy}px`;

    ctx.scale(dpr, dpr);

    blockSize = Math.min(
        ((cx - (10 * 2)) / (mapWidth + 4)) - gap,
        ((cy - (10 * 2)) / mapHeight) - gap,
    );
    fullSize = blockSize + gap;
}

const [canvas, ctx] = createCanvas();

const actionListeners = {};
function addActionListener(action, fn) {
    if (typeof actionListeners[action] === 'undefined') {
        actionListeners[action] = [];
    }

    actionListeners[action].push(fn);
}

function actionStart(action) {
    const wasActive = activeActions[action];
    activeActions[action] = true;

    const listeners = actionListeners[action];
    if (listeners) listeners.forEach(fn => fn(true, wasActive));
}

function actionEnd(action) {
    const wasActive = activeActions[action];
    activeActions[action] = false;
    const listeners = actionListeners[action];
    if (listeners) listeners.forEach(fn => fn(false, wasActive));
}

document.addEventListener("keydown", event => {
    const action = keyActions[event.keyCode];

    // console.log('keydown', action, event.keyCode);

    if (action) actionStart(action);
}, false);

document.addEventListener("keyup", event => {
    const action = keyActions[event.keyCode];

    if (action) actionEnd(action);
}, false);

let touchControls = false;
const pendingTouches = {};

function handleTouchStartMove(event) {
    touchControls = true;

    // for (let touch in event.changedTouches) 

    Array.from(event.changedTouches).forEach(touch => {
        pendingTouches[touch.identifier] = {
            clientX: touch.pageX,
            clientY: touch.pageY,
        };
    });
}
canvas.addEventListener("touchstart", handleTouchStartMove, false);
canvas.addEventListener("touchmove", handleTouchStartMove, false);

function handleStopTouch(event) {
    Array.from(event.changedTouches).forEach(touch => {
        pendingTouches[touch.identifier] = undefined;
    });
}

canvas.addEventListener("touchend", handleStopTouch, false);
canvas.addEventListener("touchcancel", handleStopTouch, false);

function handleTouchControls() {
    const newActiveActions = {
        'left': false,
        'right': false,
        'down': false,
        'rotate': false,
    };

    for (let touchId in pendingTouches) {
        const touch = pendingTouches[touchId];
        if (!touch) continue;

        const y = touch.clientY > (window.innerHeight - (window.innerHeight / 5.0));
        if (y) {
            newActiveActions['down'] = true;
            continue;
        }

        const x = Math.floor(touch.clientX / (window.innerWidth / 3.0));
        if (x === 0) {
            newActiveActions['left'] = true;
        } else if (x === 1) {
            newActiveActions['rotate'] = true;
        } else if (x === 2) {
            newActiveActions['right'] = true;
        }
    }

    // console.log(activeActions, newActiveActions);

    for (let action in newActiveActions) {
        if (newActiveActions[action] && !activeActions[action]) {
            actionStart(action);
        } else if (!newActiveActions[action] && activeActions[action]) {
            actionEnd(action);
        }
    }
}

const keyActions = {
    37: 'left',
    39: 'right',
    65: 'left',
    68: 'right',
    40: 'down',
    83: 'down',
    32: 'rotate',
    38: 'rotate',
    87: 'rotate',
};
const activeActions = {
    'left': false,
    'right': false,
    'down': false,
    'rotate': false,
};

const blockTypes = [
    // XXX
    //  X
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 1, 1, 1],  // _ _ * _
            [0, 0, 1, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 1],
            [0, 0, 1, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 1, 1, 1],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 0],
        ],
    ],
    // XXX
    //   X
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 1, 1, 1],  // _ _ * _
            [0, 0, 0, 1],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 1],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 1, 1],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 1, 1, 0],
        ],
    ],
    // XX
    //  XX
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 1],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 0, 1],
            [0, 0, 1, 1],
            [0, 0, 1, 0],
        ],
    ],
    // XX
    // XX
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 1, 1, 0],
            [0, 1, 1, 0],
        ],
    ],
    //  XX
    // XX
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 1, 1],
            [0, 1, 1, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 1],
            [0, 0, 0, 1],
        ],
    ],
    // XXX
    // X
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 1, 1, 1],  // _ _ * _
            [0, 1, 0, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 1],
        ],
        [
            [0, 0, 0, 0],
            [0, 0, 0, 1],
            [0, 1, 1, 1],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
        ],
    ],
    // XXXX
    [
        [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [1, 1, 1, 1],  // _ _ * _
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
        ],
    ]
];


const colors = [
    '#111111',
    '#ff0000',
    '#ffff00',
    '#00ffff',
    '#00ff00',
]




const map = new Uint8Array(mapWidth * mapHeight);

function render(
    ctx,
    map,
    currentBlockIndex, currentBlockRotationIndex,
    currentBlockX, currentBlockY,
    nextBlockIndex
) {
    const currentBlock = blockTypes[currentBlockIndex][currentBlockRotationIndex];
    const nextBlock = blockTypes[nextBlockIndex][0];

    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(0, 0, cx, cy);

    for (let x = 0; x < mapWidth; x++) {
        for (let y = 0; y < mapHeight; y++) {
            const currentBlockTouching = (
                x >= currentBlockX && x < currentBlockX + 4
                && y >= currentBlockY && y < currentBlockY + 4
            );

            let cb = 0;
            if (currentBlockTouching) {
                const cby = y - currentBlockY;
                const cbx = x - currentBlockX;

                cb = currentBlock[cby][cbx];
            }

            const b = cb > 0 ? currentBlockColorIndex : map[y * mapWidth + x];

            ctx.fillStyle = colors[b % colors.length];
            ctx.fillRect(
                10 + x * fullSize,
                10 + y * fullSize,
                blockSize, blockSize
            );
        }
    }

    for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
            const b = nextBlock[y][x];
            if (b === 0) continue;

            ctx.fillStyle = colors[1];
            ctx.fillRect(
                10 + (mapWidth * fullSize) + x * fullSize,
                10 + y * fullSize,
                blockSize, blockSize
            );
        }
    }
}

let prev = null;

let currentBlockIndex = 0;
let nextBlockIndex = 0;

let currentBlockRotationIndex = 0;
let currentBlockColorIndex = 0;
let currentBlockX = 0;
let currentBlockY = 0;

let prevMoveTick = 0;
let prevInputTick = 0;

let gameStartTs = null;

// let movingDownTicksDelay = 250000;
let movingDownTicksDelay = 350000;
let movingDownTicksSpeedup = 0;
const movingDownTicksSpeedupSpeed = 350000 - (250000 - 200000);
let inputTicksDelay = 50000;

function newBlock() {
    currentBlockIndex = nextBlockIndex;
    currentBlockRotationIndex = 0;
    currentBlockX = 3;
    currentBlockY = -2;

    nextBlockIndex = Math.floor(Math.random() * blockTypes.length);

    // first color is empty
    newBlockColorIndex = currentBlockColorIndex;
    while (newBlockColorIndex == currentBlockColorIndex) {
        newBlockColorIndex = 1 + Math.floor(Math.random() * (colors.length - 1));
    }
    currentBlockColorIndex = newBlockColorIndex;

    return checkColliding(map, getCurrentBlock(), currentBlockX, currentBlockY);
}


function resetGame() {
    currentBlockIndex = 0;
    nextBlockIndex = Math.floor(Math.random() * blockTypes.length);
    currentBlockColorIndex = 0;
    currentBlockX = 0;
    currentBlockY = 0;
    prevMoveTick = 0;
    prevInputTick = 0;

    for (let i = 0; i < map.length; i++) {
        map[i] = 0;
    }

    newBlock();
}


function checkColliding(map, currentBlock, currentBlockX, currentBlockY, enforceWithinMap = false) {
    for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
            if (currentBlock[y][x] == 0) continue;

            const currentPixX = currentBlockX + x;
            const currentPixY = currentBlockY + y;
            
            // ignore ceiling collisions for rotation
            if (currentPixY < 0) continue;

            // floor
            if (currentPixY >= mapHeight) return true; 

            // walls
            if (currentPixX < 0 || currentPixX >= mapWidth) return true;

            const b = map[currentPixY * mapWidth + currentPixX];

            if (b != 0) return true;
        }
    }

    return false;
}

function commitBlock(map, currentBlock, currentBlockX, currentBlockY) {
    const currentBlockWidth = 4;
    const currentBlockHeight = 4;

    for (let x = 0; x < currentBlockWidth; x++) {
        for (let y = 0; y < currentBlockHeight; y++) {
            const cb = currentBlock[y][x]
            if (cb == 0) continue;

            const currentPixX = currentBlockX + x;
            const currentPixY = currentBlockY + y;

            const notInMap = (
                currentPixX < 0 || currentPixY < 0 ||
                currentPixX >= mapWidth || currentPixY >= mapHeight
            );
            if (notInMap) continue;

            map[currentPixY * mapWidth + currentPixX] = currentBlockColorIndex;
        }
    }
}

function clearLine(map, lineY) {
    for (let y = lineY; y > 1; y--) {
        for (let x = 0; x < mapWidth; x++) {
            map[y * mapWidth + x] = map[(y - 1) * mapWidth + x];
        }
    }
}

function checkFilledLines(map) {
    for (let y = 0; y < mapHeight; y++) {
        let numFilledOnLine = 0;

        for (let x = 0; x < mapWidth; x++) {
            const b = map[y * mapWidth + x];
            numFilledOnLine += b != 0 ? 1 : 0;
        }

        if (numFilledOnLine === mapWidth) clearLine(map, y);
    }
}

function handleRotate(isActive = true, wasActive = false) {
    if (!isActive) return;
    if (wasActive) return;

    const newBlockRotationIndex = (
        (currentBlockRotationIndex + 1) % blockTypes[currentBlockIndex].length
    );

    const rotatedBlock = blockTypes[currentBlockIndex][newBlockRotationIndex];

    const isColliding = checkColliding(map, rotatedBlock, currentBlockX, currentBlockY);

    if (!isColliding) currentBlockRotationIndex = newBlockRotationIndex;
}
addActionListener('rotate', handleRotate);

function handleDown(isActive = true, wasActive = false) {
    movingDownTicksSpeedup = isActive ? movingDownTicksSpeedupSpeed : 0;
}
addActionListener('down', handleDown);


function getCurrentBlock() {
    return blockTypes[currentBlockIndex][currentBlockRotationIndex];
}

// setInterval(() => {
//     if (touchControls) handleTouchControls();
// }, 1000.0 / 60.0);

function step(timestamp) {
    if (prev === null) {
        prev = timestamp;
        gameStartTs = timestamp;
        newBlock();
        window.requestAnimationFrame(step);
        return;
    }

    if (touchControls) handleTouchControls();

    let tick = Math.floor((timestamp - gameStartTs) * 1000.0);

    if ((tick - prevInputTick) > inputTicksDelay) {
        prevInputTick = tick;

        if (activeActions.left) {
            const isColliding = checkColliding(
                map, getCurrentBlock(),
                currentBlockX - 1, currentBlockY
            );
            if (!isColliding) currentBlockX -= 1;
        }
        if (activeActions.right) {
            const isColliding = checkColliding(
                map, getCurrentBlock(),
                currentBlockX + 1, currentBlockY
            );
            if (!isColliding) currentBlockX += 1;
        }
    }

    if ((tick - prevMoveTick) > (movingDownTicksDelay - movingDownTicksSpeedup)) {  // can jump over some ticks
        prevMoveTick = tick;

        currentBlockY += 1;

        const isColliding = checkColliding(
            map, getCurrentBlock(),
            currentBlockX, currentBlockY
        );

        if (isColliding) {
            currentBlockY -= 1;

            commitBlock(map, getCurrentBlock(), currentBlockX, currentBlockY);
            checkFilledLines(map);

            const touchingTop = newBlock();
            if (touchingTop) {
                commitBlock(map, getCurrentBlock(), currentBlockX, currentBlockY);

                render(
                    ctx, map,
                    currentBlockIndex, currentBlockRotationIndex,
                    currentBlockX, currentBlockY,
                    nextBlockIndex
                );
                ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
                ctx.fillRect(0, 0, cx, cy);
                return;  // game over
            }
        }
    }

    render(
        ctx, map,
        currentBlockIndex, currentBlockRotationIndex,
        currentBlockX, currentBlockY,
        nextBlockIndex
    );

    prev = timestamp;

    window.requestAnimationFrame(step);
}

window.requestAnimationFrame(step);

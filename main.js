// ========== CONFIGURATION ==========
const COLORS = [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
    '#1dd1a1', '#5f27cd', '#ff9f43', '#00d2d3'
];

const MAZE_SIZE = 35;
const MOVE_DURATION = 80;
const DYNAMIC_TILE_INTERVAL = 4000; // 4초마다 특수 타일 변경

// Tile types
const TILE = {
    WALL: 1,
    PATH: 0,
    BOOST: 2,      // 2배 속도
    SLOW: 3,       // 0.3배 속도
    PORTAL_A: 4,
    PORTAL_B: 5,
    LIGHTNING: 6,  // 8칸 점프
    FREEZE: 7,     // 2초 정지
    REVERSE: 8     // 5칸 후퇴
};

// ========== GAME STATE ==========
let players = [];
let maze = [];
let mazeWidth = MAZE_SIZE;
let mazeHeight = MAZE_SIZE;
let cellSize = 18;
let exitPos = { x: 0, y: 0 };
let portalA = null, portalB = null;
let dynamicTiles = [];

let canvas, ctx, particleCanvas, particleCtx, minimapCanvas, minimapCtx;
let animationId = null;
let dynamicTileTimer = null;
let raceStarted = false;
let raceStartTime = 0;
let finishOrder = [];
let particles = [];
let revealedCells = new Set();
let eventLog = [];
let gameStats = { boosts: 0, slows: 0, portals: 0, lightnings: 0, freezes: 0, reverses: 0 };

// Options
let enableFog = true;
let enableSpecialTiles = true;
let enableDynamicTiles = true;
let soundEnabled = true;

// Audio
let audioCtx = null;

// ========== AUDIO SYSTEM ==========
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!soundEnabled || !audioCtx) return;
    try {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function playCountdownBeep() { playTone(440, 0.15, 'sine', 0.4); }
function playStartSound() { playTone(880, 0.3, 'sine', 0.5); setTimeout(() => playTone(1100, 0.4, 'sine', 0.5), 100); }
function playFinishSound(isFirst) {
    if (isFirst) {
        playTone(523, 0.15, 'sine', 0.4);
        setTimeout(() => playTone(659, 0.15, 'sine', 0.4), 150);
        setTimeout(() => playTone(784, 0.3, 'sine', 0.5), 300);
    } else {
        playTone(600, 0.2, 'triangle', 0.3);
    }
}
function playBoostSound() { playTone(800, 0.1, 'sine', 0.2); setTimeout(() => playTone(1000, 0.1, 'sine', 0.2), 50); }
function playSlowSound() { playTone(200, 0.2, 'sawtooth', 0.15); }
function playPortalSound() { playTone(400, 0.1, 'sine', 0.3); setTimeout(() => playTone(800, 0.15, 'sine', 0.3), 100); }
function playLightningSound() { playTone(1200, 0.1, 'sine', 0.4); setTimeout(() => playTone(1500, 0.15, 'sine', 0.4), 50); }
function playFreezeSound() { playTone(150, 0.3, 'sine', 0.3); }
function playReverseSound() { playTone(300, 0.1, 'sawtooth', 0.3); setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.3), 100); }
function playNewTileSound() { playTone(600, 0.1, 'triangle', 0.2); }

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('soundToggle');
    btn.textContent = soundEnabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabled);
}

// ========== PARTICLE SYSTEM ==========
function createParticles(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
        const speed = 2 + Math.random() * 4;
        particles.push({
            x: x * cellSize + cellSize / 2,
            y: y * cellSize + cellSize / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: 0.02 + Math.random() * 0.02,
            color: color,
            size: 2 + Math.random() * 2
        });
    }
}

function createFirework(x, y) {
    const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#1dd1a1', '#fff'];
    for (let i = 0; i < 50; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        particles.push({
            x: x * cellSize + cellSize / 2,
            y: y * cellSize + cellSize / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: 0.01 + Math.random() * 0.01,
            color: color,
            size: 2 + Math.random() * 4,
            gravity: 0.1
        });
    }
}

function updateParticles() {
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.gravity) p.vy += p.gravity;
        p.life -= p.decay;
        return p.life > 0;
    });
}

function renderParticles() {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    particles.forEach(p => {
        particleCtx.globalAlpha = p.life;
        particleCtx.fillStyle = p.color;
        particleCtx.beginPath();
        particleCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        particleCtx.fill();
    });
    particleCtx.globalAlpha = 1;
}

// ========== UTILITY ==========
function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function addEventLog(message) {
    const time = ((performance.now() - raceStartTime) / 1000).toFixed(1);
    eventLog.unshift({ time, message });
    if (eventLog.length > 20) eventLog.pop();
    updateEventLogUI();
}

function updateEventLogUI() {
    const container = document.getElementById('eventLog');
    if (!container) return;
    container.innerHTML = eventLog.slice(0, 8).map(e =>
        `<div class="event-item">[${e.time}s] ${e.message}</div>`
    ).join('');
}

function showEventBanner(text) {
    const banner = document.getElementById('eventBanner');
    banner.textContent = text;
    banner.classList.add('active');
    setTimeout(() => banner.classList.remove('active'), 1500);
}

// ========== PLAYER INPUTS ==========
function initPlayerInputs() {
    const count = parseInt(document.getElementById('playerCount').value);
    const container = document.getElementById('playerInputs');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'player-input';
        div.innerHTML = `
            <div class="player-color" style="background: ${COLORS[i]}; color: ${COLORS[i]}"></div>
            <input type="text" id="player${i}" placeholder="참가자 ${i + 1}" maxlength="8">
        `;
        container.appendChild(div);
    }
}

// ========== SCREEN MANAGEMENT ==========
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ========== MAZE GENERATION ==========
function generateMaze() {
    maze = [];
    for (let y = 0; y < mazeHeight; y++) {
        maze[y] = [];
        for (let x = 0; x < mazeWidth; x++) {
            maze[y][x] = TILE.WALL;
        }
    }

    const stack = [{ x: 1, y: 1 }];
    maze[1][1] = TILE.PATH;

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const directions = [
            { dx: 0, dy: -2 }, { dx: 2, dy: 0 },
            { dx: 0, dy: 2 }, { dx: -2, dy: 0 }
        ];

        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        let found = false;
        for (const dir of directions) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;
            if (nx > 0 && nx < mazeWidth - 1 && ny > 0 && ny < mazeHeight - 1 && maze[ny][nx] === TILE.WALL) {
                maze[current.y + dir.dy / 2][current.x + dir.dx / 2] = TILE.PATH;
                maze[ny][nx] = TILE.PATH;
                stack.push({ x: nx, y: ny });
                found = true;
                break;
            }
        }
        if (!found) stack.pop();
    }

    exitPos = { x: mazeWidth - 2, y: mazeHeight - 2 };
    maze[exitPos.y][exitPos.x] = TILE.PATH;

    if (enableSpecialTiles) addInitialSpecialTiles();
}

function getPathCells() {
    const cells = [];
    for (let y = 1; y < mazeHeight - 1; y++) {
        for (let x = 1; x < mazeWidth - 1; x++) {
            if (maze[y][x] === TILE.PATH && !(x === exitPos.x && y === exitPos.y)) {
                cells.push({ x, y });
            }
        }
    }
    return cells;
}

function addInitialSpecialTiles() {
    const pathCells = getPathCells();
    for (let i = pathCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pathCells[i], pathCells[j]] = [pathCells[j], pathCells[i]];
    }

    let idx = 0;

    // Initial tiles
    for (let i = 0; i < 3 && idx < pathCells.length; i++, idx++) {
        maze[pathCells[idx].y][pathCells[idx].x] = TILE.BOOST;
    }
    for (let i = 0; i < 3 && idx < pathCells.length; i++, idx++) {
        maze[pathCells[idx].y][pathCells[idx].x] = TILE.SLOW;
    }
    for (let i = 0; i < 2 && idx < pathCells.length; i++, idx++) {
        maze[pathCells[idx].y][pathCells[idx].x] = TILE.LIGHTNING;
    }
    for (let i = 0; i < 2 && idx < pathCells.length; i++, idx++) {
        maze[pathCells[idx].y][pathCells[idx].x] = TILE.FREEZE;
    }
    for (let i = 0; i < 2 && idx < pathCells.length; i++, idx++) {
        maze[pathCells[idx].y][pathCells[idx].x] = TILE.REVERSE;
    }

    // Portals
    if (idx + 1 < pathCells.length) {
        portalA = pathCells[idx];
        portalB = pathCells[idx + 1];
        maze[portalA.y][portalA.x] = TILE.PORTAL_A;
        maze[portalB.y][portalB.x] = TILE.PORTAL_B;
    }
}

function spawnDynamicTiles() {
    if (!enableDynamicTiles || !raceStarted) return;

    // Clear old dynamic tiles
    dynamicTiles.forEach(t => {
        if (maze[t.y][t.x] === t.type) {
            maze[t.y][t.x] = TILE.PATH;
        }
    });
    dynamicTiles = [];

    const pathCells = getPathCells();
    if (pathCells.length < 5) return;

    // Shuffle
    for (let i = pathCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pathCells[i], pathCells[j]] = [pathCells[j], pathCells[i]];
    }

    // Spawn new tiles
    const tileTypes = [TILE.BOOST, TILE.SLOW, TILE.LIGHTNING, TILE.FREEZE, TILE.REVERSE];
    const count = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < count && i < pathCells.length; i++) {
        const type = tileTypes[Math.floor(Math.random() * tileTypes.length)];
        const cell = pathCells[i];

        // Don't place on player positions
        const onPlayer = players.some(p =>
            Math.floor(p.renderX) === cell.x && Math.floor(p.renderY) === cell.y
        );

        if (!onPlayer && maze[cell.y][cell.x] === TILE.PATH) {
            maze[cell.y][cell.x] = type;
            dynamicTiles.push({ x: cell.x, y: cell.y, type });
            createParticles(cell.x, cell.y, getTileColor(type), 8);
        }
    }

    playNewTileSound();
    showEventBanner('⚡ 새로운 아이템 등장!');
    addEventLog('새로운 아이템들이 나타났다!');
}

// ========== PATHFINDING ==========
function findPath(startX, startY, endX, endY) {
    const queue = [{ x: startX, y: startY, path: [] }];
    const visited = new Set();
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.x === endX && current.y === endY) {
            return [...current.path, { x: current.x, y: current.y }];
        }

        const directions = [
            { dx: 0, dy: -1 }, { dx: 1, dy: 0 },
            { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
        ];

        for (const dir of directions) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;
            const key = `${nx},${ny}`;

            if (nx >= 0 && nx < mazeWidth && ny >= 0 && ny < mazeHeight &&
                maze[ny][nx] !== TILE.WALL && !visited.has(key)) {
                visited.add(key);
                queue.push({
                    x: nx, y: ny,
                    path: [...current.path, { x: current.x, y: current.y }]
                });
            }
        }
    }
    return [];
}

function getStartPositions(count) {
    const positions = [];
    const usedPositions = new Set();
    const startAreas = [
        { x: 1, y: 1 },
        { x: mazeWidth - 2, y: 1 },
        { x: 1, y: mazeHeight - 2 },
        { x: Math.floor(mazeWidth / 2), y: 1 },
        { x: 1, y: Math.floor(mazeHeight / 2) },
        { x: mazeWidth - 2, y: Math.floor(mazeHeight / 2) },
        { x: Math.floor(mazeWidth / 2), y: mazeHeight - 2 },
        { x: Math.floor(mazeWidth / 4), y: Math.floor(mazeHeight / 4) }
    ];

    for (let i = 0; i < count && i < startAreas.length; i++) {
        const area = startAreas[i];
        let found = false;
        for (let r = 0; r < 10 && !found; r++) {
            for (let dy = -r; dy <= r && !found; dy++) {
                for (let dx = -r; dx <= r && !found; dx++) {
                    const x = area.x + dx;
                    const y = area.y + dy;
                    const key = `${x},${y}`;
                    if (x > 0 && x < mazeWidth - 1 && y > 0 && y < mazeHeight - 1 &&
                        maze[y][x] !== TILE.WALL && !usedPositions.has(key) &&
                        !(x === exitPos.x && y === exitPos.y)) {
                        positions.push({ x, y });
                        usedPositions.add(key);
                        found = true;
                    }
                }
            }
        }
    }
    return positions;
}

// ========== RENDERING ==========
function getTileColor(tile) {
    switch (tile) {
        case TILE.BOOST: return '#27ae60';
        case TILE.SLOW: return '#9b59b6';
        case TILE.PORTAL_A:
        case TILE.PORTAL_B: return '#3498db';
        case TILE.LIGHTNING: return '#f1c40f';
        case TILE.FREEZE: return '#00cec9';
        case TILE.REVERSE: return '#e74c3c';
        default: return '#1a1a2e';
    }
}

function getTileIcon(tile) {
    switch (tile) {
        case TILE.BOOST: return '⚡';
        case TILE.SLOW: return '🐌';
        case TILE.PORTAL_A:
        case TILE.PORTAL_B: return '🌀';
        case TILE.LIGHTNING: return '⚡';
        case TILE.FREEZE: return '❄️';
        case TILE.REVERSE: return '↩️';
        default: return '';
    }
}

function drawMazeBackground() {
    for (let y = 0; y < mazeHeight; y++) {
        for (let x = 0; x < mazeWidth; x++) {
            const tile = maze[y][x];

            if (tile === TILE.WALL) {
                const gradient = ctx.createLinearGradient(
                    x * cellSize, y * cellSize,
                    (x + 1) * cellSize, (y + 1) * cellSize
                );
                gradient.addColorStop(0, '#2c3e50');
                gradient.addColorStop(1, '#34495e');
                ctx.fillStyle = gradient;
            } else if (tile !== TILE.PATH) {
                ctx.fillStyle = getTileColor(tile);
            } else {
                ctx.fillStyle = '#1a1a2e';
            }

            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

            // Draw tile icons
            const icon = getTileIcon(tile);
            if (icon && tile !== TILE.PATH && tile !== TILE.WALL) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = `${cellSize * 0.55}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(icon, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
            }
        }
    }

    // Exit
    ctx.shadowColor = '#2ecc71';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.arc(exitPos.x * cellSize + cellSize / 2, exitPos.y * cellSize + cellSize / 2, cellSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `${cellSize - 4}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚩', exitPos.x * cellSize + cellSize / 2, exitPos.y * cellSize + cellSize / 2);
}

function drawFog() {
    if (!enableFog) return;
    ctx.fillStyle = 'rgba(15, 12, 41, 0.85)';
    for (let y = 0; y < mazeHeight; y++) {
        for (let x = 0; x < mazeWidth; x++) {
            if (!revealedCells.has(`${x},${y}`)) {
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
    }
}

function revealArea(x, y, radius = 2) {
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < mazeWidth && ny >= 0 && ny < mazeHeight) {
                revealedCells.add(`${nx},${ny}`);
            }
        }
    }
}

function drawPlayer(x, y, color, initial, isFinished, isFrozen) {
    const px = x * cellSize + cellSize / 2;
    const py = y * cellSize + cellSize / 2;
    const radius = cellSize / 2 - 2;

    ctx.shadowColor = isFrozen ? '#00cec9' : color;
    ctx.shadowBlur = isFinished ? 25 : 12;

    ctx.fillStyle = isFrozen ? '#00cec9' : color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${cellSize * 0.45}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial.toUpperCase(), px, py);

    if (isFrozen) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `${cellSize * 0.4}px sans-serif`;
        ctx.fillText('❄️', px, py - cellSize * 0.5);
    }
}

function drawPathTrail(player, colorIndex) {
    if (player.visitedPath.length < 2) return;
    const color = COLORS[colorIndex];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < player.visitedPath.length; i++) {
        const prev = player.visitedPath[i - 1];
        const curr = player.visitedPath[i];
        const alpha = 0.15 + (i / player.visitedPath.length) * 0.35;
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(prev.x * cellSize + cellSize / 2, prev.y * cellSize + cellSize / 2);
        ctx.lineTo(curr.x * cellSize + cellSize / 2, curr.y * cellSize + cellSize / 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawMinimap() {
    const scale = 3;
    minimapCanvas.width = mazeWidth * scale;
    minimapCanvas.height = mazeHeight * scale;

    for (let y = 0; y < mazeHeight; y++) {
        for (let x = 0; x < mazeWidth; x++) {
            minimapCtx.fillStyle = maze[y][x] === TILE.WALL ? '#34495e' : '#1a1a2e';
            minimapCtx.fillRect(x * scale, y * scale, scale, scale);
        }
    }

    minimapCtx.fillStyle = '#2ecc71';
    minimapCtx.fillRect(exitPos.x * scale, exitPos.y * scale, scale, scale);

    players.forEach((player, i) => {
        minimapCtx.fillStyle = COLORS[i];
        minimapCtx.beginPath();
        minimapCtx.arc(player.renderX * scale + scale / 2, player.renderY * scale + scale / 2, scale * 0.8, 0, Math.PI * 2);
        minimapCtx.fill();
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMazeBackground();
    players.forEach((player, i) => drawPathTrail(player, i));
    drawFog();

    players.forEach((player, i) => {
        if (!enableFog || revealedCells.has(`${Math.floor(player.renderX)},${Math.floor(player.renderY)}`)) {
            drawPlayer(player.renderX, player.renderY, COLORS[i], player.name.charAt(0), player.finished, player.frozen);
        }
    });

    drawMinimap();
    renderParticles();
}

function updateLiveRankings() {
    const rankings = players
        .map((p, i) => ({
            name: p.name,
            color: COLORS[i],
            progress: p.path.length > 1 ? p.pathIndex / (p.path.length - 1) : 0,
            finished: p.finished,
            frozen: p.frozen
        }))
        .sort((a, b) => b.progress - a.progress);

    const container = document.getElementById('liveRankings');
    if (!container) return;

    container.innerHTML = rankings.map((p, i) => `
        <div class="live-rank ${p.finished ? 'finished' : ''} ${i === 0 && !p.finished ? 'leading' : ''}">
            <span class="rank-num">${i + 1}</span>
            <span class="rank-dot" style="background: ${p.color}"></span>
            <span class="rank-name">${p.name}${p.frozen ? ' ❄️' : ''}</span>
            <span class="rank-progress">${Math.floor(p.progress * 100)}%</span>
        </div>
    `).join('');
}

function updateTimer() {
    if (!raceStarted) return;
    const elapsed = (performance.now() - raceStartTime) / 1000;
    const timerEl = document.getElementById('timerDisplay');
    if (timerEl) timerEl.textContent = elapsed.toFixed(1) + 's';
}

// ========== CANVAS INIT ==========
function initCanvas() {
    canvas = document.getElementById('mazeCanvas');
    ctx = canvas.getContext('2d');
    particleCanvas = document.getElementById('particleCanvas');
    particleCtx = particleCanvas.getContext('2d');
    minimapCanvas = document.getElementById('minimapCanvas');
    minimapCtx = minimapCanvas.getContext('2d');

    const maxSize = Math.min(window.innerWidth - 280, window.innerHeight - 200, 650);
    cellSize = Math.floor(maxSize / mazeWidth);

    canvas.width = mazeWidth * cellSize;
    canvas.height = mazeHeight * cellSize;
    particleCanvas.width = canvas.width;
    particleCanvas.height = canvas.height;
}

// ========== GAME FLOW ==========
function startGame() {
    initAudio();

    const count = parseInt(document.getElementById('playerCount').value);
    enableFog = document.getElementById('optFog').checked;
    enableSpecialTiles = document.getElementById('optSpecial').checked;
    enableDynamicTiles = document.getElementById('optDynamic').checked;

    players = [];
    finishOrder = [];
    raceStarted = false;
    particles = [];
    revealedCells = new Set();
    eventLog = [];
    dynamicTiles = [];
    gameStats = { boosts: 0, slows: 0, portals: 0, lightnings: 0, freezes: 0, reverses: 0 };
    portalA = null;
    portalB = null;

    for (let i = 0; i < count; i++) {
        const input = document.getElementById(`player${i}`);
        const name = input.value.trim() || `참가자 ${i + 1}`;
        players.push({
            name, x: 0, y: 0, renderX: 0, renderY: 0,
            path: [], pathIndex: 0, visitedPath: [],
            finished: false, finishTime: 0,
            animating: false, animStartTime: 0,
            animFromX: 0, animFromY: 0, animToX: 0, animToY: 0,
            speedMultiplier: 1, speedEffectUntil: 0,
            frozen: false, frozenUntil: 0
        });
    }

    generateMaze();

    const startPositions = getStartPositions(count);
    players.forEach((player, i) => {
        if (startPositions[i]) {
            player.x = startPositions[i].x;
            player.y = startPositions[i].y;
            player.renderX = player.x;
            player.renderY = player.y;
        }
        player.path = findPath(player.x, player.y, exitPos.x, exitPos.y);
        player.visitedPath = [{ x: player.x, y: player.y }];
        if (enableFog) revealArea(player.x, player.y, 2);
    });

    if (enableFog) revealArea(exitPos.x, exitPos.y, 1);

    updateLegend();

    document.getElementById('startRaceBtn').disabled = false;
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('gameTitle').textContent = '🧩 준비 완료!';
    document.getElementById('gameSubtitle').textContent = '레이스 시작 버튼을 누르세요';

    showScreen('mazeScreen');
    initCanvas();
    updateLiveRankings();
    render();
}

function updateLegend() {
    const legend = document.getElementById('legend');
    let html = players.map((p, i) => `
        <div class="legend-item">
            <div class="legend-color" style="background: ${COLORS[i]}"></div>
            <span>${p.name}</span>
        </div>
    `).join('');

    html += `<div class="legend-item"><div class="legend-color" style="background: #2ecc71"></div><span>🚩 출구</span></div>`;

    if (enableSpecialTiles) {
        html += `
            <div class="legend-item"><div class="legend-tile" style="background: #27ae60"></div><span>⚡ 부스트</span></div>
            <div class="legend-item"><div class="legend-tile" style="background: #9b59b6"></div><span>🐌 슬로우</span></div>
            <div class="legend-item"><div class="legend-tile" style="background: #f1c40f"></div><span>⚡ 점프</span></div>
            <div class="legend-item"><div class="legend-tile" style="background: #00cec9"></div><span>❄️ 정지</span></div>
            <div class="legend-item"><div class="legend-tile" style="background: #e74c3c"></div><span>↩️ 후퇴</span></div>
            <div class="legend-item"><div class="legend-tile" style="background: #3498db"></div><span>🌀 포탈</span></div>
        `;
    }

    legend.innerHTML = html;
}

async function startCountdown() {
    if (raceStarted) return;

    document.getElementById('startRaceBtn').disabled = true;
    const overlay = document.getElementById('countdownOverlay');
    const numberEl = document.getElementById('countdownNumber');

    overlay.classList.add('active');

    for (let i = 3; i >= 1; i--) {
        numberEl.textContent = i;
        numberEl.style.animation = 'none';
        numberEl.offsetHeight;
        numberEl.style.animation = 'countdownPop 0.5s ease';
        playCountdownBeep();
        await new Promise(r => setTimeout(r, 1000));
    }

    numberEl.textContent = 'GO!';
    numberEl.style.color = '#2ecc71';
    numberEl.style.animation = 'none';
    numberEl.offsetHeight;
    numberEl.style.animation = 'countdownPop 0.5s ease';
    playStartSound();

    await new Promise(r => setTimeout(r, 500));

    overlay.classList.remove('active');
    numberEl.style.color = '#fff';

    document.getElementById('gameTitle').textContent = '🏃 레이스 진행 중!';
    document.getElementById('gameSubtitle').textContent = '누가 먼저 탈출할까요?';

    startRace();
}

function startRace() {
    raceStarted = true;
    raceStartTime = performance.now();

    // Start dynamic tile spawning
    if (enableDynamicTiles) {
        dynamicTileTimer = setInterval(spawnDynamicTiles, DYNAMIC_TILE_INTERVAL);
    }

    function gameLoop(currentTime) {
        const elapsed = currentTime - raceStartTime;
        let allFinished = true;

        players.forEach((player, i) => {
            if (player.finished) return;

            // Check frozen
            if (player.frozen && currentTime > player.frozenUntil) {
                player.frozen = false;
            }
            if (player.frozen) {
                allFinished = false;
                return;
            }

            // Speed effect timeout
            if (currentTime > player.speedEffectUntil) {
                player.speedMultiplier = 1;
            }

            const effectiveDuration = MOVE_DURATION / player.speedMultiplier;
            const targetIndex = Math.min(Math.floor(elapsed / effectiveDuration), player.path.length - 1);

            if (targetIndex > player.pathIndex && !player.animating) {
                player.pathIndex++;
                if (player.pathIndex < player.path.length) {
                    const target = player.path[player.pathIndex];
                    player.animating = true;
                    player.animStartTime = currentTime;
                    player.animFromX = player.x;
                    player.animFromY = player.y;
                    player.animToX = target.x;
                    player.animToY = target.y;
                }
            }

            if (player.animating) {
                const effectiveDur = MOVE_DURATION / player.speedMultiplier;
                const animElapsed = currentTime - player.animStartTime;
                const progress = Math.min(animElapsed / effectiveDur, 1);
                const easedProgress = easeInOutQuad(progress);

                player.renderX = player.animFromX + (player.animToX - player.animFromX) * easedProgress;
                player.renderY = player.animFromY + (player.animToY - player.animFromY) * easedProgress;

                if (progress >= 1) {
                    player.x = player.animToX;
                    player.y = player.animToY;
                    player.renderX = player.x;
                    player.renderY = player.y;
                    player.animating = false;
                    player.visitedPath.push({ x: player.x, y: player.y });

                    if (enableFog) revealArea(player.x, player.y, 2);

                    // Check tiles
                    const tile = maze[player.y][player.x];
                    handleTileEffect(player, tile, i, currentTime);

                    // Check finish
                    if (player.x === exitPos.x && player.y === exitPos.y) {
                        player.finished = true;
                        player.finishTime = elapsed;
                        finishOrder.push({ ...player, color: COLORS[i] });
                        createFirework(player.x, player.y);
                        createFirework(player.x - 2, player.y - 1);
                        createFirework(player.x + 2, player.y - 1);
                        playFinishSound(finishOrder.length === 1);
                        addEventLog(`${player.name} 골인! (${finishOrder.length}등)`);
                    }
                }
            }

            if (!player.finished) allFinished = false;
        });

        // Update UI
        const avgProgress = players.reduce((sum, p) => sum + (p.pathIndex / Math.max(p.path.length - 1, 1)), 0) / players.length;
        document.getElementById('progressFill').style.width = `${avgProgress * 100}%`;

        updateParticles();
        updateLiveRankings();
        updateTimer();
        render();

        if (!allFinished) {
            animationId = requestAnimationFrame(gameLoop);
        } else {
            if (dynamicTileTimer) clearInterval(dynamicTileTimer);
            document.getElementById('gameTitle').textContent = '🏁 레이스 완료!';
            document.getElementById('gameSubtitle').textContent = '결과를 확인하세요';
            setTimeout(showResultScreen, 1200);
        }
    }

    animationId = requestAnimationFrame(gameLoop);
}

function handleTileEffect(player, tile, playerIndex, currentTime) {
    const name = player.name;

    switch (tile) {
        case TILE.BOOST:
            player.speedMultiplier = 2.5;
            player.speedEffectUntil = currentTime + 3000;
            createParticles(player.x, player.y, '#27ae60', 15);
            playBoostSound();
            addEventLog(`${name} 부스트! 🚀`);
            gameStats.boosts++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.SLOW:
            player.speedMultiplier = 0.3;
            player.speedEffectUntil = currentTime + 3000;
            createParticles(player.x, player.y, '#9b59b6', 15);
            playSlowSound();
            addEventLog(`${name} 슬로우... 🐌`);
            gameStats.slows++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.LIGHTNING:
            // Jump forward 8 steps
            const jumpSteps = Math.min(8, player.path.length - player.pathIndex - 1);
            if (jumpSteps > 0) {
                player.pathIndex += jumpSteps;
                const newPos = player.path[player.pathIndex];
                player.x = newPos.x;
                player.y = newPos.y;
                player.renderX = player.x;
                player.renderY = player.y;
                player.visitedPath.push({ x: player.x, y: player.y });
                if (enableFog) revealArea(player.x, player.y, 3);
            }
            createParticles(player.x, player.y, '#f1c40f', 25);
            playLightningSound();
            addEventLog(`${name} 번개 점프! ⚡`);
            gameStats.lightnings++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.FREEZE:
            player.frozen = true;
            player.frozenUntil = currentTime + 2500;
            createParticles(player.x, player.y, '#00cec9', 20);
            playFreezeSound();
            addEventLog(`${name} 빙결! ❄️`);
            gameStats.freezes++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.REVERSE:
            // Go back 5 steps
            const backSteps = Math.min(5, player.pathIndex);
            if (backSteps > 0) {
                player.pathIndex -= backSteps;
                const newPos = player.path[player.pathIndex];
                player.x = newPos.x;
                player.y = newPos.y;
                player.renderX = player.x;
                player.renderY = player.y;
            }
            createParticles(player.x, player.y, '#e74c3c', 20);
            playReverseSound();
            addEventLog(`${name} 후퇴! ↩️`);
            gameStats.reverses++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.PORTAL_A:
            if (portalB) {
                player.x = portalB.x;
                player.y = portalB.y;
                player.renderX = player.x;
                player.renderY = player.y;
                createParticles(portalA.x, portalA.y, '#3498db', 15);
                createParticles(portalB.x, portalB.y, '#3498db', 15);
                playPortalSound();
                if (enableFog) revealArea(player.x, player.y, 2);
                addEventLog(`${name} 포탈 이동! 🌀`);
                gameStats.portals++;
            }
            break;

        case TILE.PORTAL_B:
            if (portalA) {
                player.x = portalA.x;
                player.y = portalA.y;
                player.renderX = player.x;
                player.renderY = player.y;
                createParticles(portalB.x, portalB.y, '#3498db', 15);
                createParticles(portalA.x, portalA.y, '#3498db', 15);
                playPortalSound();
                if (enableFog) revealArea(player.x, player.y, 2);
                addEventLog(`${name} 포탈 이동! 🌀`);
                gameStats.portals++;
            }
            break;
    }
}

function showResultScreen() {
    finishOrder.sort((a, b) => a.finishTime - b.finishTime);

    const loserName = finishOrder[finishOrder.length - 1]?.name || '';
    document.getElementById('resultSubtitle').textContent = `${loserName}님이 벌칙 당첨! 🎯`;

    const resultList = document.getElementById('resultList');
    resultList.innerHTML = '';

    finishOrder.forEach((player, rank) => {
        const isLoser = rank === finishOrder.length - 1;
        const isWinner = rank === 0;
        const div = document.createElement('div');
        div.className = `result-item ${isLoser ? 'loser' : ''} ${isWinner ? 'winner' : ''}`;
        div.style.animationDelay = `${rank * 0.15}s`;

        let rankClass = '';
        if (rank === 0) rankClass = 'gold';
        else if (rank === 1) rankClass = 'silver';
        else if (rank === 2) rankClass = 'bronze';

        const timeStr = (player.finishTime / 1000).toFixed(2);

        div.innerHTML = `
            <div class="result-rank ${rankClass}">${rank + 1}</div>
            <div class="player-info">
                <div class="player-name">${player.name} ${isWinner ? '<span class="winner-crown">👑</span>' : ''}</div>
                <div class="player-time">거리: ${player.path.length}칸 · 시간: ${timeStr}초</div>
            </div>
            ${isLoser ? '<div class="loser-badge">🎯 벌칙!</div>' : ''}
            <div class="player-avatar" style="background: ${player.color}"></div>
        `;

        resultList.appendChild(div);
    });

    // Stats
    const totalTime = (finishOrder[finishOrder.length - 1]?.finishTime / 1000 || 0).toFixed(1);
    document.getElementById('statTotalTime').textContent = totalTime + '초';
    document.getElementById('statTotalItems').textContent =
        (gameStats.boosts + gameStats.slows + gameStats.lightnings + gameStats.freezes + gameStats.reverses + gameStats.portals) + '개';
    document.getElementById('statReversals').textContent = (gameStats.reverses + gameStats.freezes) + '회';

    showScreen('resultScreen');
}

function copyResult() {
    const lines = ['🏃 미로 탈출 게임 결과 🏃', ''];

    finishOrder.forEach((player, rank) => {
        const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;
        const isLoser = rank === finishOrder.length - 1;
        const timeStr = (player.finishTime / 1000).toFixed(2);
        lines.push(`${medal} ${player.name} - ${timeStr}초 ${isLoser ? '(벌칙!)' : ''}`);
    });

    lines.push('', '🎮 미로 탈출 게임으로 벌칙자를 정해보세요!');

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        alert('결과가 클립보드에 복사되었습니다!');
    });
}

function restart() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (dynamicTileTimer) {
        clearInterval(dynamicTileTimer);
        dynamicTileTimer = null;
    }
    raceStarted = false;
    finishOrder = [];
    particles = [];
    showScreen('startScreen');
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('playerCount').addEventListener('change', initPlayerInputs);
    initPlayerInputs();

    window.addEventListener('resize', () => {
        if (document.getElementById('mazeScreen').classList.contains('active')) {
            initCanvas();
            render();
        }
    });
});

// Export functions for HTML onclick
window.startGame = startGame;
window.startCountdown = startCountdown;
window.restart = restart;
window.copyResult = copyResult;
window.toggleSound = toggleSound;

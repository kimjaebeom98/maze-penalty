// ========== CONFIGURATION ==========
const COLORS = [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
    '#1dd1a1', '#5f27cd', '#ff9f43', '#00d2d3'
];

const MAZE_SIZE = 35;
const MOVE_DURATION = 140; // Slower for better visibility

// Tile types
const TILE = {
    WALL: 1,
    PATH: 0,
    BOOST: 2,      // 2.5배 속도
    SLOW: 3,       // 0.3배 속도
    PORTAL_A: 4,
    PORTAL_B: 5,
    LIGHTNING: 6,  // 8칸 점프
    FREEZE: 7,     // 2.5초 정지
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

let canvas, ctx, particleCanvas, particleCtx, minimapCanvas, minimapCtx;
let animationId = null;
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
function playItemCollectSound() { playTone(600, 0.1, 'triangle', 0.2); }

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('soundToggle');
    const icon = document.getElementById('soundIcon');
    btn.classList.toggle('muted', !soundEnabled);
    // Update icon
    if (icon) {
        icon.setAttribute('data-lucide', soundEnabled ? 'volume-2' : 'volume-x');
        lucide.createIcons();
    }
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
// Smoother easing function (cubic)
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Even smoother for special effects
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Event log icons (same as legend)
const EVENT_ICONS = {
    boost: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    slow: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#9b59b6" stroke-width="2"><path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-12 0Z"/><circle cx="10" cy="13" r="2"/></svg>',
    lightning: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#f1c40f" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>',
    freeze: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#00cec9" stroke-width="2"><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/></svg>',
    reverse: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    portal: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#3498db" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>',
    finish: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>'
};

function addEventLog(type, message) {
    const time = ((performance.now() - raceStartTime) / 1000).toFixed(1);
    const icon = EVENT_ICONS[type] || '';
    eventLog.unshift({ time, message, icon });
    if (eventLog.length > 20) eventLog.pop();
    updateEventLogUI();
}

function updateEventLogUI() {
    const container = document.getElementById('eventLog');
    if (!container) return;
    container.innerHTML = eventLog.slice(0, 8).map(e =>
        `<div class="event-item">${e.icon}<span class="event-time">[${e.time}s]</span> ${e.message}</div>`
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
    // Re-initialize icons after screen change
    setTimeout(() => lucide.createIcons(), 50);
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

    if (enableSpecialTiles) addSpecialTiles();
}

function getPathCells() {
    const cells = [];
    for (let y = 1; y < mazeHeight - 1; y++) {
        for (let x = 1; x < mazeWidth - 1; x++) {
            if (maze[y][x] === TILE.PATH && !(x === exitPos.x && y === exitPos.y)) {
                // Exclude starting area (top-left corner area)
                if (!(x < 5 && y < 5)) {
                    cells.push({ x, y });
                }
            }
        }
    }
    return cells;
}

function addSpecialTiles() {
    const pathCells = getPathCells();
    // Shuffle path cells
    for (let i = pathCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pathCells[i], pathCells[j]] = [pathCells[j], pathCells[i]];
    }

    let idx = 0;

    // Place items - one-time placement at game start
    // Reduced item count for cleaner gameplay
    const itemConfig = [
        { type: TILE.BOOST, count: 2 },      // 좋은 아이템
        { type: TILE.SLOW, count: 2 },       // 나쁜 아이템
        { type: TILE.LIGHTNING, count: 1 },  // 강력한 좋은 아이템
        { type: TILE.FREEZE, count: 2 },     // 나쁜 아이템
        { type: TILE.REVERSE, count: 1 }     // 나쁜 아이템 (1개만)
    ];

    for (const item of itemConfig) {
        for (let i = 0; i < item.count && idx < pathCells.length; i++, idx++) {
            maze[pathCells[idx].y][pathCells[idx].x] = item.type;
        }
    }

    // Place portals (neutral - can be good or bad)
    if (idx + 1 < pathCells.length) {
        portalA = pathCells[idx];
        portalB = pathCells[idx + 1];
        maze[portalA.y][portalA.x] = TILE.PORTAL_A;
        maze[portalB.y][portalB.x] = TILE.PORTAL_B;
    }
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

function drawTileIcon(ctx, tile, x, y, size) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cx = x + size / 2;
    const cy = y + size / 2;
    const iconSize = size * 0.5;

    switch (tile) {
        case TILE.BOOST: // Zap icon
            ctx.beginPath();
            ctx.moveTo(cx + iconSize * 0.1, cy - iconSize * 0.4);
            ctx.lineTo(cx - iconSize * 0.2, cy + iconSize * 0.05);
            ctx.lineTo(cx + iconSize * 0.05, cy + iconSize * 0.05);
            ctx.lineTo(cx - iconSize * 0.1, cy + iconSize * 0.4);
            ctx.lineTo(cx + iconSize * 0.2, cy - iconSize * 0.05);
            ctx.lineTo(cx - iconSize * 0.05, cy - iconSize * 0.05);
            ctx.closePath();
            ctx.fill();
            break;

        case TILE.SLOW: // Snail icon (simplified)
            ctx.beginPath();
            ctx.arc(cx, cy, iconSize * 0.35, 0, Math.PI, true);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - iconSize * 0.1, cy, iconSize * 0.2, 0, Math.PI * 2);
            ctx.stroke();
            break;

        case TILE.PORTAL_A:
        case TILE.PORTAL_B: // Rotate icon
            ctx.beginPath();
            ctx.arc(cx, cy, iconSize * 0.3, 0, Math.PI * 1.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + iconSize * 0.1, cy - iconSize * 0.4);
            ctx.lineTo(cx + iconSize * 0.3, cy - iconSize * 0.25);
            ctx.lineTo(cx, cy - iconSize * 0.25);
            ctx.fill();
            break;

        case TILE.LIGHTNING: // Rocket icon
            ctx.beginPath();
            ctx.moveTo(cx, cy - iconSize * 0.4);
            ctx.lineTo(cx + iconSize * 0.2, cy + iconSize * 0.2);
            ctx.lineTo(cx, cy + iconSize * 0.1);
            ctx.lineTo(cx - iconSize * 0.2, cy + iconSize * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx - iconSize * 0.15, cy + iconSize * 0.25);
            ctx.lineTo(cx, cy + iconSize * 0.4);
            ctx.lineTo(cx + iconSize * 0.15, cy + iconSize * 0.25);
            ctx.stroke();
            break;

        case TILE.FREEZE: // Snowflake icon
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * iconSize * 0.35, cy + Math.sin(angle) * iconSize * 0.35);
                ctx.stroke();
            }
            break;

        case TILE.REVERSE: // Undo icon
            ctx.beginPath();
            ctx.arc(cx + iconSize * 0.1, cy, iconSize * 0.25, Math.PI * 0.5, Math.PI * 1.5, true);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - iconSize * 0.15, cy - iconSize * 0.35);
            ctx.lineTo(cx - iconSize * 0.35, cy - iconSize * 0.15);
            ctx.lineTo(cx - iconSize * 0.05, cy - iconSize * 0.15);
            ctx.fill();
            break;
    }

    ctx.restore();
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

            // Draw tile icons using canvas
            if (tile !== TILE.PATH && tile !== TILE.WALL) {
                drawTileIcon(ctx, tile, x * cellSize, y * cellSize, cellSize);
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

    // Flag icon for exit
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    const ex = exitPos.x * cellSize + cellSize * 0.35;
    const ey = exitPos.y * cellSize + cellSize * 0.25;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex, ey + cellSize * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + cellSize * 0.35, ey + cellSize * 0.15);
    ctx.lineTo(ex, ey + cellSize * 0.3);
    ctx.fill();
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
        // Draw snowflake above player
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const fy = py - cellSize * 0.6;
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            ctx.beginPath();
            ctx.moveTo(px, fy);
            ctx.lineTo(px + Math.cos(angle) * 4, fy + Math.sin(angle) * 4);
            ctx.stroke();
        }
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
            <span class="rank-name">${p.name}${p.frozen ? ' ❄' : ''}</span>
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

    // Better mobile support
    const isMobile = window.innerWidth <= 900;
    const padding = isMobile ? 20 : 280;
    const maxWidth = window.innerWidth - padding;
    const maxHeight = window.innerHeight - (isMobile ? 300 : 200);
    const maxSize = Math.min(maxWidth, maxHeight, isMobile ? 400 : 650);

    // Ensure minimum cell size for visibility
    cellSize = Math.max(Math.floor(maxSize / mazeWidth), 8);

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

    players = [];
    finishOrder = [];
    raceStarted = false;
    particles = [];
    revealedCells = new Set();
    eventLog = [];
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
            frozen: false, frozenUntil: 0,
            lastMoveTime: 0  // Track individual move timing
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
    document.getElementById('gameTitle').innerHTML = '<i data-lucide="puzzle" class="status-icon"></i><span>준비 완료!</span>';
    document.getElementById('gameSubtitle').textContent = '레이스 시작 버튼을 누르세요';

    showScreen('mazeScreen');
    initCanvas();
    updateLiveRankings();
    render();
}

// Lucide icon SVGs for legend
const LEGEND_ICONS = {
    boost: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    slow: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-12 0Z"/><circle cx="10" cy="13" r="2"/><path d="M14 13h8"/><path d="M22 13a4 4 0 0 0-4-4"/></svg>',
    lightning: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
    freeze: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>',
    reverse: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    portal: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    flag: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>'
};

function updateLegend() {
    const legend = document.getElementById('legend');

    // Players row
    let playersHtml = players.map((p, i) => `
        <div class="legend-item">
            <div class="legend-color" style="background: ${COLORS[i]}"></div>
            <span>${p.name}</span>
        </div>
    `).join('');
    playersHtml += `<div class="legend-item"><div class="legend-color" style="background: #2ecc71"></div>${LEGEND_ICONS.flag}<span>출구</span></div>`;

    // Items row
    let itemsHtml = '';
    if (enableSpecialTiles) {
        itemsHtml = `
            <div class="legend-item item"><div class="legend-tile" style="background: #27ae60"></div>${LEGEND_ICONS.boost}<span>부스트</span></div>
            <div class="legend-item item"><div class="legend-tile" style="background: #9b59b6"></div>${LEGEND_ICONS.slow}<span>슬로우</span></div>
            <div class="legend-item item"><div class="legend-tile" style="background: #f1c40f"></div>${LEGEND_ICONS.lightning}<span>번개점프</span></div>
            <div class="legend-item item"><div class="legend-tile" style="background: #00cec9"></div>${LEGEND_ICONS.freeze}<span>빙결</span></div>
            <div class="legend-item item"><div class="legend-tile" style="background: #e74c3c"></div>${LEGEND_ICONS.reverse}<span>후퇴</span></div>
            <div class="legend-item item"><div class="legend-tile" style="background: #3498db"></div>${LEGEND_ICONS.portal}<span>포탈</span></div>
        `;
    }

    legend.innerHTML = `
        <div class="legend-row players">${playersHtml}</div>
        ${itemsHtml ? `<div class="legend-row items">${itemsHtml}</div>` : ''}
    `;
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

    document.getElementById('gameTitle').innerHTML = '<i data-lucide="zap" class="status-icon"></i><span>레이스 진행 중!</span>';
    document.getElementById('gameSubtitle').textContent = '누가 먼저 탈출할까요?';
    lucide.createIcons();

    startRace();
}

function startRace() {
    raceStarted = true;
    raceStartTime = performance.now();

    // Initialize each player's move timing
    players.forEach(player => {
        player.lastMoveTime = raceStartTime;
    });

    function gameLoop(currentTime) {
        const elapsed = currentTime - raceStartTime;
        let allFinished = true;

        players.forEach((player, i) => {
            if (player.finished) return;

            // Check frozen
            if (player.frozen && currentTime > player.frozenUntil) {
                player.frozen = false;
                player.lastMoveTime = currentTime; // Reset move timer after unfreeze
            }
            if (player.frozen) {
                allFinished = false;
                return;
            }

            // Speed effect timeout
            if (player.speedEffectUntil > 0 && currentTime > player.speedEffectUntil) {
                player.speedMultiplier = 1;
                player.speedEffectUntil = 0;
            }

            // Calculate effective duration based on speed multiplier
            const effectiveDuration = MOVE_DURATION / player.speedMultiplier;

            // Check if it's time for next move (per-player timing)
            const timeSinceLastMove = currentTime - player.lastMoveTime;
            const shouldMove = timeSinceLastMove >= effectiveDuration;

            if (shouldMove && !player.animating && player.pathIndex < player.path.length - 1) {
                player.pathIndex++;
                const target = player.path[player.pathIndex];
                player.animating = true;
                player.animStartTime = currentTime;
                player.animFromX = player.x;
                player.animFromY = player.y;
                player.animToX = target.x;
                player.animToY = target.y;
                player.lastMoveTime = currentTime;
            }

            if (player.animating) {
                const animDuration = MOVE_DURATION / player.speedMultiplier;
                const animElapsed = currentTime - player.animStartTime;
                const progress = Math.min(animElapsed / animDuration, 1);
                const easedProgress = easeInOutCubic(progress);

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
                        addEventLog('finish', `${player.name} 골인! (${finishOrder.length}등)`);
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
            document.getElementById('gameTitle').innerHTML = '<i data-lucide="flag" class="status-icon"></i><span>레이스 완료!</span>';
            document.getElementById('gameSubtitle').textContent = '결과를 확인하세요';
            lucide.createIcons();
            setTimeout(showResultScreen, 1200);
        }
    }

    animationId = requestAnimationFrame(gameLoop);
}

function handleTileEffect(player, tile, playerIndex, currentTime) {
    const name = player.name;

    switch (tile) {
        case TILE.BOOST:
            player.speedMultiplier = 2;  // Reduced from 2.5x to 2x
            player.speedEffectUntil = currentTime + 2500;
            createParticles(player.x, player.y, '#27ae60', 15);
            playBoostSound();
            addEventLog('boost', `${name} 부스트!`);
            gameStats.boosts++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.SLOW:
            player.speedMultiplier = 0.4;
            player.speedEffectUntil = currentTime + 2500;
            createParticles(player.x, player.y, '#9b59b6', 15);
            playSlowSound();
            addEventLog('slow', `${name} 슬로우!`);
            gameStats.slows++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.LIGHTNING:
            // Save original position BEFORE moving
            const lightningOrigX = player.x;
            const lightningOrigY = player.y;
            // Clear the original LIGHTNING tile first
            maze[lightningOrigY][lightningOrigX] = TILE.PATH;
            // Jump forward 5 steps (reduced from 8)
            const jumpSteps = Math.min(5, player.path.length - player.pathIndex - 1);
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
            createParticles(lightningOrigX, lightningOrigY, '#f1c40f', 25);
            playLightningSound();
            addEventLog('lightning', `${name} 번개점프!`);
            gameStats.lightnings++;
            break;

        case TILE.FREEZE:
            player.frozen = true;
            player.frozenUntil = currentTime + 2000; // Reduced from 2.5s to 2s
            createParticles(player.x, player.y, '#00cec9', 20);
            playFreezeSound();
            addEventLog('freeze', `${name} 빙결!`);
            gameStats.freezes++;
            maze[player.y][player.x] = TILE.PATH;
            break;

        case TILE.REVERSE:
            // Save original position BEFORE moving
            const reverseOrigX = player.x;
            const reverseOrigY = player.y;
            // Clear the original REVERSE tile first
            maze[reverseOrigY][reverseOrigX] = TILE.PATH;
            // Go back 5 steps for more comeback potential
            const backSteps = Math.min(5, player.pathIndex);
            if (backSteps > 0) {
                player.pathIndex -= backSteps;
                const newPos = player.path[player.pathIndex];
                player.x = newPos.x;
                player.y = newPos.y;
                player.renderX = player.x;
                player.renderY = player.y;
            }
            createParticles(reverseOrigX, reverseOrigY, '#e74c3c', 20);
            playReverseSound();
            addEventLog('reverse', `${name} 후퇴!`);
            gameStats.reverses++;
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
                addEventLog('portal', `${name} 포탈!`);
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
                addEventLog('portal', `${name} 포탈!`);
                gameStats.portals++;
            }
            break;
    }
}

function showResultScreen() {
    finishOrder.sort((a, b) => a.finishTime - b.finishTime);

    const loserName = finishOrder[finishOrder.length - 1]?.name || '';
    document.getElementById('resultSubtitle').textContent = `${loserName}님이 벌칙 당첨!`;

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
            ${isLoser ? '<div class="loser-badge">벌칙!</div>' : ''}
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
    const lines = ['미로 탈출 게임 결과', ''];

    finishOrder.forEach((player, rank) => {
        const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;
        const isLoser = rank === finishOrder.length - 1;
        const timeStr = (player.finishTime / 1000).toFixed(2);
        lines.push(`${medal} ${player.name} - ${timeStr}초 ${isLoser ? '(벌칙!)' : ''}`);
    });

    lines.push('', '미로 탈출 게임으로 벌칙자를 정해보세요!');

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
        alert('결과가 클립보드에 복사되었습니다!');
    });
}

function restart() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    raceStarted = false;
    finishOrder = [];
    particles = [];
    eventLog = [];  // Clear event log
    // Clear event log UI
    const eventLogEl = document.getElementById('eventLog');
    if (eventLogEl) eventLogEl.innerHTML = '';
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

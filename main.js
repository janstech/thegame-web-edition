// ---- Perusasetukset ----
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("scoreValue");
const timeEl = document.getElementById("timeValue");
const statusOverlay = document.getElementById("statusOverlay");
const statusTitleEl = document.getElementById("statusTitle");
const statusMessageEl = document.getElementById("statusMessage");

// Start-overlay
const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// ---- Syöte (näppäimet) ----
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

function handleKeyDown(e) {
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      keys.up = true;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      keys.down = true;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      keys.left = true;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      keys.right = true;
      break;
    case "r":
    case "R":
      if (gameState.gameOver) {
        resetGame();
      }
      break;
  }
}

function handleKeyUp(e) {
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      keys.up = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      keys.down = false;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      keys.left = false;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      keys.right = false;
      break;
  }
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// ---- Pelitilat ----
const gameState = {
  score: 0,
  timeLeft: 60, // sekuntia
  gameOver: false,
  lastTimestamp: 0,
  elapsed: 0, // kulunut aika animaatioita varten
};

// --- Player sprite sheet ---
const playerImage = new Image();
playerImage.src = "img/player.png"; // 288x48, 9 framea → 32x48/ruutu

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 48;
const FRAME_COUNT = 9;

// --- Orb / tähti sprite ---
const orbImage = new Image();
orbImage.src = "img/star.png";

// --- Web Audio -pohjainen keräysääni ---
let audioCtx = null;
let collectBuffer = null;
let audioLoading = false;

function initAudio() {
  if (audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    console.log("Web Audio API ei ole tuettu tässä selaimessa.");
    return;
  }
  audioCtx = new AudioContext();
}

function loadCollectSound() {
  if (!audioCtx || audioLoading || collectBuffer) return;
  audioLoading = true;
  fetch("collect.mp3")
    .then((res) => res.arrayBuffer())
    .then((data) => audioCtx.decodeAudioData(data))
    .then((buffer) => {
      collectBuffer = buffer;
      console.log("Collect-sound ladattu.");
    })
    .catch((err) => console.log("Collect-sound lataus epäonnistui:", err))
    .finally(() => {
      audioLoading = false;
    });
}

function playCollectSound() {
  if (!audioCtx || !collectBuffer) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  const source = audioCtx.createBufferSource();
  source.buffer = collectBuffer;
  source.connect(audioCtx.destination);
  source.start(0);
}

// ---- Objektiluokat ----
class Player {
  constructor() {
    this.radius = 14; // törmäyssäde
    this.speed = 220;

    // animaatio
    this.frame = 0;
    this.frameTime = 0;
    this.frameSpeed = 0.08; // sekuntia / frame

    this.reset();
  }

  reset() {
    this.x = WIDTH / 2;
    this.y = HEIGHT - 100;
  }

  update(dt, walls) {
    if (gameState.gameOver) return;

    let dx = 0;
    let dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;

    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    // animaatio
    if (moving) {
      this.frameTime += dt;
      if (this.frameTime >= this.frameSpeed) {
        this.frameTime = 0;
        this.frame = (this.frame + 1) % FRAME_COUNT;
      }
    } else {
      this.frame = 0;
    }

    const oldX = this.x;
    const oldY = this.y;

    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    // reunat
    this.x = Math.max(this.radius, Math.min(WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(HEIGHT - this.radius, this.y));

    // törmäys seiniin
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
    }
  }

  draw(ctx) {
    const sx = this.frame * FRAME_WIDTH;
    const sy = 0;

    ctx.drawImage(
      playerImage,
      sx,
      sy,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      this.x - FRAME_WIDTH / 2,
      this.y - FRAME_HEIGHT / 2,
      FRAME_WIDTH,
      FRAME_HEIGHT
    );
  }
}

class Orb {
  constructor(x, y) {
    this.x = x;
    this.y = y;

    this.radius = 12;
    this.collected = false;
    this.pulseOffset = Math.random() * Math.PI * 2;
  }

  draw(ctx) {
    if (this.collected) return;

    const baseW = orbImage.width || 24;
    const baseH = orbImage.height || 24;

    // pulssi 0.85–1.15
    const t = gameState.elapsed;
    const scale = 1 + 0.15 * Math.sin(this.pulseOffset + t * 4);

    const w = baseW * scale;
    const h = baseH * scale;

    ctx.drawImage(
      orbImage,
      this.x - w / 2,
      this.y - h / 2,
      w,
      h
    );
  }
}

class Enemy {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.vx = vx;
    this.vy = vy;
  }

  update(dt, walls) {
    if (gameState.gameOver) return;

    const oldX = this.x;
    const oldY = this.y;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // reunat
    if (this.x - this.radius < 0 || this.x + this.radius > WIDTH) {
      this.vx *= -1;
      this.x = oldX;
    }
    if (this.y - this.radius < 0 || this.y + this.radius > HEIGHT) {
      this.vy *= -1;
      this.y = oldY;
    }

    // seinät
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
      this.vx *= -1;
      this.vy *= -1;
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
  }
}

class CollectEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.maxLife = 0.35;
    this.life = this.maxLife;
  }

  update(dt) {
    this.life -= dt;
  }

  get alive() {
    return this.life > 0;
  }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const alpha = 1 - t;
    const radius = 16 + t * 32;

    ctx.save();
    ctx.globalAlpha = alpha;

    const gradient = ctx.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      radius
    );
    gradient.addColorStop(0, "rgba(250, 250, 210, 1)");
    gradient.addColorStop(0.4, "rgba(253, 224, 71, 0.9)");
    gradient.addColorStop(1, "rgba(250, 204, 21, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// Labyrintin seinät (yksinkertaiset suorakulmiot)
const walls = [
  // reunat
  { x: 40, y: 40, width: WIDTH - 80, height: 12 },
  { x: 40, y: HEIGHT - 52, width: WIDTH - 80, height: 12 },

  // sisäisiä seiniä
  { x: 120, y: 140, width: 560, height: 12 },
  { x: 120, y: 260, width: 12, height: 160 },
  { x: WIDTH - 140, y: 200, width: 12, height: 180 },
  { x: 240, y: 360, width: 360, height: 12 },
];

// ---- Pelin oliot ----
let player;
let orbs = [];
let enemies = [];
let effects = [];

// ---- Apu-funktiot törmäyksiin ----
function circleCollision(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  return dist < a.radius + b.radius;
}

function circleRectCollision(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function isCircleCollidingWithWalls(circle, walls) {
  return walls.some((wall) => circleRectCollision(circle, wall));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---- Orbien ja vihollisten luonti ----
function spawnOrbs(count) {
  orbs = [];
  let tries = 0;
  while (orbs.length < count && tries < count * 20) {
    tries++;
    const margin = 40;
    const x = margin + Math.random() * (WIDTH - margin * 2);
    const y = margin + Math.random() * (HEIGHT - margin * 2);
    const orb = new Orb(x, y);

    if (
      !isCircleCollidingWithWalls(orb, walls) &&
      (!player || Math.hypot(player.x - x, player.y - y) > 80)
    ) {
      orbs.push(orb);
    }
  }
}

function spawnEnemies() {
  enemies = [];
  enemies.push(new Enemy(120, 180, 90, 0));
  enemies.push(new Enemy(WIDTH - 140, 120, -90, 0));
  enemies.push(new Enemy(300, 450, 0, -80));
}

// ---- Piirto ----
function drawBackground(ctx) {
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0b1120");
  gradient.addColorStop(1, "#020617");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawWalls(ctx) {
  ctx.fillStyle = "#1f2937";
  walls.forEach((w) => {
    ctx.fillRect(w.x, w.y, w.width, w.height);
  });
}

// ---- Peli-looppi ----
function update(dt) {
  if (gameState.gameOver) return;

  gameState.elapsed += dt;

  // Ajastin
  gameState.timeLeft -= dt;
  if (gameState.timeLeft <= 0) {
    gameState.timeLeft = 0;
    endGame("Aika loppui!", `Keräsit ${gameState.score} tähteä.`);
  }
  timeEl.textContent = gameState.timeLeft.toFixed(1);

  // Päivitä pelaaja ja viholliset
  player.update(dt, walls);
  enemies.forEach((enemy) => enemy.update(dt, walls));

  // Orbien keräys
  orbs.forEach((orb) => {
    if (!orb.collected && circleCollision(player, orb)) {
      orb.collected = true;
      gameState.score += 1;
      scoreEl.textContent = gameState.score;

      effects.push(new CollectEffect(orb.x, orb.y));
      playCollectSound();
    }
  });

  // Vihollisen osuma -> peli ohi
  for (const enemy of enemies) {
    if (circleCollision(player, enemy)) {
      endGame("Osuit viholliseen!", `Lopullinen pistemäärä: ${gameState.score}.`);
      break;
    }
  }

  // Efektit
  effects.forEach((effect) => effect.update(dt));
  effects = effects.filter((effect) => effect.alive);

  // Kaikki orbit kerätty -> voittotila
  if (!gameState.gameOver && orbs.every((o) => o.collected)) {
    endGame(
      "Voitto!",
      `Keräsit kaikki tähdet ajassa ${(60 - gameState.timeLeft).toFixed(1)}s.`
    );
  }
}

function draw() {
  drawBackground(ctx);
  drawWalls(ctx);

  orbs.forEach((orb) => orb.draw(ctx));
  enemies.forEach((enemy) => enemy.draw(ctx));
  player.draw(ctx);
  effects.forEach((effect) => effect.draw(ctx));
}

// ---- Pelin loppu & reset ----
function endGame(title, message) {
  gameState.gameOver = true;
  statusTitleEl.textContent = title;
  statusMessageEl.textContent = message;
  statusOverlay.classList.remove("hidden");
}

function resetGame() {
  gameState.score = 0;
  gameState.timeLeft = 60;
  gameState.gameOver = false;
  gameState.lastTimestamp = 0;
  gameState.elapsed = 0;

  scoreEl.textContent = "0";
  timeEl.textContent = gameState.timeLeft.toFixed(1);
  statusOverlay.classList.add("hidden");

  effects = [];

  player = new Player();
  spawnOrbs(10);
  spawnEnemies();
}

// ---- requestAnimationFrame-loop ----
function gameLoop(timestamp) {
  if (!gameState.lastTimestamp) {
    gameState.lastTimestamp = timestamp;
  }
  const dt = (timestamp - gameState.lastTimestamp) / 1000;
  gameState.lastTimestamp = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ---- Start-napin logiikka ----
let hasStarted = false;

startButton.addEventListener("click", () => {
  if (hasStarted) return;
  hasStarted = true;

  // Käynnistetään Web Audio käyttäjän klikkauksesta
  initAudio();
  if (audioCtx) {
    audioCtx.resume().catch(() => {});
    loadCollectSound();
  }

  // Piilotetaan start-overlay ja käynnistetään peli
  startOverlay.classList.add("hidden");
  resetGame();
  requestAnimationFrame(gameLoop);
});

// ---- Perusasetukset ----
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("scoreValue");
const timeEl = document.getElementById("timeValue");
const statusOverlay = document.getElementById("statusOverlay");
const statusTitleEl = document.getElementById("statusTitle");
const statusMessageEl = document.getElementById("statusMessage");

// Start-valikon elementit (HTML:n mukaan)
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");

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
  elapsed: 0,
};

// --- Kuvat ---
const playerImage = new Image();
playerImage.src = "img/player.png";

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 48;
const FRAME_COUNT = 9;

const orbImage = new Image();
orbImage.src = "img/star.png";

// --- ÄÄNIJÄRJESTELMÄ (Web Audio API) ---
let audioCtx = null;
let collectBuffer = null;
let gameoverBuffer = null;
let bgMusic = new Audio("music.mp3"); // Ladataan musiikkitiedosto
bgMusic.loop = true; // Laitetaan musiikki looppaamaan (soi uudestaan kun loppuu)
bgMusic.volume = 0.3; // Taustamusiikki hiljaisella (30%)

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (!collectBuffer) {
    fetch("collect.mp3")
      .then((res) => res.arrayBuffer())
      .then((data) => audioCtx.decodeAudioData(data))
      .then((buffer) => {
        collectBuffer = buffer;
        console.log("Ääni ladattu.");
      })
      .catch((err) => console.log("Äänen latausvirhe:", err));
  }

  // 2. Ladataan Game Over -ääni
  if (!gameoverBuffer) {
    fetch("gameover.mp3")
      .then((res) => res.arrayBuffer())
      .then((data) => audioCtx.decodeAudioData(data))
      .then((buffer) => { 
        gameoverBuffer = buffer; 
        console.log("Gameover-ääni ladattu.");
      })
      .catch((err) => console.log("Gameover-äänen virhe:", err));
  }
}

function playCollectSound() {
  if (!audioCtx || !collectBuffer) return;
  
  // 1. Luodaan äänilähde
  const source = audioCtx.createBufferSource();
  source.buffer = collectBuffer;

  // 2. Luodaan äänenvoimakkuuden säädin (GainNode)
  const gainNode = audioCtx.createGain();
  
  // --- Äänenvoimakkuus ---
  gainNode.gain.value = 0.4; // 0.0 on hiljainen, 1.0 on täysillä.
  // -------------------------------------

  // 3. Kytketään johdot: Lähde -> Säädin -> Kaiuttimet
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  source.start(0);
}

function playGameOverSound() {
  if (!audioCtx || !gameoverBuffer) return;
  
  const source = audioCtx.createBufferSource();
  source.buffer = gameoverBuffer;

  // Säädetään äänenvoimakkuutta
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.4; // 40% voimakkuus

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

// ---- Objektiluokat ----

// 1. PELAAJA (KORJATTU: Käyttää taas kuvaa!)
class Player {
  constructor() {
    this.radius = 14;
    this.speed = 220;
    this.frame = 0;
    this.frameTime = 0;
    this.frameSpeed = 0.08;
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

    this.x = Math.max(this.radius, Math.min(WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(HEIGHT - this.radius, this.y));

    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
    }
  }

  draw(ctx) {
    // Piirretään kuva (sprite)
    const sx = this.frame * FRAME_WIDTH;
    const sy = 0;

    ctx.drawImage(
      playerImage,
      sx, sy, FRAME_WIDTH, FRAME_HEIGHT,
      this.x - FRAME_WIDTH / 2, this.y - FRAME_HEIGHT / 2,
      FRAME_WIDTH, FRAME_HEIGHT
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
    const t = gameState.elapsed;
    const scale = 1 + 0.15 * Math.sin(this.pulseOffset + t * 4);

    const w = baseW * scale;
    const h = baseH * scale;

    ctx.drawImage(orbImage, this.x - w / 2, this.y - h / 2, w, h);
  }
}

// 2. VIHOLLINEN
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

    // Reunat
    if (this.x - this.radius < 0 || this.x + this.radius > WIDTH) {
      this.vx *= -1;
      this.x = oldX;
    }
    if (this.y - this.radius < 0 || this.y + this.radius > HEIGHT) {
      this.vy *= -1;
      this.y = oldY;
    }
    // Seinät
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
      this.vx *= -1;
      this.vy *= -1;
    }
  }

  draw(ctx) {
    // TÄSSÄ ON UUSI "PELOTTAVA" PIIRTOKOODI
    // 1. Vartalo: Tummanpunainen hehku
    const gradient = ctx.createRadialGradient(
      this.x, this.y, this.radius * 0.4,
      this.x, this.y, this.radius
    );
    gradient.addColorStop(0, "#8b0000"); // Ydin
    gradient.addColorStop(1, "#ff0000"); // Hehku

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Reunaviiva
    ctx.strokeStyle = "#4a0404";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Silmät
    ctx.fillStyle = "#ffff00";
    const eyeOffsetX = this.radius * 0.35;
    const eyeOffsetY = this.radius * 0.2;
    const eyeSize = this.radius * 0.2;

    // Vasen ja oikea silmä
    ctx.beginPath();
    ctx.arc(this.x - eyeOffsetX, this.y - eyeOffsetY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + eyeOffsetX, this.y - eyeOffsetY, eyeSize, 0, Math.PI * 2);
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

  get alive() { return this.life > 0; }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const alpha = 1 - t;
    const radius = 16 + t * 32;

    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, radius
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

// Labyrintin seinät
const walls = [
  { x: 40, y: 40, width: WIDTH - 80, height: 12 },
  { x: 40, y: HEIGHT - 52, width: WIDTH - 80, height: 12 },
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

// ---- Apu-funktiot ----
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

// ---- SPAWNERIT (Luonti) ----

function spawnOrbs(count) {
  orbs = [];
  let tries = 0;
  while (orbs.length < count && tries < count * 20) {
    tries++;
    const margin = 40;
    const x = margin + Math.random() * (WIDTH - margin * 2);
    const y = margin + Math.random() * (HEIGHT - margin * 2);
    const orb = new Orb(x, y);

    if (!isCircleCollidingWithWalls(orb, walls) &&
        (!player || Math.hypot(player.x - x, player.y - y) > 80)) {
      orbs.push(orb);
    }
  }
}

// VIHOLLISTEN LUONTI (20 kpl, satunnaiset suunnat)
function spawnEnemies() {
  enemies = [];
  const enemyCount = 23; // Määrä
  const baseSpeed = 120; // Nopeus

  let tries = 0;
  while (enemies.length < enemyCount && tries < enemyCount * 30) {
    tries++;
    const margin = 50;
    const x = margin + Math.random() * (WIDTH - margin * 2);
    const y = margin + Math.random() * (HEIGHT - margin * 2);

    // Arvotaan satunnainen suunta
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * baseSpeed;
    const vy = Math.sin(angle) * baseSpeed;

    const enemy = new Enemy(x, y, vx, vy);
    const playerStartX = WIDTH / 2;
    const playerStartY = HEIGHT - 100;

    // Varmistetaan, ettei synny seinään tai pelaajan päälle
    if (
      !isCircleCollidingWithWalls(enemy, walls) &&
      Math.hypot(enemy.x - playerStartX, enemy.y - playerStartY) > 150
    ) {
      enemies.push(enemy);
    }
  }
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

// ---- Peli-looppi (Update & Draw) ----
function update(dt) {
  if (gameState.gameOver) return;

  gameState.elapsed += dt;
  gameState.timeLeft -= dt;
  if (gameState.timeLeft <= 0) {
    gameState.timeLeft = 0;
    endGame("Aika loppui!", `Keräsit ${gameState.score} tähteä.`);
  }
  timeEl.textContent = gameState.timeLeft.toFixed(1);

  player.update(dt, walls);
  enemies.forEach((enemy) => enemy.update(dt, walls));

  // Orbien keräys
  orbs.forEach((orb) => {
    if (!orb.collected && circleCollision(player, orb)) {
      orb.collected = true;
      gameState.score += 1;
      scoreEl.textContent = gameState.score;
      effects.push(new CollectEffect(orb.x, orb.y));
      gameState.timeLeft += 2; // Lisää x-määrä sekuntia aikaa kun kerää tähden
      
      playCollectSound();  
    }
  });

  // Vihollisen osuma
  for (const enemy of enemies) {
    if (circleCollision(player, enemy)) {
      playGameOverSound();
      endGame("Osuit viholliseen!", `Lopullinen pistemäärä: ${gameState.score}.`);
      break;
    }
  }

  effects.forEach((effect) => effect.update(dt));
  effects = effects.filter((effect) => effect.alive);

  if (!gameState.gameOver && orbs.every((o) => o.collected)) {
    endGame("Voitto!", `Keräsit kaikki tähdet ajassa ${(60 - gameState.timeLeft).toFixed(1)}s.`);
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

function endGame(title, message) {
  gameState.gameOver = true;
  
  bgMusic.pause(); // Pysäytetään musiikki
  playGameOverSound(); // Soitetaan ääni (jos sinulla on tämä funktio)

  canvas.style.cursor = "default"; 

  statusTitleEl.textContent = title;
  statusMessageEl.textContent = message;
  statusOverlay.classList.remove("hidden");
  
  // Highscore-tarkistus pienellä viiveellä
  setTimeout(() => {
    checkHighScore(gameState.score);
  }, 100);
}

function resetGame() {
  gameState.score = 0;
  gameState.timeLeft = 60;
  gameState.gameOver = false;
  gameState.lastTimestamp = 0;
  gameState.elapsed = 0;
  
  player = new Player();
  player.vx = 0;
  player.vy = 0;

  if (statusOverlay) {
    statusOverlay.classList.add("hidden");
  }

  // --- KORJATTU KOHTA (Viive auttaa selainta) ---
  // Asetetaan ensin default, jotta tila nollautuu
  canvas.style.cursor = "default";
  
  // Odotetaan 10ms, jotta Game Over -valikko ehtii varmasti kadota alta pois
  setTimeout(() => {
    canvas.style.cursor = "none";
  }, 10);
  // ----------------------------------------------
  
  Object.keys(keys).forEach(key => keys[key] = false);

  if (bgMusic.paused && isGameRunning) {
    bgMusic.currentTime = 0;
    bgMusic.play().catch(() => {});
  }

  effects = [];
  spawnOrbs(25);
  spawnEnemies();
}

// ---- requestAnimationFrame-loop ----
let isGameRunning = false;

function gameLoop(timestamp) {
  if (!isGameRunning) return;

  if (!gameState.lastTimestamp) {
    gameState.lastTimestamp = timestamp;
  }
  const dt = (timestamp - gameState.lastTimestamp) / 1000;
  gameState.lastTimestamp = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ---- START-LOGIIKKA ----

// Piirretään tausta kerran, jotta peli ei ole musta
drawBackground(ctx);

function handleStartClick() {
  initAudio(); 
  bgMusic.currentTime = 0;
  bgMusic.play().catch(e => console.log("Musiikin toisto estettiin:", e));
  
  // --- KORJATTU KOHTA ---
  canvas.style.cursor = "none";
  // ----------------------

  if (startScreen) {
    startScreen.style.display = "none";
  }

  Object.keys(keys).forEach(key => keys[key] = false);

  isGameRunning = true;
  resetGame();
  requestAnimationFrame(gameLoop);
}

if (startBtn) {
  startBtn.addEventListener("click", handleStartClick);
} else {
  // Hätätilanne: jos nappia ei ole, peli alkaa heti
  console.log("Start-nappia ei löytynyt, peli alkaa heti.");
  isGameRunning = true;
  resetGame();
  requestAnimationFrame(gameLoop);
}

// ---- GLOBAALI HIGHSCORE (DREAMLO API) ----


const PRIVATE_CODE = "n9F_ouNjTk2SATw0ySYvDAACQDPrWwFUyODxZB8sDsuA"; 
const PUBLIC_CODE = "693a98da8f40bb1004505edf"; 
const BASE_URL = "https://corsproxy.io/?http://dreamlo.com/lb/";
const highScoreList = document.getElementById('highScoreList');

// 1. Funktio: Tallenna pisteet pilveen
function submitScore(name, score) {
  // Siistitään nimi (poistetaan erikoismerkit) ja katkaistaan 12 merkkiin
  const safeName = name.replace(/[^a-zA-Z0-9öäåÖÄÅ]/g, "").substring(0, 12) || "Tuntematon";
  
  // Rakennetaan osoite
  const url = `${BASE_URL}${PRIVATE_CODE}/add/${safeName}/${score}`;
  
  console.log("Lähetetään tulosta...");
  
  fetch(url)
    .then(response => {
  console.log("Tulos tallennettu! Odotetaan hetki päivitystä...");
        
        // ▼▼▼ UUSI VIIVE: Odotetaan 1 sekunti ennen listan hakua ▼▼▼
        setTimeout(() => {
          fetchHighScores(); 
        }, 1000); 
        // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
      })
      .catch(err => console.log("Virhe tallennuksessa:", err));
  }

// 2. Funktio: Hae pisteet pilvestä ja näytä ne
function fetchHighScores() {
  if (!highScoreList) return;

  // Haetaan JSON-muodossa 5 parasta
const url = `${BASE_URL}${PUBLIC_CODE}/json/5?nocache=${new Date().getTime()}`;

  highScoreList.innerHTML = "<li>Ladataan tuloksia...</li>";

  fetch(url)
    .then(response => response.json())
    .then(data => {
      let scores = [];
      
      // Dreamlon data voi olla hieman outoa rakenteeltaan
      if (!data.dreamlo || !data.dreamlo.leaderboard) {
        scores = [];
      } else if (data.dreamlo.leaderboard.entry) {
        // Varmistetaan että data on aina listamuodossa (array)
        const entry = data.dreamlo.leaderboard.entry;
        scores = Array.isArray(entry) ? entry : [entry];
      }

      // Luodaan HTML-lista
      if (scores.length === 0) {
        highScoreList.innerHTML = "<li>Ei tuloksia vielä. Ole ensimmäinen!</li>";
      } else {
        highScoreList.innerHTML = scores
          .map((entry) => `
            <li style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 4px 0;">
              <span>${entry.name}</span>
              <span style="color: #fbbf24; font-weight: bold;">${entry.score}</span>
            </li>`)
          .join('');
      }
    })
    .catch(err => {
      highScoreList.innerHTML = "<li>Yhteysvirhe listaan.</li>";
      console.log("Fetch error:", err);
    });
}

// 3. Funktio: Tätä kutsutaan pelin lopussa (endGame)
function checkHighScore(score) {
  // Kysytään nimeä vain jos pisteitä on saatu (yli 0)
  if (score > 0) {
    // Pieni viive, jotta peli ehtii pysähtyä visuaalisesti
    setTimeout(() => {
      const name = prompt(`Sait ${score} pistettä! Anna nimesi Global High Score -listalle:`);
      if (name && name.trim().length > 0) {
        submitScore(name, score);
      } else {
        // Jos käyttäjä peruu, päivitetään silti lista, jotta hän näkee muiden tulokset
        fetchHighScores();
      }
    }, 100);
  } else {
    fetchHighScores();
  }
}

// Ladataan lista heti kun peli käynnistyy
fetchHighScores();
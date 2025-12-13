/**
 * THE GAME - Main Script
 * Päälogiikka: pelisilmukka, renderöinti, äänentoisto ja High Score -integraatio.
 */

// --- 1. ALUSTUS JA DOM-ELEMENTIT ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// HUD ja ilmoitukset
const scoreEl = document.getElementById("scoreValue");
const timeEl = document.getElementById("timeValue");
const statusOverlay = document.getElementById("statusOverlay");
const statusTitleEl = document.getElementById("statusTitle");
const statusMessageEl = document.getElementById("statusMessage");

// Valikot ja napit
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");

// High Score -modaali
const nameModal = document.getElementById("nameInputModal");
const nameInput = document.getElementById("playerNameInput");
const submitNameBtn = document.getElementById("submitNameBtn");
const highScoreList = document.getElementById('highScoreList');

// Pelialueen mitat
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// --- 2. PELIN TILA JA ASETUKSET ---
const gameState = {
  score: 0,
  timeLeft: 60, // Peliaika sekunteina
  gameOver: false,
  lastTimestamp: 0,
  elapsed: 0,
};

let isGameRunning = false;

// Pelin objektit
let player;
let orbs = [];
let enemies = [];
let effects = [];

// --- 3. SYÖTTEEN KÄSITTELY (INPUT) ---
const keys = { up: false, down: false, left: false, right: false };

function handleKeyDown(e) {
  switch (e.key) {
    case "ArrowUp":    case "w": case "W": keys.up = true; break;
    case "ArrowDown":  case "s": case "S": keys.down = true; break;
    case "ArrowLeft":  case "a": case "A": keys.left = true; break;
    case "ArrowRight": case "d": case "D": keys.right = true; break;
  }
}

function handleKeyUp(e) {
  switch (e.key) {
    case "ArrowUp":    case "w": case "W": keys.up = false; break;
    case "ArrowDown":  case "s": case "S": keys.down = false; break;
    case "ArrowLeft":  case "a": case "A": keys.left = false; break;
    case "ArrowRight": case "d": case "D": keys.right = false; break;
  }
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// --- 4. ASSETIT JA AUDIO (WEB AUDIO API) ---

// Kuvat
const playerImage = new Image();
playerImage.src = "img/player.png";
const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 48;
const FRAME_COUNT = 9;

const orbImage = new Image();
orbImage.src = "img/star.png";

// Äänet
let audioCtx = null;
let collectBuffer = null;
let gameoverBuffer = null;
let bgMusic = new Audio("sounds/music.mp3");

bgMusic.loop = true;
bgMusic.volume = 0.3;

// Alustaa audiokontekstin ja lataa efektit muistiin
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  // Ladataan keräysääni
  if (!collectBuffer) {
    fetch("sounds/collect.mp3")
      .then((res) => res.arrayBuffer())
      .then((data) => audioCtx.decodeAudioData(data))
      .then((buffer) => { collectBuffer = buffer; })
      .catch((err) => console.error("Äänivirhe (collect):", err));
  }

  // Ladataan Game Over -ääni
  if (!gameoverBuffer) {
    fetch("sounds/gameover.mp3")
      .then((res) => res.arrayBuffer())
      .then((data) => audioCtx.decodeAudioData(data))
      .then((buffer) => { gameoverBuffer = buffer; })
      .catch((err) => console.error("Äänivirhe (gameover):", err));
  }
}

// Apufunktiot äänien soittamiseen
function playCollectSound() {
  if (!audioCtx || !collectBuffer) return;
  const source = audioCtx.createBufferSource();
  source.buffer = collectBuffer;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.4;
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

function playGameOverSound() {
  if (!audioCtx || !gameoverBuffer) return;
  const source = audioCtx.createBufferSource();
  source.buffer = gameoverBuffer;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.4;
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

// --- 5. LUOKAT (CLASSES) ---

// Pelaaja: Liikkuminen, animaatio ja törmäykset seiniin
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

    let dx = 0, dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;

    // Normalisoidaan liikevektori (ettei diagonaalinen liike ole nopeampaa)
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      
      // Animaation päivitys
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

    // Rajoitetaan pelialueelle
    this.x = Math.max(this.radius, Math.min(WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(HEIGHT - this.radius, this.y));

    // Seinätörmäys: palautetaan edelliseen sijaintiin
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
    }
  }

  draw(ctx) {
    const sx = this.frame * FRAME_WIDTH;
    ctx.drawImage(
      playerImage, sx, 0, FRAME_WIDTH, FRAME_HEIGHT,
      this.x - FRAME_WIDTH / 2, this.y - FRAME_HEIGHT / 2,
      FRAME_WIDTH, FRAME_HEIGHT
    );
  }
}

// Orb (Tähti): Kerättävä esine, joka sykkii
class Orb {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 12;
    this.collected = false;
    this.pulseOffset = Math.random() * Math.PI * 2;
  }

  draw(ctx) {
    if (this.collected) return;
    
    // Sykkivä efekti sin-aallolla
    const scale = 1 + 0.15 * Math.sin(this.pulseOffset + gameState.elapsed * 4);
    const w = (orbImage.width || 24) * scale;
    const h = (orbImage.height || 24) * scale;

    ctx.drawImage(orbImage, this.x - w/2, this.y - h/2, w, h);
  }
}

// Vihollinen: Kimpoilee seinistä ja reunoista
class Enemy {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.radius = 14;
    this.vx = vx; this.vy = vy;
  }

  update(dt, walls) {
    if (gameState.gameOver) return;
    const oldX = this.x;
    const oldY = this.y;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Reunatörmäys
    if (this.x - this.radius < 0 || this.x + this.radius > WIDTH) { this.vx *= -1; this.x = oldX; }
    if (this.y - this.radius < 0 || this.y + this.radius > HEIGHT) { this.vy *= -1; this.y = oldY; }
    
    // Seinätörmäys
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX; this.y = oldY;
      this.vx *= -1; this.vy *= -1;
    }
  }

  draw(ctx) {
    // Vihollisen grafiikka: Gradientti + silmät
    const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.4, this.x, this.y, this.radius);
    gradient.addColorStop(0, "#8b0000");
    gradient.addColorStop(1, "#ff0000");

    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = "#4a0404"; ctx.lineWidth = 2; ctx.stroke();

    // Silmät
    ctx.fillStyle = "#ffff00";
    const off = this.radius * 0.35;
    ctx.beginPath(); ctx.arc(this.x - off, this.y - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + off, this.y - 4, 3, 0, Math.PI * 2); ctx.fill();
  }
}

// Partikkeliefekti keräykselle
class CollectEffect {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.maxLife = 0.35;
    this.life = this.maxLife;
  }
  update(dt) { this.life -= dt; }
  get alive() { return this.life > 0; }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = "rgba(253, 224, 71, 0.9)";
    ctx.beginPath(); ctx.arc(this.x, this.y, 16 + t * 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- 6. KENTTÄ JA TÖRMÄYSLOGIIKKA ---

const walls = [
  { x: 40, y: 40, width: WIDTH - 80, height: 12 },
  { x: 40, y: HEIGHT - 52, width: WIDTH - 80, height: 12 },
  { x: 120, y: 140, width: 560, height: 12 },
  { x: 120, y: 260, width: 12, height: 160 },
  { x: WIDTH - 140, y: 200, width: 12, height: 180 },
  { x: 240, y: 360, width: 360, height: 12 },
];

function circleCollision(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
}

function circleRectCollision(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  return Math.pow(circle.x - closestX, 2) + Math.pow(circle.y - closestY, 2) < circle.radius * circle.radius;
}

function isCircleCollidingWithWalls(circle, walls) {
  return walls.some((wall) => circleRectCollision(circle, wall));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// --- 7. PELIN LOGIIKKA (SPAWN & UPDATE) ---

// Luodaan tähdet (varmistetaan ettei osu seinään tai pelaajaan)
function spawnOrbs(count) {
  orbs = [];
  let tries = 0;
  while (orbs.length < count && tries < count * 20) {
    tries++;
    const m = 40;
    const x = m + Math.random() * (WIDTH - m * 2);
    const y = m + Math.random() * (HEIGHT - m * 2);
    const orb = new Orb(x, y);

    if (!isCircleCollidingWithWalls(orb, walls) && (!player || Math.hypot(player.x - x, player.y - y) > 80)) {
      orbs.push(orb);
    }
  }
}

// Luodaan viholliset
function spawnEnemies() {
  enemies = [];
  const count = 2;
  const speed = 130;
  let tries = 0;

  while (enemies.length < count && tries < count * 30) {
    tries++;
    const m = 50;
    const x = m + Math.random() * (WIDTH - m * 2);
    const y = m + Math.random() * (HEIGHT - m * 2);
    const angle = Math.random() * Math.PI * 2;
    const enemy = new Enemy(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);

    if (!isCircleCollidingWithWalls(enemy, walls) && Math.hypot(enemy.x - WIDTH/2, enemy.y - (HEIGHT-100)) > 150) {
      enemies.push(enemy);
    }
  }
}

// Päivityssilmukka
function update(dt) {
  if (gameState.gameOver) return;

  // Aika
  gameState.elapsed += dt;
  gameState.timeLeft -= dt;
  if (gameState.timeLeft <= 0) {
    gameState.timeLeft = 0;
    endGame("Aika loppui!", `Keräsit ${gameState.score} tähteä.`);
  }
  timeEl.textContent = gameState.timeLeft.toFixed(1);

  // Objektit
  player.update(dt, walls);
  enemies.forEach((e) => e.update(dt, walls));

  // Orbien keräys
  orbs.forEach((orb) => {
    if (!orb.collected && circleCollision(player, orb)) {
      orb.collected = true;
      gameState.score += 1;
      gameState.timeLeft += 2; // Lisäaika
      scoreEl.textContent = gameState.score;
      effects.push(new CollectEffect(orb.x, orb.y));
      playCollectSound();
    }
  });

  // Viholliskontakti
  for (const enemy of enemies) {
    if (circleCollision(player, enemy)) {
      playGameOverSound();
      endGame("Osuit viholliseen!", `Lopullinen pistemäärä: ${gameState.score}.`);
      break;
    }
  }

  // Efektien siivous
  effects.forEach((e) => e.update(dt));
  effects = effects.filter((e) => e.alive);

  // Voittotarkistus
  if (!gameState.gameOver && orbs.every((o) => o.collected)) {
    endGame("Voitto!", `Keräsit kaikki tähdet ajassa ${(60 - gameState.timeLeft).toFixed(1)}s.`);
  }
}

// Piirto
function drawBackground(ctx) {
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g.addColorStop(0, "#0b1120");
  g.addColorStop(1, "#020617");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function draw() {
  drawBackground(ctx);
  ctx.fillStyle = "#1f2937";
  walls.forEach(w => ctx.fillRect(w.x, w.y, w.width, w.height));

  orbs.forEach(o => o.draw(ctx));
  enemies.forEach(e => e.draw(ctx));
  player.draw(ctx);
  effects.forEach(e => e.draw(ctx));
}

// Pääsilmukka (Request Animation Frame)
function gameLoop(timestamp) {
  if (!isGameRunning) return;
  if (!gameState.lastTimestamp) gameState.lastTimestamp = timestamp;
  
  const dt = (timestamp - gameState.lastTimestamp) / 1000;
  gameState.lastTimestamp = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

// --- 8. UI JA PELIN HALLINTA ---

function endGame(title, message) {
  gameState.gameOver = true;
  bgMusic.pause();
  
  canvas.style.cursor = "default";
  
  // Päivitetään valikon tekstit
  const h2 = startScreen.querySelector("h2");
  const p = startScreen.querySelector("p");
  if (h2) h2.textContent = title;
  if (p) p.innerHTML = `${message}<br><br><span style="color: #fbbf24; font-weight: bold;">Huipputulokset päivitetty alla!</span>`;
  
  if (startBtn) startBtn.textContent = "PELAA UUDELLEEN";
  startScreen.style.display = "flex";
  
  if (statusOverlay) statusOverlay.classList.add("hidden");

  // Tarkistetaan High Score
  setTimeout(() => checkHighScore(gameState.score), 500);
}

function resetGame() {
  gameState.score = 0;
  gameState.timeLeft = 60;
  gameState.gameOver = false;
  gameState.lastTimestamp = 0;
  gameState.elapsed = 0;
  
  player = new Player();
  Object.keys(keys).forEach(k => keys[k] = false);

  if (bgMusic.paused && isGameRunning) {
    bgMusic.currentTime = 0;
    bgMusic.play().catch(() => {});
  }

  effects = [];
  spawnOrbs(30);
  spawnEnemies();
}

// UI Event Listeners
submitNameBtn.addEventListener("click", () => {
  const name = nameInput.value;
  if (name && name.trim().length > 0) {
    submitScore(name, gameState.score);
    nameModal.style.display = "none";
  } else {
    alert("Kirjoita jokin nimi!");
  }
});

// Enter-näppäin nimikentässä
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitNameBtn.click();
});

function handleStartClick() {
  initAudio();
  bgMusic.currentTime = 0;
  bgMusic.play().catch(e => console.log("Audio autoplay estetty:", e));
  
  canvas.style.cursor = "none";
  startScreen.style.display = "none";
  
  Object.keys(keys).forEach(k => keys[k] = false);
  isGameRunning = true;
  resetGame();
  requestAnimationFrame(gameLoop);
}

if (startBtn) startBtn.addEventListener("click", handleStartClick);

// --- 9. DREAMLO API (HIGH SCORE) ---

const PRIVATE_CODE = "n9F_ouNjTk2SATw0ySYvDAACQDPrWwFUyODxZB8sDsuA"; 
const PUBLIC_CODE = "693a98da8f40bb1004505edf"; 
const BASE_URL = "https://corsproxy.io/?http://dreamlo.com/lb/";

// Lähettää tuloksen
function submitScore(name, score) {
  const safeName = name.replace(/[^a-zA-Z0-9öäåÖÄÅ]/g, "").substring(0, 12) || "Tuntematon";
  const url = `${BASE_URL}${PRIVATE_CODE}/add/${safeName}/${score}`;
  
  fetch(url)
    .then(() => {
      // Odotetaan hetki ennen listan päivitystä
      setTimeout(fetchHighScores, 1000);
    })
    .catch(err => console.error("Virhe tallennuksessa:", err));
}

// Hakee listan
function fetchHighScores() {
  if (!highScoreList) return;
  const url = `${BASE_URL}${PUBLIC_CODE}/json/5?nocache=${new Date().getTime()}`;
  highScoreList.innerHTML = "<li>Ladataan tuloksia...</li>";

  fetch(url)
    .then(res => res.json())
    .then(data => {
      let scores = [];
      if (data.dreamlo && data.dreamlo.leaderboard && data.dreamlo.leaderboard.entry) {
        const entry = data.dreamlo.leaderboard.entry;
        scores = Array.isArray(entry) ? entry : [entry];
      }
      
      if (scores.length === 0) {
        highScoreList.innerHTML = "<li>Ei tuloksia vielä.</li>";
      } else {
        highScoreList.innerHTML = scores.map(e => `
          <li style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 4px 0;">
            <span>${e.name}</span>
            <span style="color: #fbbf24; font-weight: bold;">${e.score}</span>
          </li>`).join('');
      }
    })
    .catch(err => {
      highScoreList.innerHTML = "<li>Yhteysvirhe listaan.</li>";
      console.error("Fetch error:", err);
    });
}

// Tarkistaa pääseekö listalle
function checkHighScore(score) {
  if (score <= 0) { fetchHighScores(); return; }
  
  const LIST_LIMIT = 5;
  const url = `${BASE_URL}${PUBLIC_CODE}/json/${LIST_LIMIT}?nocache=${new Date().getTime()}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      let scores = [];
      if (data.dreamlo && data.dreamlo.leaderboard && data.dreamlo.leaderboard.entry) {
        const entry = data.dreamlo.leaderboard.entry;
        scores = Array.isArray(entry) ? entry : [entry];
      }

      let qualifies = false;
      if (scores.length < LIST_LIMIT) {
        qualifies = true;
      } else {
        const lowest = Math.min(...scores.map(s => parseInt(s.score)));
        if (score > lowest) qualifies = true;
      }

      if (qualifies) {
        nameModal.style.display = "flex";
        nameInput.value = "";
        nameInput.focus();
      } else {
        fetchHighScores();
      }
    })
    .catch(() => fetchHighScores());
}

// Ladataan alustava lista
drawBackground(ctx);
fetchHighScores();
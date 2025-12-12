/*
 * THE GAME - Main Script
 * Päälogiikka, pelisilmukka ja API-integraatiot.
 */

// --- DOM-ELEMENTIT JA ALUSTUS ---
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// UI-elementit
const scoreEl = document.getElementById("scoreValue");
const timeEl = document.getElementById("timeValue");
const statusOverlay = document.getElementById("statusOverlay");
const statusTitleEl = document.getElementById("statusTitle");
const statusMessageEl = document.getElementById("statusMessage");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");

// High Score -modaalin elementit
const nameModal = document.getElementById("nameInputModal");
const nameInput = document.getElementById("playerNameInput");
const submitNameBtn = document.getElementById("submitNameBtn");
const highScoreList = document.getElementById('highScoreList');

// Vakioarvot
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// --- PELIN TILA ---
const gameState = {
  score: 0,
  timeLeft: 60,
  gameOver: false,
  lastTimestamp: 0,
  elapsed: 0,
};

let isGameRunning = false;
let player, orbs = [], enemies = [], effects = [];

// --- SYÖTTEEN KÄSITTELY (Input Handling) ---
const keys = { up: false, down: false, left: false, right: false };

function handleKeyDown(e) {
  switch (e.key) {
    case "ArrowUp": case "w": case "W": keys.up = true; break;
    case "ArrowDown": case "s": case "S": keys.down = true; break;
    case "ArrowLeft": case "a": case "A": keys.left = true; break;
    case "ArrowRight": case "d": case "D": keys.right = true; break;
  }
}

function handleKeyUp(e) {
  switch (e.key) {
    case "ArrowUp": case "w": case "W": keys.up = false; break;
    case "ArrowDown": case "s": case "S": keys.down = false; break;
    case "ArrowLeft": case "a": case "A": keys.left = false; break;
    case "ArrowRight": case "d": case "D": keys.right = false; break;
  }
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// --- ASSETIT (Kuvat) ---
const playerImage = new Image();
playerImage.src = "img/player.png";

const orbImage = new Image();
orbImage.src = "img/star.png";

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 48;
const FRAME_COUNT = 9;

// --- ÄÄNIJÄRJESTELMÄ (Web Audio API) ---
let audioCtx = null;
let collectBuffer = null;
let gameoverBuffer = null;
let bgMusic = new Audio("sounds/music.mp3");

// Taustamusiikin asetukset
bgMusic.loop = true;
bgMusic.volume = 0.3;

// Alustaa audiokontekstin ja esilataa ääniefektit
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  // Ladataan ääniefektit vain kerran muistiin
  if (!collectBuffer) loadSound("sounds/collect.mp3", (buf) => collectBuffer = buf);
  if (!gameoverBuffer) loadSound("sounds/gameover.mp3", (buf) => gameoverBuffer = buf);
}

// Apufunktio äänen lataamiseen
function loadSound(url, callback) {
  fetch(url)
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => callback(buffer))
    .catch(err => console.error(`Virhe ladattaessa ääntä ${url}:`, err));
}

function playSound(buffer, volume = 0.4) {
  if (!audioCtx || !buffer) return;
  
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

// --- PELILUOKAT ---

// Pelaaja
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

    // Liikelogiikka
    let dx = 0, dy = 0;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;

    // Normalisoidaan diagonaalinen liike
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;

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

    // Seinätörmäys: palautetaan vanhaan sijaintiin
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
    }
  }

  draw(ctx) {
    const sx = this.frame * FRAME_WIDTH;
    ctx.drawImage(
      playerImage,
      sx, 0, FRAME_WIDTH, FRAME_HEIGHT,
      this.x - FRAME_WIDTH / 2, this.y - FRAME_HEIGHT / 2,
      FRAME_WIDTH, FRAME_HEIGHT
    );
  }
}

// Kerättävä tähti (Orb)
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
    
    // Pulssaava efekti
    const scale = 1 + 0.15 * Math.sin(this.pulseOffset + gameState.elapsed * 4);
    const w = (orbImage.width || 24) * scale;
    const h = (orbImage.height || 24) * scale;

    ctx.drawImage(orbImage, this.x - w / 2, this.y - h / 2, w, h);
  }
}

// Vihollinen
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

    // Kimmpoaminen reunoista
    if (this.x - this.radius < 0 || this.x + this.radius > WIDTH) {
      this.vx *= -1;
      this.x = oldX;
    }
    if (this.y - this.radius < 0 || this.y + this.radius > HEIGHT) {
      this.vy *= -1;
      this.y = oldY;
    }

    // Kimmpoaminen seinistä
    if (isCircleCollidingWithWalls(this, walls)) {
      this.x = oldX;
      this.y = oldY;
      this.vx *= -1;
      this.vy *= -1;
    }
  }

  draw(ctx) {
    // Vihollisen grafiikka (gradient + silmät)
    const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.4, this.x, this.y, this.radius);
    gradient.addColorStop(0, "#8b0000");
    gradient.addColorStop(1, "#ff0000");

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = "#4a0404";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Silmät
    ctx.fillStyle = "#ffff00";
    const offX = this.radius * 0.35;
    const offY = this.radius * 0.2;
    const size = this.radius * 0.2;
    
    ctx.beginPath(); ctx.arc(this.x - offX, this.y - offY, size, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + offX, this.y - offY, size, 0, Math.PI * 2); ctx.fill();
  }
}

// Partikkeliefekti keräykselle
class CollectEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.maxLife = 0.35;
    this.life = this.maxLife;
  }

  update(dt) { this.life -= dt; }
  get alive() { return this.life > 0; }

  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const radius = 16 + t * 32;
    
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = "rgba(253, 224, 71, 0.9)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- TÖRMÄYSTARKISTUKSET JA KENTTÄ ---

const walls = [
  { x: 40, y: 40, width: WIDTH - 80, height: 12 },
  { x: 40, y: HEIGHT - 52, width: WIDTH - 80, height: 12 },
  { x: 120, y: 140, width: 560, height: 12 },
  { x: 120, y: 260, width: 12, height: 160 },
  { x: WIDTH - 140, y: 200, width: 12, height: 180 },
  { x: 240, y: 360, width: 360, height: 12 },
];

function circleCollision(a, b) {
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  return dist < a.radius + b.radius;
}

function circleRectCollision(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(rect.x + rect.width, circle.x));
  const closestY = Math.max(rect.y, Math.min(rect.y + rect.height, circle.y));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function isCircleCollidingWithWalls(circle, walls) {
  return walls.some(wall => circleRectCollision(circle, wall));
}

// --- OBJEKTIEN LUONTI (Spawning) ---

function spawnOrbs(count) {
  orbs = [];
  let tries = 0;
  while (orbs.length < count && tries < count * 20) {
    tries++;
    const margin = 40;
    const x = margin + Math.random() * (WIDTH - margin * 2);
    const y = margin + Math.random() * (HEIGHT - margin * 2);
    const orb = new Orb(x, y);

    // Varmistetaan, ettei tähti synny seinän sisään tai pelaajan päälle
    if (!isCircleCollidingWithWalls(orb, walls) && (!player || Math.hypot(player.x - x, player.y - y) > 80)) {
      orbs.push(orb);
    }
  }
}

function spawnEnemies() {
  enemies = [];
  const count = 25;
  const speed = 130;
  let tries = 0;

  while (enemies.length < count && tries < count * 30) {
    tries++;
    const margin = 50;
    const x = margin + Math.random() * (WIDTH - margin * 2);
    const y = margin + Math.random() * (HEIGHT - margin * 2);
    const angle = Math.random() * Math.PI * 2;
    
    const enemy = new Enemy(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);

    if (!isCircleCollidingWithWalls(enemy, walls) && Math.hypot(enemy.x - (WIDTH/2), enemy.y - (HEIGHT-100)) > 150) {
      enemies.push(enemy);
    }
  }
}

// --- PELISILMUKKA (Update & Draw) ---

function update(dt) {
  if (gameState.gameOver) return;

  // Ajan päivitys
  gameState.elapsed += dt;
  gameState.timeLeft -= dt;
  if (gameState.timeLeft <= 0) {
    gameState.timeLeft = 0;
    endGame("Aika loppui!", `Keräsit ${gameState.score} tähteä.`);
  }
  timeEl.textContent = gameState.timeLeft.toFixed(1);

  // Objektien päivitys
  player.update(dt, walls);
  enemies.forEach(e => e.update(dt, walls));

  // Tähtien keräys
  orbs.forEach(orb => {
    if (!orb.collected && circleCollision(player, orb)) {
      orb.collected = true;
      gameState.score += 1;
      gameState.timeLeft += 2; // Lisäaikaa
      scoreEl.textContent = gameState.score;
      effects.push(new CollectEffect(orb.x, orb.y));
      playSound(collectBuffer, 0.4);
    }
  });

  // Vihollistörmäys
  for (const enemy of enemies) {
    if (circleCollision(player, enemy)) {
      playSound(gameoverBuffer, 0.4);
      endGame("Osuit viholliseen!", `Lopullinen pistemäärä: ${gameState.score}.`);
      break;
    }
  }

  // Efektien siivous ja voittoehto
  effects.forEach(e => e.update(dt));
  effects = effects.filter(e => e.alive);

  if (!gameState.gameOver && orbs.every(o => o.collected)) {
    endGame("Voitto!", `Keräsit kaikki tähdet ajassa ${(60 - gameState.timeLeft).toFixed(1)}s.`);
  }
}

function draw() {
  // Piirretään tausta ja elementit
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // Seinät
  ctx.fillStyle = "#1f2937";
  walls.forEach(w => ctx.fillRect(w.x, w.y, w.width, w.height));

  orbs.forEach(o => o.draw(ctx));
  enemies.forEach(e => e.draw(ctx));
  player.draw(ctx);
  effects.forEach(e => e.draw(ctx));
}

function gameLoop(timestamp) {
  if (!isGameRunning) return;

  if (!gameState.lastTimestamp) gameState.lastTimestamp = timestamp;
  const dt = (timestamp - gameState.lastTimestamp) / 1000;
  gameState.lastTimestamp = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// --- UI LOGIIKKA (Start, End, Reset) ---

function handleStartClick() {
  initAudio();
  bgMusic.currentTime = 0;
  bgMusic.play().catch(e => console.log("Musiikin autoplay estetty:", e));
  
  // UI-muutokset
  canvas.style.cursor = "none";
  if (startScreen) startScreen.style.display = "none";

  // Nollataan syöte
  Object.keys(keys).forEach(k => keys[k] = false);

  isGameRunning = true;
  resetGame();
  requestAnimationFrame(gameLoop);
}

function resetGame() {
  gameState.score = 0;
  gameState.timeLeft = 60;
  gameState.gameOver = false;
  gameState.lastTimestamp = 0;
  gameState.elapsed = 0;
  
  player = new Player();
  
  // UI ja musiikki
  if (statusOverlay) statusOverlay.classList.add("hidden");
  if (bgMusic.paused && isGameRunning) {
    bgMusic.currentTime = 0;
    bgMusic.play().catch(() => {});
  }

  // Luodaan kenttä
  effects = [];
  spawnOrbs(30);
  spawnEnemies();
}

function endGame(title, message) {
  gameState.gameOver = true;
  bgMusic.pause();
  
  // UI päivitys
  canvas.style.cursor = "default";
  
  const menuTitle = startScreen.querySelector("h2");
  const menuText = startScreen.querySelector("p");
  
  if (menuTitle) menuTitle.textContent = title;
  if (menuText) {
    menuText.innerHTML = `${message}<br><br><span style="color: #fbbf24; font-weight: bold;">Huipputulokset päivitetty alla!</span>`;
  }
  if (startBtn) startBtn.textContent = "PELAA UUDELLEEN";

  startScreen.style.display = "flex";
  if (statusOverlay) statusOverlay.classList.add("hidden");

  // Tarkistetaan High Score pienellä viiveellä
  setTimeout(() => checkHighScore(gameState.score), 500);
}

// --- DREAMLO HIGH SCORE API ---

const PRIVATE_CODE = "n9F_ouNjTk2SATw0ySYvDAACQDPrWwFUyODxZB8sDsuA"; 
const PUBLIC_CODE = "693a98da8f40bb1004505edf"; 
const BASE_URL = "https://corsproxy.io/?http://dreamlo.com/lb/";

// Lähettää tuloksen pilveen
function submitScore(name, score) {
  const safeName = name.replace(/[^a-zA-Z0-9öäåÖÄÅ]/g, "").substring(0, 12) || "Tuntematon";
  const url = `${BASE_URL}${PRIVATE_CODE}/add/${safeName}/${score}`;
  
  fetch(url)
    .then(() => setTimeout(fetchHighScores, 1000)) // Päivitetään lista viiveellä
    .catch(err => console.error("Virhe tallennuksessa:", err));
}

// Hakee ja näyttää listan
function fetchHighScores() {
  if (!highScoreList) return;
  
  // Käytetään aikaleimaa välimuistin ohitukseen (?nocache)
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
        highScoreList.innerHTML = scores
          .map(e => `
            <li style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 4px 0;">
              <span>${e.name}</span>
              <span style="color: #fbbf24; font-weight: bold;">${e.score}</span>
            </li>`)
          .join('');
      }
    })
    .catch(err => {
      highScoreList.innerHTML = "<li>Yhteysvirhe listaan.</li>";
      console.error("Fetch error:", err);
    });
}

// Tarkistaa, onko tulos Top 5 -kelpoinen
function checkHighScore(score) {
  if (score <= 0) {
    fetchHighScores();
    return;
  }

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

      // Logiikka: Jos listalla tilaa TAI tulos parempi kuin huonoin
      let qualifies = scores.length < LIST_LIMIT;
      if (!qualifies) {
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

// Kuuntelijat napeille
submitNameBtn.addEventListener("click", () => {
  const name = nameInput.value;
  if (name && name.trim().length > 0) {
    submitScore(name, gameState.score);
    nameModal.style.display = "none";
  } else {
    alert("Kirjoita jokin nimi!");
  }
});

if (startBtn) startBtn.addEventListener("click", handleStartClick);

// Alustava haku käynnistyksessä
drawBackground(ctx);
fetchHighScores();
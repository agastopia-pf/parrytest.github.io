const hud = {
  rank: document.getElementById("styleRank"),
  score: document.getElementById("score"),
  wave: document.getElementById("wave"),
  combo: document.getElementById("combo"),
  healthBar: document.getElementById("healthBar"),
  parryBindLabel: document.getElementById("parryBindLabel"),
  centerPrompt: document.getElementById("centerPrompt"),
  startBtn: document.getElementById("startBtn"),
  renderRoot: document.getElementById("renderRoot"),
  impactFrame: document.getElementById("impactFrame"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsToggle: document.getElementById("settingsToggle"),
  closeSettings: document.getElementById("closeSettings"),
  rebindBtn: document.getElementById("rebindBtn"),
  hitstopInput: document.getElementById("hitstopInput"),
  volumeInput: document.getElementById("volumeInput"),
  settingsStatus: document.getElementById("settingsStatus"),
};

const config = {
  parryKey: "Space",
  allowRightClick: true,
  hitstopMs: 90,
  volume: 0.8,
};

const state = {
  gameState: "menu",
  score: 0,
  combo: 0,
  health: 100,
  rankIndex: 0,
  wave: 1,
  nextWaveTimer: 0,
  parryUntil: 0,
  parryCooldownUntil: 0,
  freezeUntil: 0,
  lastTime: performance.now(),
  rebinding: false,
  viewX: 0,
};

const ranks = ["E", "D", "C", "B", "A", "S", "ULTRA"];

const world = {
  enemies: [],
  fireballs: [],
  particles: [],
};

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
hud.renderRoot.appendChild(canvas);

const audio = {
  ctx: null,
  master: null,
  buffers: new Map(),
};

const SOUND_FILES = {
  parry: "sounds/parry.wav",
  hit: "sounds/hit.wav",
  enemyDeath: "sounds/enemy_death.wav",
  shoot: "sounds/fireball.wav",
};

async function initAudio() {
  try {
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = config.volume;
    audio.master.connect(audio.ctx.destination);

    let loaded = 0;
    await Promise.all(Object.entries(SOUND_FILES).map(async ([key, path]) => {
      try {
        const res = await fetch(path);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        const buffer = await audio.ctx.decodeAudioData(arr.slice(0));
        audio.buffers.set(key, buffer);
        loaded += 1;
      } catch (_) {
        // graceful fallback to synth beep
      }
    }));

    hud.settingsStatus.textContent = loaded > 0
      ? `Audio: loaded ${loaded} local sound file(s).`
      : "Audio: no local files found, using fallback synth bleeps.";
  } catch (_) {
    hud.settingsStatus.textContent = "Audio unavailable in this browser; running silent fallback.";
  }
}

function playSound(name) {
  if (!audio.ctx || !audio.master) return;
  if (audio.ctx.state === "suspended") audio.ctx.resume();

  const buffer = audio.buffers.get(name);
  if (buffer) {
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.master);
    src.start();
    return;
  }

  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  const tones = { parry: 880, hit: 160, enemyDeath: 220, shoot: 320 };
  osc.frequency.value = tones[name] || 400;
  osc.type = name === "parry" ? "triangle" : "square";
  gain.gain.value = 0.07;
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + 0.1);
  osc.stop(audio.ctx.currentTime + 0.1);
}

function resize() {
  const rect = hud.renderRoot.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * window.devicePixelRatio);
  canvas.height = Math.floor(rect.height * window.devicePixelRatio);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}

function spawnWave(wave) {
  world.enemies.length = 0;
  const count = Math.min(5 + wave, 13);
  for (let i = 0; i < count; i += 1) {
    world.enemies.push({
      x: -12 + (i % 7) * 4,
      z: -35 - Math.floor(i / 7) * 8,
      hp: 2 + Math.floor(wave / 3),
      speed: 2 + Math.random() * 0.8,
      dir: Math.random() > 0.5 ? 1 : -1,
      cooldown: 0.6 + Math.random() * 1.3,
      shotSpeed: 18 + wave * 0.7,
    });
  }
}

function startRun() {
  state.gameState = "playing";
  state.score = 0;
  state.combo = 0;
  state.health = 100;
  state.rankIndex = 0;
  state.wave = 1;
  state.nextWaveTimer = 0;
  state.parryUntil = 0;
  state.parryCooldownUntil = 0;
  state.freezeUntil = 0;
  world.fireballs.length = 0;
  world.particles.length = 0;
  spawnWave(state.wave);
  updateHud();
  hud.centerPrompt.style.display = "none";
}

function gameOver() {
  state.gameState = "menu";
  hud.centerPrompt.style.display = "block";
  hud.centerPrompt.querySelector("h1").textContent = "RUN ENDED";
  hud.centerPrompt.querySelector("p").textContent = `Wave ${String(state.wave).padStart(2, "0")} reached. Re-init and parry cleaner.`;
  hud.startBtn.textContent = "RETRY RUN";
}

function updateHud() {
  hud.score.textContent = String(state.score).padStart(6, "0");
  hud.combo.textContent = `x${state.combo}`;
  hud.healthBar.style.width = `${state.health}%`;
  hud.rank.textContent = ranks[state.rankIndex];
  hud.wave.textContent = String(state.wave).padStart(2, "0");
  hud.parryBindLabel.textContent = config.allowRightClick ? `${config.parryKey} / RMB` : config.parryKey;
}

function updateRank() {
  state.rankIndex = Math.min(ranks.length - 1, Math.floor((state.combo + state.score / 850) / 2));
  updateHud();
}

function impactFlash() {
  anime.remove(hud.impactFrame);
  anime.timeline()
    .add({ targets: hud.impactFrame, opacity: [0, 1], duration: 36, easing: "linear" })
    .add({ targets: hud.impactFrame, opacity: 0, duration: 130, easing: "easeOutQuad" });
}

function hitStop(ms = config.hitstopMs) {
  state.freezeUntil = Math.max(state.freezeUntil, performance.now() + ms);
}

function triggerParry() {
  if (state.gameState !== "playing") return;
  const now = performance.now();
  if (now < state.parryCooldownUntil) return;

  state.parryUntil = now + 180;
  state.parryCooldownUntil = now + 220;
}

function spawnParticle(x, z, color, count = 10) {
  for (let i = 0; i < count; i += 1) {
    world.particles.push({
      x,
      z,
      vx: (Math.random() - 0.5) * 14,
      vz: (Math.random() - 0.7) * 14,
      life: 0.25 + Math.random() * 0.25,
      color,
    });
  }
}

function updateGame(dt) {
  if (state.gameState !== "playing") return;

  if (world.enemies.length === 0) {
    state.nextWaveTimer += dt;
    if (state.nextWaveTimer > 1.1) {
      state.wave += 1;
      state.nextWaveTimer = 0;
      spawnWave(state.wave);
      state.score += 700;
      updateRank();
    }
    return;
  }

  const now = performance.now();
  const parryActive = now < state.parryUntil;

  for (const e of world.enemies) {
    e.x += e.dir * e.speed * dt;
    if (e.x > 13 || e.x < -13) e.dir *= -1;

    e.cooldown -= dt;
    if (e.cooldown <= 0) {
      world.fireballs.push({
        x: e.x,
        z: e.z + 1.5,
        vx: (state.viewX - e.x) * 0.38,
        vz: e.shotSpeed,
        reflected: false,
      });
      e.cooldown = Math.max(0.35, 1.3 - state.wave * 0.04) + Math.random() * 0.85;
      playSound("shoot");
    }
  }

  for (let i = world.fireballs.length - 1; i >= 0; i -= 1) {
    const f = world.fireballs[i];
    f.x += f.vx * dt;
    f.z += f.vz * dt;

    const canTouchPlayer = f.z > -0.8;
    const nearAim = Math.abs(f.x - state.viewX) < 2.1;

    if (!f.reflected && parryActive && canTouchPlayer && nearAim) {
      f.reflected = true;
      const target = world.enemies.reduce((best, e) => {
        const d = Math.hypot(e.x - f.x, e.z - f.z);
        return !best || d < best.d ? { e, d } : best;
      }, null);

      if (target) {
        const dx = target.e.x - f.x;
        const dz = target.e.z - f.z;
        const len = Math.hypot(dx, dz) || 1;
        f.vx = (dx / len) * 28;
        f.vz = (dz / len) * 28;
      } else {
        f.vz = -26;
      }

      state.combo += 1;
      state.score += 130 + state.combo * 26;
      updateRank();
      playSound("parry");
      spawnParticle(f.x, f.z, "#ffe1a1", 16);
      impactFlash();
      hitStop();
      continue;
    }

    if (!f.reflected && canTouchPlayer && nearAim) {
      world.fireballs.splice(i, 1);
      state.health = Math.max(0, state.health - 14);
      state.combo = 0;
      updateHud();
      playSound("hit");
      spawnParticle(state.viewX, -0.2, "#ff6f62", 12);
      impactFlash();
      hitStop(Math.max(60, config.hitstopMs - 30));
      if (state.health <= 0) gameOver();
      continue;
    }

    if (f.reflected) {
      for (let e = world.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = world.enemies[e];
        if (Math.hypot(f.x - enemy.x, f.z - enemy.z) < 1.5) {
          enemy.hp -= 1;
          world.fireballs.splice(i, 1);
          state.score += 320 + state.combo * 32;
          if (enemy.hp <= 0) {
            world.enemies.splice(e, 1);
            state.score += 500;
            playSound("enemyDeath");
            spawnParticle(enemy.x, enemy.z, "#ff8f84", 20);
            hitStop(config.hitstopMs + 25);
          }
          updateRank();
          break;
        }
      }
    }

    if (f.z > 3 || f.z < -65 || Math.abs(f.x) > 50) {
      world.fireballs.splice(i, 1);
    }
  }

  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
}

function project(x, z) {
  const depth = Math.max(1, -z + 2.5);
  const s = 220 / depth;
  return {
    x: canvas.clientWidth * 0.5 + (x - state.viewX * 0.35) * s,
    y: canvas.clientHeight * 0.5 + 40 / depth,
    scale: s,
    depth,
  };
}

function drawBackground() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, "#36140d");
  sky.addColorStop(1, "#120706");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.57);

  const floor = ctx.createLinearGradient(0, h * 0.57, 0, h);
  floor.addColorStop(0, "#190907");
  floor.addColorStop(1, "#050202");
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.57, w, h);

  ctx.strokeStyle = "rgba(255,82,60,0.18)";
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    const y = h * (0.58 + t * 0.41);
    const spread = w * (0.12 + t * 0.44);
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - spread, y);
    ctx.lineTo(w * 0.5 + spread, y);
    ctx.stroke();
  }
}

function drawEntitySprite(entity, color, widthMul = 1) {
  const p = project(entity.x, entity.z);
  const h = p.scale * 1.9;
  const w = h * 0.65 * widthMul;
  ctx.fillStyle = color;
  ctx.fillRect(p.x - w * 0.5, p.y - h, w, h);
  ctx.fillStyle = "rgba(255,215,190,0.75)";
  ctx.fillRect(p.x - w * 0.16, p.y - h * 0.76, w * 0.32, h * 0.2);
}

function drawScene() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  drawBackground();

  const drawables = [];
  for (const e of world.enemies) drawables.push({ t: "enemy", z: e.z, e });
  for (const f of world.fireballs) drawables.push({ t: "fireball", z: f.z, f });
  for (const p of world.particles) drawables.push({ t: "particle", z: p.z, p });
  drawables.sort((a, b) => a.z - b.z);

  for (const d of drawables) {
    if (d.t === "enemy") {
      drawEntitySprite(d.e, "#d82920");
      continue;
    }

    if (d.t === "fireball") {
      const p = project(d.f.x, d.f.z);
      const r = Math.max(2.8, p.scale * 0.22);
      ctx.fillStyle = d.f.reflected ? "#ffe3a7" : "#ff4b39";
      ctx.beginPath();
      ctx.arc(p.x, p.y - r * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const p = project(d.p.x, d.p.z);
    ctx.fillStyle = d.p.color;
    ctx.globalAlpha = Math.max(0, d.p.life * 3);
    ctx.fillRect(p.x, p.y, 2.5, 2.5);
    ctx.globalAlpha = 1;
  }

  if (state.gameState === "playing" && performance.now() < state.parryUntil) {
    ctx.strokeStyle = "rgba(255, 236, 173, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.52, 60, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function frame(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.033);
  state.lastTime = now;

  if (now >= state.freezeUntil) {
    updateGame(dt);
  }

  drawScene();
  requestAnimationFrame(frame);
}

hud.startBtn.addEventListener("click", startRun);

hud.settingsToggle.addEventListener("click", () => {
  hud.settingsPanel.classList.remove("hidden");
});

hud.closeSettings.addEventListener("click", () => {
  hud.settingsPanel.classList.add("hidden");
  state.rebinding = false;
  hud.rebindBtn.textContent = "REBIND";
});

hud.rebindBtn.addEventListener("click", () => {
  state.rebinding = true;
  hud.rebindBtn.textContent = "PRESS KEY...";
});

hud.hitstopInput.addEventListener("input", () => {
  config.hitstopMs = Number(hud.hitstopInput.value);
});

hud.volumeInput.addEventListener("input", () => {
  config.volume = Number(hud.volumeInput.value) / 100;
  if (audio.master) audio.master.gain.value = config.volume;
});

window.addEventListener("keydown", (event) => {
  if (state.rebinding) {
    config.parryKey = event.code;
    state.rebinding = false;
    hud.rebindBtn.textContent = `KEY: ${event.code}`;
    updateHud();
    return;
  }

  if (event.code === config.parryKey) {
    event.preventDefault();
    triggerParry();
  }
});

window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("mousedown", (event) => {
  if (event.button === 2 && config.allowRightClick) triggerParry();
});

window.addEventListener("mousemove", (event) => {
  const rect = hud.renderRoot.getBoundingClientRect();
  if (rect.width <= 0) return;
  const n = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.viewX = Math.max(-12, Math.min(12, n * 12));
});

window.addEventListener("resize", resize);

resize();
updateHud();
initAudio();
requestAnimationFrame(frame);

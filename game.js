const hud = {
  styleRank: document.getElementById("styleRank"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  healthBar: document.getElementById("healthBar"),
  centerPrompt: document.getElementById("centerPrompt"),
  startBtn: document.getElementById("startBtn"),
  flash: document.getElementById("flash"),
  renderRoot: document.getElementById("renderRoot"),
};

let gameState = "menu";
let score = 0;
let combo = 0;
let health = 100;
let rankIndex = 0;
const ranks = ["E", "D", "C", "B", "A", "S", "DOOM"];

const player = {
  x: 0,
  parryWindowMs: 220,
  parryUntil: 0,
};

const enemies = [];
const fireballs = [];

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0605, 12, 80);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 140);
camera.position.set(0, 1.7, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x090404);
hud.renderRoot.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x8c4435, 0.45);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xff7152, 0.6);
keyLight.position.set(2, 4, 6);
scene.add(keyLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(65, 150),
  new THREE.MeshStandardMaterial({ color: 0x1a0c09, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -0.55, -30);
scene.add(floor);

const corridorLines = [];
for (let i = 0; i < 10; i += 1) {
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.01, 150),
    new THREE.MeshBasicMaterial({ color: 0x6b2a20 })
  );
  line.position.set(-9 + i * 2, -0.5, -30);
  scene.add(line);
  corridorLines.push(line);
}

function spawnEnemy(x, z) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 2.2, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xcc241d, emissive: 0x2f0907, roughness: 0.8 })
  );
  body.position.set(x, 0.55, z);
  scene.add(body);

  enemies.push({
    mesh: body,
    x,
    z,
    hp: 2,
    dir: Math.random() > 0.5 ? 1 : -1,
    cooldown: 500 + Math.random() * 900,
  });
}

function resetWave() {
  for (const e of enemies) scene.remove(e.mesh);
  enemies.length = 0;

  for (let i = 0; i < 6; i += 1) {
    spawnEnemy(-8 + i * 3.2, -22 - (i % 2) * 6);
  }
}

function createFireball(x, y, z, vz, reflected = false) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 14, 14),
    new THREE.MeshStandardMaterial({
      color: reflected ? 0xffd885 : 0xff4736,
      emissive: reflected ? 0x7a5d22 : 0x72180f,
      emissiveIntensity: 1,
    })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);

  fireballs.push({
    mesh,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz,
    reflected,
    target: null,
  });
}

function pulseFlash() {
  anime.remove(hud.flash);
  anime.timeline()
    .add({ targets: hud.flash, opacity: [0, 1], duration: 70, easing: "linear" })
    .add({ targets: hud.flash, opacity: 0, duration: 180, easing: "easeOutQuad" });
}

function parryNow() {
  if (gameState !== "playing") return;
  player.parryUntil = performance.now() + player.parryWindowMs;
}

function updateHud() {
  hud.score.textContent = String(score).padStart(6, "0");
  hud.combo.textContent = `x${combo}`;
  hud.healthBar.style.width = `${health}%`;
  hud.styleRank.textContent = ranks[rankIndex];
}

function updateStyle() {
  rankIndex = Math.min(ranks.length - 1, Math.floor((combo + score / 950) / 2));
  updateHud();
}

function startGame() {
  gameState = "playing";
  score = 0;
  combo = 0;
  health = 100;
  rankIndex = 0;
  player.parryUntil = 0;

  for (const fireball of fireballs) scene.remove(fireball.mesh);
  fireballs.length = 0;
  resetWave();
  updateHud();

  hud.centerPrompt.style.display = "none";
}

function gameOver() {
  gameState = "menu";
  hud.centerPrompt.style.display = "block";
  hud.centerPrompt.querySelector("h1").textContent = "FEED LOST";
  hud.centerPrompt.querySelector("p").textContent = "Parry timing failed. Reconnect and reflect more hellfire.";
  hud.startBtn.textContent = "RECONNECT";
}

function updateGame(dt) {
  if (gameState !== "playing") return;

  const parryActive = performance.now() < player.parryUntil;

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    enemy.x += enemy.dir * dt * 2.6;
    if (enemy.x < -10 || enemy.x > 10) enemy.dir *= -1;

    enemy.cooldown -= dt * 1000;
    if (enemy.cooldown <= 0) {
      createFireball(enemy.x, 0.7, enemy.z + 0.8, 13 + Math.random() * 2.5);
      enemy.cooldown = 700 + Math.random() * 900;
    }

    enemy.mesh.position.x = enemy.x;
  }

  for (let i = fireballs.length - 1; i >= 0; i -= 1) {
    const f = fireballs[i];

    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.mesh.position.set(f.x, f.y, f.z);

    const nearPlayer = f.z > 6.1 && Math.abs(f.x - player.x) < 2.4;

    if (!f.reflected && parryActive && nearPlayer) {
      f.reflected = true;
      const nearest = enemies.reduce((best, e) => {
        const d = Math.hypot(e.x - f.x, e.z - f.z);
        if (!best || d < best.d) return { enemy: e, d };
        return best;
      }, null);

      if (nearest) {
        const dx = nearest.enemy.x - f.x;
        const dz = nearest.enemy.z - f.z;
        const len = Math.hypot(dx, dz) || 1;
        f.vx = (dx / len) * 20;
        f.vz = (dz / len) * 20;
      } else {
        f.vz = -20;
      }

      f.mesh.material.color.setHex(0xffdb86);
      f.mesh.material.emissive.setHex(0x8b6a24);
      combo += 1;
      score += 125 + combo * 28;
      updateStyle();
      pulseFlash();
      continue;
    }

    if (!f.reflected && nearPlayer) {
      scene.remove(f.mesh);
      fireballs.splice(i, 1);
      health = Math.max(0, health - 13);
      combo = 0;
      updateHud();
      if (health <= 0) gameOver();
      continue;
    }

    if (f.reflected) {
      for (let e = enemies.length - 1; e >= 0; e -= 1) {
        const enemy = enemies[e];
        if (Math.hypot(f.x - enemy.x, f.z - enemy.z) < 1.2) {
          enemy.hp -= 1;
          scene.remove(f.mesh);
          fireballs.splice(i, 1);
          score += 340 + combo * 35;
          if (enemy.hp <= 0) {
            scene.remove(enemy.mesh);
            enemies.splice(e, 1);
            score += 500;
          }
          updateStyle();
          break;
        }
      }
    }

    if (f.z > 12 || f.z < -75 || Math.abs(f.x) > 40) {
      scene.remove(f.mesh);
      fireballs.splice(i, 1);
    }
  }

  if (enemies.length === 0) resetWave();
}

let lastTime = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  updateGame(dt);

  camera.position.x += (player.x - camera.position.x) * 0.12;
  camera.lookAt(player.x * 0.35, 0.9, -25);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function onResize() {
  const rect = hud.renderRoot.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height, false);
}

hud.startBtn.addEventListener("click", () => {
  hud.centerPrompt.querySelector("h1").textContent = "DOOMPARRY_3D";
  hud.centerPrompt.querySelector("p").textContent = "Reflect hellfire in the live feed. Shoot it back into red demons.";
  hud.startBtn.textContent = "INIT FEED";
  startGame();
});

window.addEventListener("mousemove", (event) => {
  const rect = hud.renderRoot.getBoundingClientRect();
  const normalized = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  player.x = THREE.MathUtils.clamp(normalized * 8, -8, 8);
});

window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("mousedown", (event) => {
  if (event.button === 2) parryNow();
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    parryNow();
  }
});
window.addEventListener("resize", onResize);

onResize();
resetWave();
updateHud();
loop();

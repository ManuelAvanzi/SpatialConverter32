// entry.js — Voliera Demo (SDK MetaReality 1.0) — versione FUNZIONA-OGGI
// Contratto: export createScene(ctx) -> { root, update, interactables, colliders, entrances, dispose }
// Nessun import di three (usiamo ctx.THREE). Nessun ctx.ui / ctx.env (non esistono ancora).
// Il "menu" è un pannello CanvasTexture costruito dal progetto e aperto da un interagibile (§7.5).

export function createScene(ctx) {
  const THREE = ctx.THREE;
  const settings = ctx.settings || {};
  const BIRD_COUNT = Math.max(1, Math.min(80, settings.birdCount ?? 16));
  const SPEED      = settings.speed ?? 1.0;

  const root = new THREE.Group();
  root.name = 'voliera';

  // ---------- (A) Terreno camminabile (collider + spawn) ----------
  const groundGeo = new THREE.CircleGeometry(30, 48);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x355e3b, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'Terreno';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  ground.receiveShadow = true;
  root.add(ground);

  // ---------- (B) Uccellini: InstancedMesh, animazione procedurale ----------
  const birdGeo = new THREE.ConeGeometry(0.12, 0.5, 6);
  birdGeo.rotateX(Math.PI / 2);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_COUNT);
  birds.name = 'uccellini';
  birds.castShadow = true;
  birds.frustumCulled = false;   // le istanze sono sparse; la bounding-sphere base è all'origine → senza questo spariscono guardando altrove
  root.add(birds);

  const flock = [];
  for (let i = 0; i < BIRD_COUNT; i++) {
    flock.push({
      radius: 4 + Math.random() * 14,
      height: 3 + Math.random() * 6,
      phase:  Math.random() * Math.PI * 2,
      omega:  (0.3 + Math.random() * 0.5),
      bob:    0.4 + Math.random() * 0.6,
      bobOmega: 1.5 + Math.random() * 1.5,
    });
  }

  const _pos = new THREE.Vector3();
  const _next = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _avatar = new THREE.Vector3();
  let t = 0;

  function placeBird(i, time, scatter) {
    const b = flock[i];
    const a = b.phase + time * b.omega * SPEED;
    const r = b.radius + scatter;
    _pos.set(Math.cos(a) * r, b.height + Math.sin(time * b.bobOmega + b.phase) * b.bob, Math.sin(a) * r);
    const a2 = a + 0.05;
    _next.set(Math.cos(a2) * r, _pos.y, Math.sin(a2) * r);
    _q.setFromRotationMatrix(_m.lookAt(_pos, _next, _up));
    _m.compose(_pos, _q, _scale);
    birds.setMatrixAt(i, _m);
  }

  // ---------- (C) Pannello "menu" costruito dal progetto (§7.5) ----------
  function makePanel(text) {
    const canvas = document.createElement('canvas'); // OFFSCREEN
    canvas.width = 512; canvas.height = 256;
    const g = canvas.getContext('2d');
    g.fillStyle = '#10141c'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#e8edf2'; g.font = '26px sans-serif';
    text.split('\n').forEach((line, i) => g.fillText(line, 22, 52 + i * 38));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), mat);
    mesh.position.set(0, 1.7, -3.4);
    mesh.visible = false;
    mesh._tex = tex; mesh._mat = mat;
    return mesh;
  }
  const panel = makePanel(
    'Voliera Demo\n' +
    'Avvicinati al centro: gli uccellini si allargano.\n' +
    'Tocca di nuovo il totem per chiudere.'
  );
  root.add(panel);

  // ---------- (D) update ----------
  function update(dt /*, elapsed */) {
    t += dt;
    let scatter = 0;
    if (ctx.avatar) {
      ctx.avatar.getWorldPosition(_avatar);
      const distToCenter = Math.hypot(_avatar.x, _avatar.z);
      if (distToCenter < 6) scatter = (6 - distToCenter) * 0.6;
    }
    for (let i = 0; i < BIRD_COUNT; i++) placeBird(i, t, scatter);
    birds.instanceMatrix.needsUpdate = true;
  }

  // ---------- (E) Interagibile ----------
  const interactables = [
    {
      id: 'totem',
      position: [0, 1.4, -4],
      text: 'Apri/chiudi il pannello della voliera',
      radius: 3,
      visibility: 18,
      onActivate: () => { panel.visible = !panel.visible; },
    },
  ];

  // ---------- (F) Spawn + collider ----------
  const entrances = [{ position: [0, 0, 10], yaw: 0, radius: 1.5 }]; // yaw 0 = guarda verso -Z (totem/uccellini)
  const colliders = [ground];

  // ---------- (G) Pulizia ----------
  function dispose() {
    birdGeo.dispose(); birdMat.dispose();
    groundGeo.dispose(); groundMat.dispose();
    panel._tex.dispose(); panel._mat.dispose(); panel.geometry.dispose();
  }

  return { root, update, interactables, entrances, colliders, dispose };
}

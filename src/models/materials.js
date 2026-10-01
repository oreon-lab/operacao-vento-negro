// Shared materials and procedural canvas textures for all procedural models.
import * as THREE from 'three';
import { rng, fbm } from '../core/utils.js';

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Organic camo blobs (multicam-like for friendlies, darker for insurgents). */
function camo(colors, seed) {
  const r = rng(seed);
  return canvas(256, (g, s) => {
    g.fillStyle = colors[0]; g.fillRect(0, 0, s, s);
    for (let layer = 1; layer < colors.length; layer++) {
      g.fillStyle = colors[layer];
      for (let i = 0; i < 26 - layer * 4; i++) {
        const x = r() * s, y = r() * s, rad = 8 + r() * 26 / layer;
        // draw wrapped so the texture tiles
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          g.beginPath();
          for (let a = 0; a < Math.PI * 2; a += 0.5) {
            const rr = rad * (0.6 + r() * 0.7);
            g.lineTo(x + ox + Math.cos(a) * rr * 1.6, y + oy + Math.sin(a) * rr);
          }
          g.fill();
        }
      }
    }
    fabricGrain(g, s, r);
  });
}

function fabricGrain(g, s, r) {
  g.globalAlpha = 0.08;
  for (let y = 0; y < s; y += 2) { g.fillStyle = y % 4 ? '#000' : '#fff'; g.fillRect(0, y, s, 1); }
  g.globalAlpha = 0.05;
  for (let i = 0; i < 2000; i++) { g.fillStyle = r() > 0.5 ? '#000' : '#fff'; g.fillRect(r() * s, r() * s, 2, 2); }
  g.globalAlpha = 1;
}

function flatFabric(color, seed) {
  const r = rng(seed);
  return canvas(128, (g, s) => { g.fillStyle = color; g.fillRect(0, 0, s, s); fabricGrain(g, s, r); });
}

function shemagh() {
  return canvas(128, (g, s) => {
    g.fillStyle = '#e9e1d2'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#8f1f1f'; g.lineWidth = 3;
    for (let i = 0; i < s; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
    }
    g.fillStyle = '#8f1f1f';
    for (let x = 8; x < s; x += 16) for (let y = 8; y < s; y += 16) g.fillRect(x - 2, y - 2, 4, 4);
  });
}

/** Painted metal with panel lines + rivets + grime (helicopter/vehicle skin). */
function panelMetal(base, seed) {
  const r = rng(seed);
  return canvas(512, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const n = fbm(x / 60, y / 60, 4) - 0.5;
      const i = (y * s + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n * 38));
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    for (let x = 0; x <= s; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    for (let y = 0; y <= s; y += 170) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 6; x < s; x += 128) for (let y = 0; y < s; y += 10) { g.fillRect(x, y, 2, 2); g.fillRect(x + 116, y, 2, 2); }
    // streaks of oil/dust
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '30,25,20' : '160,140,110'},${0.05 + r() * 0.08})`;
      g.fillRect(r() * s, r() * s, 2 + r() * 6, 30 + r() * 120);
    }
  });
}

function woodGrain(base, seed) {
  const r = rng(seed);
  return canvas(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(40,20,5,${0.1 + r() * 0.25})`; g.lineWidth = 1 + r() * 2;
      const y = r() * s; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x / 30 + i) * 3);
      g.stroke();
    }
  });
}

function planks(seed) {
  const r = rng(seed);
  return canvas(256, (g, s) => {
    for (let i = 0; i < 4; i++) {
      const v = 120 + r() * 40;
      g.fillStyle = `rgb(${v},${v * 0.78},${v * 0.5})`; g.fillRect(0, i * 64, s, 64);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, i * 64, s, 3);
      for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(60,35,10,${r() * 0.25})`; g.fillRect(0, i * 64 + r() * 60, s, 1); }
    }
    g.fillStyle = 'rgba(0,0,0,0.6)';
    for (const x of [10, s - 14]) for (let i = 0; i < 4; i++) g.fillRect(x, i * 64 + 28, 4, 4);
  });
}

function stripes(a, b) {
  return canvas(128, (g, s) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, s); }
  });
}

function noiseTex(base, amount, seed, scale = 40) {
  const r = rng(seed);
  return canvas(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const n = (fbm(x / scale, y / scale, 5) - 0.5) * amount + (r() - 0.5) * amount * 0.3;
      const i = (y * s + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n));
    }
    g.putImageData(img, 0, 0);
  });
}

function mfdScreen() {
  return canvas(128, (g, s) => {
    g.fillStyle = '#021a08'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#3cff7a'; g.lineWidth = 2;
    g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(20, 64); g.lineTo(108, 64); g.moveTo(64, 20); g.lineTo(64, 108); g.stroke();
    for (let i = 0; i < 6; i++) g.fillRect(8, 10 + i * 18, 14, 3);
    g.fillRect(100, 20, 18, 80);
  });
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export const TEX = {};
export const M = {};

/** Build every material once. Optional image textures (from Codex) are swapped in when they load. */
export function initMaterials() {
  TEX.camoFriendly = camo(['#8a7d5b', '#6d6a45', '#a79671', '#4f4a33', '#c2b08a'], 11);
  TEX.camoEnemy = camo(['#4a4a3f', '#34352c', '#5f5a48', '#26261f'], 23);
  TEX.pilotSuit = flatFabric('#5b6147', 5);
  TEX.enemyShirt = flatFabric('#6b5a45', 7);
  TEX.enemyShirt2 = flatFabric('#3d4350', 8);
  TEX.shemagh = shemagh();
  TEX.heli = panelMetal('#56604a', 3);
  TEX.truck = panelMetal('#b9ad8f', 9);
  TEX.wood = woodGrain('#7a4a26', 4);
  TEX.planks = planks(12);
  TEX.awning1 = stripes('#b3462e', '#e0d2b0');
  TEX.awning2 = stripes('#2f5f8a', '#d9d0bc');
  TEX.plaster = noiseTex('#c7ab83', 38, 2);
  TEX.sand = noiseTex('#c9a878', 30, 6, 25);
  TEX.concrete = noiseTex('#9a948a', 30, 13);
  TEX.rust = noiseTex('#6b3f24', 70, 14, 12);
  TEX.mfd = mfdScreen();

  const a = {
    // weapons
    gunMetal: std({ color: 0x1d1f21, metalness: 0.7, roughness: 0.42 }),
    gunDark: std({ color: 0x121314, metalness: 0.4, roughness: 0.6 }),
    polymer: std({ color: 0x1a1a1a, roughness: 0.85 }),
    tanPolymer: std({ color: 0x9c8661, roughness: 0.8 }),
    akMetal: std({ color: 0x2a2a2a, metalness: 0.65, roughness: 0.5 }),
    akWood: std({ map: TEX.wood, roughness: 0.55 }),
    brass: std({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 }),
    lens: std({ color: 0x112233, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.35 }),
    reticle: new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    // soldiers
    camoFriendly: std({ map: TEX.camoFriendly, roughness: 0.95 }),
    camoEnemy: std({ map: TEX.camoEnemy, roughness: 0.95 }),
    pilotSuit: std({ map: TEX.pilotSuit, roughness: 0.9 }),
    enemyShirt: std({ map: TEX.enemyShirt, roughness: 0.95 }),
    enemyShirt2: std({ map: TEX.enemyShirt2, roughness: 0.95 }),
    vest: std({ color: 0x7a6a4c, roughness: 0.9 }),
    vestDark: std({ color: 0x3b3a30, roughness: 0.9 }),
    webbing: std({ color: 0x5e5238, roughness: 0.95 }),
    helmet: std({ color: 0x6f6448, roughness: 0.75 }),
    pilotHelmet: std({ color: 0x4a4f3c, roughness: 0.5, metalness: 0.2 }),
    visor: std({ color: 0x151515, metalness: 0.8, roughness: 0.1 }),
    glove: std({ color: 0x2a2620, roughness: 0.8 }),
    boot: std({ color: 0x5a4a35, roughness: 0.85 }),
    bootDark: std({ color: 0x1c1a17, roughness: 0.8 }),
    sole: std({ color: 0x111111, roughness: 0.95 }),
    skin1: std({ color: 0xc58e6a, roughness: 0.7 }),
    skin2: std({ color: 0x8d5a3b, roughness: 0.7 }),
    skin3: std({ color: 0xe0b08e, roughness: 0.7 }),
    skin4: std({ color: 0x6b4128, roughness: 0.7 }),
    hair: std({ color: 0x1b1510, roughness: 1 }),
    eyeWhite: std({ color: 0xe8e4dc, roughness: 0.3 }),
    eyeIris: std({ color: 0x1a120b, roughness: 0.2 }),
    lips: std({ color: 0x7a4a3a, roughness: 0.7 }),
    shemagh: std({ map: TEX.shemagh, roughness: 1 }),
    balaclava: std({ color: 0x181818, roughness: 1 }),
    cap: std({ color: 0x5c5840, roughness: 0.95 }),
    nvg: std({ color: 0x1f2320, metalness: 0.4, roughness: 0.5 }),
    // vehicles
    heli: std({ map: TEX.heli, roughness: 0.65, metalness: 0.25 }),
    heliInterior: std({ color: 0x4b5043, roughness: 0.85, side: THREE.DoubleSide }),
    heliDark: std({ color: 0x1f221c, roughness: 0.7, metalness: 0.3 }),
    heliGlass: std({ color: 0x2c3c3a, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    rotor: std({ color: 0x1e1f1c, roughness: 0.6, metalness: 0.3 }),
    rotorBlur: new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    rubber: std({ color: 0x151515, roughness: 0.95 }),
    canvasSeat: std({ color: 0x6e3b2c, roughness: 1 }),
    steel: std({ color: 0x8a8d8f, metalness: 0.8, roughness: 0.35 }),
    mfd: new THREE.MeshBasicMaterial({ map: TEX.mfd }),
    redLamp: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    greenLamp: new THREE.MeshBasicMaterial({ color: 0x30ff60 }),
    truckPaint: std({ map: TEX.truck, roughness: 0.55, metalness: 0.3 }),
    chrome: std({ color: 0xcccccc, metalness: 1, roughness: 0.15 }),
    burnt: std({ map: TEX.rust, roughness: 0.95 }),
    carGlass: std({ color: 0x0c1012, metalness: 0.6, roughness: 0.1 }),
    headlight: std({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.4 }),
    // world
    plaster: std({ map: TEX.plaster, roughness: 0.95 }),
    plaster2: std({ map: TEX.plaster, color: 0xe8d7bd, roughness: 0.95 }),
    plaster3: std({ map: TEX.plaster, color: 0xc9b39b, roughness: 0.95 }),
    plasterTrim: std({ map: TEX.plaster, color: 0x9e8a6c, roughness: 0.95 }),
    concrete: std({ map: TEX.concrete, roughness: 0.9 }),
    sand: std({ map: TEX.sand, roughness: 1 }),
    sandbag: std({ color: 0xb09a72, roughness: 1 }),
    darkOpening: std({ color: 0x0b0906, roughness: 1 }),
    doorWood: std({ map: TEX.planks, roughness: 0.9 }),
    crate: std({ map: TEX.planks, roughness: 0.9 }),
    metalDoor: std({ color: 0x3f6b6e, roughness: 0.6, metalness: 0.4 }),
    rust: std({ map: TEX.rust, roughness: 0.9, metalness: 0.3 }),
    barrelBlue: std({ color: 0x2b4f7a, roughness: 0.6, metalness: 0.3 }),
    barrelRed: std({ color: 0x8a2a1d, roughness: 0.6, metalness: 0.3 }),
    awning1: std({ map: TEX.awning1, roughness: 1, side: THREE.DoubleSide }),
    awning2: std({ map: TEX.awning2, roughness: 1, side: THREE.DoubleSide }),
    palmTrunk: std({ color: 0x6a5238, roughness: 1 }),
    palmLeaf: std({ color: 0x4f6b2a, roughness: 0.9, side: THREE.DoubleSide }),
    pole: std({ color: 0x4d3a28, roughness: 1 }),
    wire: new THREE.LineBasicMaterial({ color: 0x151515 }),
    fruitA: std({ color: 0xd9771c, roughness: 0.6 }),
    fruitB: std({ color: 0x7ea42a, roughness: 0.6 }),
    fruitC: std({ color: 0xb0241e, roughness: 0.6 }),
    rubble: std({ map: TEX.plaster, color: 0xb8a282, roughness: 1 }),
    mattress: std({ color: 0x6d7a8a, roughness: 1 }),
    paper: std({ color: 0xe8e2d0, roughness: 1 }),
    screen: std({ color: 0x223344, emissive: 0x3a7abf, emissiveIntensity: 0.9 }),
    tire: std({ color: 0x191919, roughness: 0.95 }),
    water: std({ color: 0x3d5a55, roughness: 0.1, metalness: 0.4 }),
  };
  Object.assign(M, a);
  // world-projected UV scale (texture repeat in world meters)
  M.plaster.userData.worldUV = 0.35; M.plaster2.userData.worldUV = 0.35; M.plaster3.userData.worldUV = 0.35;
  M.plasterTrim.userData.worldUV = 0.35; M.concrete.userData.worldUV = 0.4; M.rubble.userData.worldUV = 0.6;
  M.rotorBlur.userData.noShadow = true;
  M.heliGlass.userData.noShadow = true;
  return M;
}

/** Replace canvas fallbacks with Codex-generated photo textures when available. */
export function loadImageTextures() {
  const loader = new THREE.TextureLoader();
  const swap = (url, mats, cb) => loader.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    cb?.(t);
    for (const m of mats) { m.map = t; m.needsUpdate = true; }
  }, undefined, () => { /* keep procedural fallback */ });
  swap('assets/images/wall_plaster.jpg', [M.plaster, M.plaster2, M.plaster3, M.plasterTrim, M.rubble]);
  swap('assets/images/ground_sand.jpg', [M.sand], (t) => t.repeat.set(1, 1));
}

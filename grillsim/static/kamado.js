// Querschnitt eines Kamado als SVG, der den Simulationszustand live abbildet.

const NS = "http://www.w3.org/2000/svg";
const HINGE = [312, 200];
const MAX_FUEL_G = 4000;

const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
};

// deterministischer Zufall, damit der Kohlehaufen bei jedem Laden gleich aussieht
function random(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

// Farbe des Grillguts nach Kerntemperatur: roh → rosa → gebräunt → Kruste
const DONENESS = [
  [5, "c4515a"],
  [50, "d98a7a"],
  [75, "a0603a"],
  [95, "5e3220"],
];

function meatColor(core) {
  for (let i = 1; i < DONENESS.length; i++) {
    const [t0, c0] = DONENESS[i - 1];
    const [t1, c1] = DONENESS[i];
    if (core <= t1) return mix(c0, c1, Math.max(0, (core - t0) / (t1 - t0)));
  }
  return `#${DONENESS.at(-1)[1]}`;
}

const MEAT_SHAPES = {
  Rumpsteak: (g) => {
    el("path", { d: "M150 196 C146 184 160 176 182 177 C204 178 214 184 210 196 Z" }, g);
  },
  "Ganzes Hähnchen": (g) => {
    el("path", { d: "M138 196 C134 170 158 154 184 156 C210 158 226 176 220 196 Z" }, g);
    el("path", { d: "M214 186 C228 178 236 182 232 190 C230 194 222 194 216 192 Z" }, g);
    el("path", { d: "M142 186 C128 178 120 182 124 190 C126 194 134 194 140 192 Z" }, g);
  },
  Spareribs: (g) => {
    el("path", { d: "M112 196 C112 186 120 182 132 182 L232 180 C244 180 250 186 250 196 Z" }, g);
  },
  "Pulled Pork": (g) => {
    el("path", { d: "M136 196 C130 172 150 158 180 158 C210 158 230 172 224 196 Z" }, g);
  },
};

export function buildKamado(svg) {
  const defs = el("defs", {}, svg);
  const ember = el("radialGradient", { id: "k-ember", cx: "50%", cy: "40%", r: "60%" }, defs);
  el("stop", { offset: "0%", "stop-color": "#ffe08a" }, ember);
  el("stop", { offset: "45%", "stop-color": "#ff9f43" }, ember);
  el("stop", { offset: "100%", "stop-color": "#e5461b" }, ember);
  const heat = el("radialGradient", { id: "k-heat", cx: "50%", cy: "85%", r: "75%" }, defs);
  el("stop", { offset: "0%", "stop-color": "#ff9f43", "stop-opacity": "0.9" }, heat);
  el("stop", { offset: "60%", "stop-color": "#e5461b", "stop-opacity": "0.35" }, heat);
  el("stop", { offset: "100%", "stop-color": "#e5461b", "stop-opacity": "0" }, heat);

  const base = {
    outer: "M50 200 C50 300 110 360 180 360 C250 360 310 300 310 200 Z",
    inner: "M64 200 C64 290 118 346 180 346 C242 346 296 290 296 200 Z",
  };
  const dome = {
    outer: "M50 200 C50 110 110 50 180 50 C250 50 310 110 310 200 Z",
    inner: "M64 200 C64 120 118 64 180 64 C242 64 296 120 296 200 Z",
  };

  // Gestell
  const stand = el("g", { class: "k-stand" }, svg);
  el("path", { d: "M96 330 L80 396 M264 330 L280 396 M120 350 L112 396 M240 350 L248 396" }, stand);
  el("path", { d: "M74 396 H286" }, stand);

  // Ventilator an der Zuluft
  const fan = el("g", { class: "k-fan" }, svg);
  el("rect", { x: 2, y: 296, width: 44, height: 40, rx: 8, class: "k-fan-box" }, fan);
  el("rect", { x: 44, y: 308, width: 10, height: 16, class: "k-fan-box" }, fan);
  const blades = el("g", { class: "k-blades" }, fan);
  for (let i = 0; i < 4; i++) {
    el("path", { d: "M24 316 C28 306 34 304 36 308 Z", transform: `rotate(${i * 90} 24 316)` }, blades);
  }
  el("circle", { cx: 24, cy: 316, r: 3.5, class: "k-hub" }, fan);

  // Unterteil
  el("path", { d: base.outer, class: "k-shell" }, svg);
  el("path", { d: base.inner, class: "k-interior" }, svg);
  const baseHeat = el("path", { d: base.inner, fill: "url(#k-heat)", class: "k-heat" }, svg);

  // Zuluft-Schieber in der Wand
  el("rect", { x: 46, y: 302, width: 22, height: 28, class: "k-vent-hole" }, svg);
  const lowerDoor = el("rect", { x: 46, y: 302, width: 22, height: 28, class: "k-metal" }, svg);
  const airIn = el("g", { class: "k-air" }, svg);
  for (const y of [308, 316, 324]) {
    el("path", { d: `M50 ${y} H110` }, airIn);
  }

  // Kohlerost und Kohlehaufen
  el("path", { d: "M104 322 H256", class: "k-grate" }, svg);
  const coals = el("g", { class: "k-coals" }, svg);
  const rnd = random(42);
  const lumps = [];
  for (let row = 0; row < 7; row++) {
    const half = 72 - row * 8;
    const y = 314 - row * 9;
    for (let x = -half; x <= half; x += 13) {
      const cx = 180 + x + (rnd() - 0.5) * 5;
      const cy = y + (rnd() - 0.5) * 3;
      // unregelmäßiges Vieleck statt Ellipse – echte Holzkohle ist kantig
      const corners = 5 + Math.floor(rnd() * 3);
      const offset = rnd() * Math.PI;
      const pts = [];
      for (let c = 0; c < corners; c++) {
        const a = offset + (c / corners) * Math.PI * 2;
        const r = 4.5 + rnd() * 3.5;
        pts.push(`${(cx + Math.cos(a) * r * 1.25).toFixed(1)},${(cy + Math.sin(a) * r * 0.85).toFixed(1)}`);
      }
      const g = el("g", {}, coals);
      el("polygon", { points: pts.join(" "), class: "k-lump" }, g);
      const glow = el("polygon", { points: pts.join(" "), fill: "url(#k-ember)", class: "k-lump-glow" }, g);
      glow.style.animationDelay = `${(-rnd() * 3).toFixed(2)}s`;
      // Glut beginnt in der Mitte des Haufens; nicht jedes Stück glüht gleich stark
      lumps.push({
        g,
        glow,
        ignition: Math.abs(x) / 72 * 0.6 + row / 7 * 0.4 + rnd() * 0.15,
        brightness: 0.3 + rnd() * 0.7,
      });
    }
  }
  // von oben nach unten abbrennen: die obersten Stücke zuerst ausblenden
  lumps.reverse();

  // Deckel (dreht um das Scharnier)
  const lid = el("g", { class: "k-lid" }, svg);
  el("path", { d: dome.outer, class: "k-shell" }, lid);
  el("path", { d: dome.inner, class: "k-interior" }, lid);
  const domeHeat = el("path", { d: dome.inner, fill: "url(#k-heat)", class: "k-heat" }, lid);
  el("rect", { x: 46, y: 194, width: 268, height: 7, rx: 2, class: "k-band" }, lid);

  // Domthermometer am Deckel
  el("path", { d: "M44 126 L70 130", class: "k-stem" }, lid);
  el("circle", { cx: 36, cy: 124, r: 14, class: "k-dial" }, lid);
  const dialNeedle = el("path", { d: "M36 124 L36 114", class: "k-dial-needle" }, lid);

  // Abluft oben: Kappe hebt sich
  el("rect", { x: 162, y: 40, width: 36, height: 14, rx: 2, class: "k-metal" }, lid);
  const cap = el("g", {}, lid);
  el("rect", { x: 154, y: 32, width: 52, height: 8, rx: 3, class: "k-metal" }, cap);
  el("rect", { x: 174, y: 26, width: 12, height: 7, rx: 2, class: "k-metal" }, cap);
  const smokeTop = el("g", { class: "k-smoke" }, lid);
  for (let i = 0; i < 6; i++) {
    const c = el("circle", { cx: 172 + (i % 3) * 8, cy: 34, r: 6 + (i % 2) * 3 }, smokeTop);
    c.style.animationDelay = `${(-i * 0.55).toFixed(2)}s`;
  }

  // Grillrost und Grillgut liegen vor dem Deckelinneren, sonst wären sie verdeckt
  el("path", { d: "M70 190 H290", class: "k-grill-grate" }, svg);
  const meat = el("g", { class: "k-meat", transform: "translate(0 -6)" }, svg);

  // Rauch, wenn der Deckel offen ist
  const smokeLid = el("g", { class: "k-smoke" }, svg);
  for (let i = 0; i < 8; i++) {
    const c = el("circle", { cx: 70 + i * 18, cy: 180, r: 7 + (i % 3) * 3 }, smokeLid);
    c.style.animationDelay = `${(-i * 0.4).toFixed(2)}s`;
  }

  // Scharnier
  el("circle", { cx: HINGE[0], cy: HINGE[1], r: 7, class: "k-metal" }, svg);

  return { lumps, lowerDoor, airIn, blades, baseHeat, domeHeat, lid, cap, smokeTop, smokeLid, meat, dialNeedle, meatName: null };
}

export function renderKamado(k, grill, gaugeAngle) {
  const intensity = grill.lit ? Math.min(1, grill.burn_rate / 0.25) : 0;

  // Kohle: Menge und Glut
  const visible = Math.round((Math.min(grill.fuel_g, MAX_FUEL_G) / MAX_FUEL_G) * k.lumps.length);
  k.lumps.forEach((lump, i) => {
    const shown = i >= k.lumps.length - visible;
    lump.g.style.display = shown ? "" : "none";
    const burning = grill.lit && lump.ignition <= grill.ember;
    lump.glow.style.opacity = burning ? ((0.2 + 0.8 * intensity) * lump.brightness).toFixed(2) : "0";
  });

  // Garraum färbt sich mit der Temperatur
  const heat = Math.min(1, Math.max(0, (grill.temperature - grill.ambient) / 400));
  k.baseHeat.style.opacity = Math.max(heat, intensity * 0.6).toFixed(2);
  k.domeHeat.style.opacity = (heat * 0.8).toFixed(2);

  // Zuluft-Schieber: offen = Tür nach unten weggeschoben
  k.lowerDoor.setAttribute("height", (28 * (1 - grill.lower_vent)).toFixed(1));
  k.lowerDoor.setAttribute("y", (302 + 28 * grill.lower_vent).toFixed(1));
  k.airIn.style.opacity = Math.min(1, grill.airflow * 3).toFixed(2);
  k.airIn.style.animationDuration = `${Math.max(0.4, 2 - grill.airflow * 2).toFixed(2)}s`;

  // Ventilator
  k.blades.style.animationPlayState = grill.fan > 0.01 ? "running" : "paused";
  k.blades.style.animationDuration = `${(0.25 / Math.max(grill.fan, 0.05)).toFixed(2)}s`;

  // Abluftkappe
  k.cap.setAttribute("transform", `translate(0 ${(-10 * grill.upper_vent).toFixed(1)})`);

  // Deckel
  k.lid.style.transform = grill.lid_open ? "rotate(38deg)" : "rotate(0deg)";

  // Rauch
  const smoke = grill.lit ? Math.min(1, 0.2 + grill.airflow * 2) * (0.4 + 0.6 * intensity) : 0;
  k.smokeTop.style.opacity = grill.lid_open ? "0" : smoke.toFixed(2);
  k.smokeLid.style.opacity = grill.lid_open && grill.lit ? Math.max(0.4, smoke).toFixed(2) : "0";

  // kleines Domthermometer zeigt dasselbe wie das große
  k.dialNeedle.setAttribute("transform", `rotate(${gaugeAngle.toFixed(1)} 36 124)`);

  // Grillgut
  const name = grill.meat?.name ?? null;
  if (name !== k.meatName) {
    k.meat.replaceChildren();
    MEAT_SHAPES[name]?.(k.meat);
    k.meatName = name;
  }
  if (grill.meat) k.meat.style.fill = meatColor(grill.meat.core);
}

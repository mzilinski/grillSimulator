const $ = (id) => document.getElementById(id);

const GAUGE = { min: 0, max: 500, sweep: 270, cx: 200, cy: 200, r: 168 };
const ZONES = [
  [300, "Pizza und scharfes Angrillen"],
  [200, "Direktes Grillen"],
  [140, "Indirektes Garen"],
  [90, "Low & Slow"],
];

let state = null;
let samples = [];
let socket = null;
let lastTemp = null;
let lastTime = null;
let trend = 0;
const editing = new Map(); // input-id -> Zeitpunkt der letzten Nutzereingabe

// ---------- Thermometer ----------

function angleFor(temp) {
  const t = Math.min(GAUGE.max, Math.max(GAUGE.min, temp));
  return -GAUGE.sweep / 2 + ((t - GAUGE.min) / (GAUGE.max - GAUGE.min)) * GAUGE.sweep;
}

function point(angle, r) {
  const rad = (angle * Math.PI) / 180;
  return [GAUGE.cx + r * Math.sin(rad), GAUGE.cy - r * Math.cos(rad)];
}

function arcPath(from, to, r) {
  const [x1, y1] = point(from, r);
  const [x2, y2] = point(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function buildGauge() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = $("gauge");
  const el = (name, attrs, parent) => {
    const node = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.appendChild(node);
    return node;
  };

  const defs = el("defs", {}, svg);
  const grad = el("linearGradient", { id: "heat-gradient", x1: "0", y1: "1", x2: "1", y2: "0" }, defs);
  el("stop", { offset: "0%", "stop-color": "#ffcf7a" }, grad);
  el("stop", { offset: "55%", "stop-color": "#ff9f43" }, grad);
  el("stop", { offset: "100%", "stop-color": "#e5461b" }, grad);

  const face = el("circle", { cx: 200, cy: 200, r: 192, class: "gauge-face" }, svg);
  svg.insertBefore(face, svg.firstChild.nextSibling);
  const track = el("path", { d: arcPath(-GAUGE.sweep / 2, GAUGE.sweep / 2, GAUGE.r - 26), class: "gauge-track" }, svg);
  svg.insertBefore(track, $("gauge-heat"));

  const ticks = $("gauge-ticks");
  for (let t = GAUGE.min; t <= GAUGE.max; t += 10) {
    const major = t % 50 === 0;
    const a = angleFor(t);
    const [x1, y1] = point(a, GAUGE.r);
    const [x2, y2] = point(a, GAUGE.r - (major ? 14 : 7));
    el("line", { x1, y1, x2, y2, class: major ? "tick major" : "tick" }, ticks);
    if (t % 100 === 0) {
      const [lx, ly] = point(a, GAUGE.r - 52);
      el("text", { x: lx, y: ly, class: "tick-label" }, ticks).textContent = t;
    }
  }
}

function renderGauge(temp, setpoint) {
  const a = angleFor(temp);
  $("needle").style.transform = `rotate(${a}deg)`;
  const start = -GAUGE.sweep / 2;
  $("gauge-heat").setAttribute("d", a - start < 0.5 ? "" : arcPath(start, a, GAUGE.r - 26));
  const marker = $("setpoint-marker");
  marker.hidden = setpoint == null;
  if (setpoint != null) marker.style.transform = `rotate(${angleFor(setpoint)}deg)`;
}

// ---------- Verlauf ----------

function drawChart() {
  const canvas = $("chart");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  $("chart-empty").hidden = samples.length > 1;
  if (samples.length < 2) return;

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const pad = { l: 40, r: 8, t: 8, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const t0 = samples[0][0];
  const t1 = Math.max(samples.at(-1)[0], t0 + 1800);
  const peak = Math.max(...samples.map((s) => s[1]), state?.auto_fan ? state.setpoint : 0);
  const yMax = Math.max(200, Math.ceil((peak + 20) / 100) * 100);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * w;
  const y = (v) => pad.t + h - (v / yMax) * h;

  ctx.font = `12px ${css.getPropertyValue("--ui")}`;
  ctx.fillStyle = color("--ash");
  ctx.strokeStyle = color("--kiln-line");
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let v = 0; v <= yMax; v += 100) {
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v) + 0.5);
    ctx.lineTo(width - pad.r, y(v) + 0.5);
    ctx.stroke();
    ctx.fillText(`${v}°`, pad.l - 8, y(v));
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const span = t1 - t0;
  const step = span > 6 * 3600 ? 3600 : span > 2 * 3600 ? 1800 : 600;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    ctx.fillText(formatClock(t), x(t), height - pad.b + 6);
  }

  // Ventilatorleistung als Fläche am Boden
  ctx.fillStyle = color("--kiln-line");
  ctx.beginPath();
  ctx.moveTo(x(samples[0][0]), y(0));
  for (const s of samples) ctx.lineTo(x(s[0]), y(0) - s[3] * h * 0.25);
  ctx.lineTo(x(samples.at(-1)[0]), y(0));
  ctx.fill();

  if (state?.auto_fan) {
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = color("--smoke");
    ctx.beginPath();
    ctx.moveTo(pad.l, y(state.setpoint));
    ctx.lineTo(width - pad.r, y(state.setpoint));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const line = (index, stroke) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    for (const s of samples) {
      if (s[index] == null) { started = false; continue; }
      started ? ctx.lineTo(x(s[0]), y(s[index])) : ctx.moveTo(x(s[0]), y(s[index]));
      started = true;
    }
    ctx.stroke();
  };
  line(2, color("--smoke"));
  line(1, color("--ember-hot"));
}

// ---------- Anzeige ----------

function formatClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

const kg = (grams) => (grams / 1000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function describeFuelLeft(hours) {
  if (hours == null) return " ";
  if (hours < 1) return `reicht noch ca. ${Math.max(1, Math.round(hours * 60))} Minuten`;
  const rounded = Math.round(hours);
  return `reicht noch ca. ${rounded} ${rounded === 1 ? "Stunde" : "Stunden"}`;
}

function describeFire(g) {
  if (!g.lit) {
    if (g.fuel_g <= 0) return "Keine Kohle mehr – nachlegen und neu anzünden.";
    return g.temperature > g.ambient + 2 ? "Glut erloschen – der Grill kühlt ab." : "Kalt – Kohle anzünden, um loszulegen.";
  }
  if (g.lid_open) return "Deckel offen – die Hitze entweicht.";
  if (g.ember < 0.98) return "Die Glut breitet sich aus …";
  const zone = ZONES.find(([min]) => g.temperature >= min)?.[1];
  const direction = trend > 0.03 ? "steigt" : trend < -0.03 ? "fällt" : "ist stabil";
  return zone ? `${zone}, Temperatur ${direction}.` : `Aufheizen, Temperatur ${direction}.`;
}

function setSlider(id, fraction, suffix = " %", scale = 100) {
  const input = $(id);
  if (Date.now() - (editing.get(id) ?? 0) < 1500) return;
  const value = Math.round(fraction * scale);
  input.value = value;
  $(`${id}-out`).textContent = `${value}${suffix}`;
}

function render() {
  const g = state.grill;

  if (lastTime != null && g.sim_time > lastTime) {
    const rate = (g.temperature - lastTemp) / (g.sim_time - lastTime);
    trend = trend * 0.8 + rate * 0.2;
  }
  lastTemp = g.temperature;
  lastTime = g.sim_time;

  $("sim-time").textContent = formatClock(g.sim_time);
  $("temp").textContent = Math.round(g.temperature);
  $("fire-state").textContent = describeFire(g);
  renderGauge(g.temperature, state.auto_fan ? state.setpoint : null);
  document.documentElement.style.setProperty("--heat", Math.min(1, g.burn_rate / 0.25).toFixed(3));

  $("fuel").textContent = kg(g.fuel_g);
  $("fuel-left").textContent = describeFuelLeft(g.fuel_hours_left);
  $("ember").textContent = Math.round(g.ember * 100);
  $("burn").textContent = g.burn_rate > 0.001 ? `${Math.round(g.burn_rate * 3600)} g pro Stunde` : " ";

  const probe = $("probe");
  probe.dataset.empty = String(!g.meat);
  if (g.meat) {
    $("probe-name").textContent = g.meat.name;
    $("core").textContent = Math.round(g.meat.core);
    $("core-unit").textContent = " °C";
    $("core-target").textContent = g.meat.core >= g.meat.target
      ? `Fertig – Ziel ${g.meat.target} °C erreicht`
      : `Ziel ${g.meat.target} °C`;
  } else {
    $("probe-name").textContent = "Kerntemperatur";
    $("core").textContent = "–";
    $("core-unit").textContent = "";
    $("core-target").textContent = "Kein Grillgut aufgelegt";
  }

  $("ignite-btn").disabled = g.lit || g.fuel_g <= 0;
  $("fuel-btn").disabled = g.fuel_g >= 4000;
  $("lid-btn").setAttribute("aria-pressed", String(g.lid_open));
  $("lid-btn").textContent = g.lid_open ? "Deckel schließen" : "Deckel öffnen";

  setSlider("lower-vent", g.lower_vent);
  setSlider("upper-vent", g.upper_vent);
  setSlider("fan", g.fan);
  setSlider("setpoint", state.setpoint, " °C", 1);
  $("fan").disabled = state.auto_fan;
  $("auto-fan").checked = state.auto_fan;
  $("setpoint-row").hidden = !state.auto_fan;

  for (const btn of $("speeds").children) {
    btn.setAttribute("aria-checked", String(Number(btn.dataset.speed) === state.speed));
  }
  $("pause-btn").textContent = state.paused ? "Fortsetzen" : "Pausieren";

  const currentMeat = g.meat ? Object.entries(state.meat_presets).find(([, m]) => m.name === g.meat.name)?.[0] : "";
  for (const btn of $("meat-choice").children) {
    btn.setAttribute("aria-pressed", String(btn.dataset.key === currentMeat));
  }
}

function log(message) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = formatClock(state?.grill.sim_time ?? 0);
  item.append(time, document.createTextNode(message));
  const list = $("log");
  list.prepend(item);
  while (list.children.length > 30) list.lastChild.remove();
}

// ---------- Verbindung ----------

function send(action, value) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action, value }));
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/ws`);
  const status = $("connection");

  socket.addEventListener("open", () => {
    status.dataset.state = "open";
  });
  socket.addEventListener("close", () => {
    status.dataset.state = "closed";
    status.textContent = "Verbindung zum Server getrennt – versuche es erneut …";
    setTimeout(connect, 2000);
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "history") {
      samples = msg.samples;
      lastTime = null;
      drawChart();
    } else if (msg.type === "state") {
      const first = state == null;
      state = msg;
      if (first) buildStaticControls();
      if (msg.sample) {
        samples.push(msg.sample);
        if (samples.length > 1440) samples.shift();
        drawChart();
      }
      msg.events.forEach(log);
      render();
    } else if (msg.type === "error") {
      log(`Fehler: ${msg.message}`);
    }
  });
}

function buildStaticControls() {
  const speeds = $("speeds");
  for (const speed of state.speeds) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "radio";
    btn.dataset.speed = speed;
    btn.textContent = `${speed}×`;
    btn.title = speed === 1 ? "Echtzeit" : `${speed}-fach beschleunigt`;
    btn.addEventListener("click", () => send("speed", speed));
    speeds.append(btn);
  }

  const meats = $("meat-choice");
  const options = [["", "Nichts"], ...Object.entries(state.meat_presets).map(([k, m]) => [k, m.name])];
  for (const [key, name] of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.key = key;
    btn.textContent = name;
    btn.addEventListener("click", () => send("meat", key || null));
    meats.append(btn);
  }
}

function bindSlider(id, action, toValue, suffix = " %") {
  const input = $(id);
  input.addEventListener("input", () => {
    editing.set(id, Date.now());
    $(`${id}-out`).textContent = `${input.value}${suffix}`;
    send(action, toValue(Number(input.value)));
  });
}

buildGauge();
bindSlider("lower-vent", "lower_vent", (v) => v / 100);
bindSlider("upper-vent", "upper_vent", (v) => v / 100);
bindSlider("fan", "fan", (v) => v / 100);
bindSlider("setpoint", "setpoint", (v) => v, " °C");
$("auto-fan").addEventListener("change", (e) => send("auto_fan", e.target.checked));
$("ignite-btn").addEventListener("click", () => send("ignite"));
$("fuel-btn").addEventListener("click", () => send("add_fuel", 500));
$("lid-btn").addEventListener("click", () => send("lid", !state.grill.lid_open));
$("pause-btn").addEventListener("click", () => send("pause", !state.paused));
$("reset-btn").addEventListener("click", () => {
  $("log").replaceChildren();
  send("reset");
});
new ResizeObserver(drawChart).observe($("chart"));
connect();

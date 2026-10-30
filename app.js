/* Daily Brief v1.1. Renders the Today screen from data/*.json.
   Content files are updated by Claude via git commits; priorities and lesson ticks stay on this device. */

const APP_VERSION = "1.1.0";
const DEFAULT_TZ = "Asia/Qatar";
const NEUTRAL = "#3A4256";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") n.style.cssText = v;
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const haptic = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

/* ---------- storage (never trusted to exist) ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable */ } },
  keys(prefix) { try { return Object.keys(localStorage).filter((k) => k.startsWith(prefix)); } catch { return []; } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ---------- dates in the user's time zone ---------- */
let TZ = DEFAULT_TZ;
const dateKey = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const keyToUTC = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const shiftKey = (key, days) => { const t = keyToUTC(key); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
const fmt = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);

const CN_DAYS = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
  "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
  "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
function lunarDate(d) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { timeZone: TZ, month: "long", day: "numeric" }).formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return month && day ? "农历" + month + (CN_DAYS[day - 1] ?? "") : "";
  } catch { return ""; }
}
// Day stem-branch. 2000-01-07 was a 甲子 day.
function ganzhi(key) {
  const i = (((Math.round((keyToUTC(key) - Date.UTC(2000, 0, 7, 12)) / 864e5)) % 60) + 60) % 60;
  return "甲乙丙丁戊己庚辛壬癸"[i % 10] + "子丑寅卯辰巳午未申酉戌亥"[i % 12] + "日";
}

/* ---------- colour ---------- */
function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const mix = (hex, toward, t) => {
  const a = rgb(hex), b = rgb(toward);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

function applySky(hex) {
  const base = rgb(hex) ? hex : NEUTRAL;
  const L = luminance(base);
  const light = (L + 0.05) / 0.05 > 1.05 / (L + 0.05); // black text reads better than white
  const root = document.documentElement;
  root.dataset.tone = light ? "light" : "dark";
  root.style.setProperty("--swatch", base);
  root.style.setProperty("--swatch-deep", mix(base, "#000000", light ? 0.22 : 0.55));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", base);
}

const chipEl = (name, hex, cls = "chip") => el("span", { class: cls, title: name, "aria-label": name, role: "img", style: `background:${hex}` });

/* ---------- data ---------- */
const state = { data: {}, failed: [], loadedAt: null, offline: false, today: null };

async function getJSON(name) {
  const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}
async function loadAll() {
  const names = ["config", "colors", "market", "curriculum"];
  const results = await Promise.allSettled(names.map(getJSON));
  state.failed = [];
  results.forEach((r, i) => { if (r.status === "fulfilled") state.data[names[i]] = r.value; else state.failed.push(names[i]); });
  state.offline = !navigator.onLine;
  state.loadedAt = new Date();
  if (state.data.config?.tz) TZ = state.data.config.tz;
}

// Today's star → three palettes in order of preference.
function colourFor(key) {
  const c = state.data.colors;
  const star = c?.days?.[key];
  const s = c?.stars?.[String(star)];
  if (!s) return null;
  const choices = s.choices.map((k) => c.palettes?.[k]).filter(Boolean);
  return choices.length ? { star, ...s, choices } : null;
}

/* ---------- hero + colour module ---------- */
function renderHero() {
  const now = new Date();
  const today = dateKey(now);
  state.today = today;

  $("weekday").textContent = fmt(now, { weekday: "long" });
  $("dateNum").textContent = String(Number(today.slice(8)));
  $("monthYear").textContent = fmt(now, { month: "long", year: "numeric" });
  $("lunar").textContent = [lunarDate(now), ganzhi(today)].filter(Boolean).join(" ");
  $("navTitle").textContent = fmt(now, { weekday: "short", day: "numeric", month: "short" });

  const c = colourFor(today);
  const chips = $("wearChips");
  chips.replaceChildren();

  if (c) {
    const first = c.choices[0];
    applySky(first.hex);
    $("wearLead").hidden = false;
    $("wearName").textContent = first.en;
    $("wearZh").textContent = first.zh;
    (first.chips ?? []).forEach(([n, h]) => chips.append(chipEl(n, h)));
    $("wearNote").textContent = "";
  } else {
    applySky(null);
    $("wearLead").hidden = true;
    $("wearName").textContent = "No colour set";
    $("wearZh").textContent = "";
    $("wearNote").textContent = state.failed.includes("colors")
      ? "The colour chart didn't load. Pull down to refresh."
      : "Today isn't on your colour chart yet. Send Claude the next chart to fill it in.";
  }
  renderColourModule(c, today);
}

function renderColourModule(c, today) {
  const box = $("altChoices");
  box.replaceChildren();
  const mod = $("colourModule");
  const t = colourFor(shiftKey(today, 1));
  if (!c && !t) { mod.hidden = true; return; }
  mod.hidden = false;

  if (c) {
    c.choices.slice(1).forEach((p, i) => box.append(el("div", { class: "alt-row" },
      el("span", { class: "alt-rank", text: String(i + 2), "aria-label": `Choice ${i + 2}` }),
      el("p", { class: "alt-name" }, p.en, el("span", { class: "alt-zh", lang: "zh-CN", text: p.zh })),
      el("span", { class: "alt-chips" }, (p.chips ?? []).map(([n, h]) => chipEl(n, h))))));
    box.append(el("p", { class: "star-line", text: `Day star ${c.star}, ${c.element.toLowerCase()} day (${c.zh})` }));
  }
  if (t) {
    const p = t.choices[0];
    box.append(el("p", { class: "tomorrow-line" }, chipEl(p.en, p.hex, "chip sm"), `Tomorrow: ${p.en}`));
  }
}

function renderStatus() {
  const s = $("status");
  s.textContent = state.offline ? "Offline, showing saved data"
    : state.failed.length === 4 ? "Couldn't load today's data" : "";
  $("footMeta").textContent = `Daily Brief ${APP_VERSION}` +
    (state.loadedAt ? `. Loaded ${fmt(state.loadedAt, { hour: "2-digit", minute: "2-digit" })}` : "");
}

/* ---------- top 3 (device only) ---------- */
const top3Key = (k) => `db.top3.${k}`;
const blankTop3 = () => [0, 1, 2].map(() => ({ text: "", done: false }));

function renderTop3() {
  const today = state.today;
  const items = store.get(top3Key(today), null) ?? blankTop3();
  const list = $("top3");
  list.replaceChildren();

  items.forEach((item, i) => {
    const tick = el("input", { type: "checkbox", class: "tick", "aria-label": `Mark priority ${i + 1} done` });
    tick.checked = item.done;
    const input = el("input", { type: "text", placeholder: i === 0 ? "What matters most today?" : "Add a priority", "aria-label": `Priority ${i + 1}`, enterkeyhint: "done", maxlength: "120" });
    input.value = item.text;
    const li = el("li", { class: item.done ? "done" : "" }, tick, input);
    tick.addEventListener("change", () => {
      items[i].done = tick.checked; li.classList.toggle("done", tick.checked);
      store.set(top3Key(today), items); haptic();
    });
    input.addEventListener("input", () => { items[i].text = input.value; store.set(top3Key(today), items); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    list.append(li);
  });

  const carry = $("carryBtn");
  const yesterday = store.get(top3Key(shiftKey(today, -1)), []) ?? [];
  const leftovers = yesterday.filter((x) => x.text.trim() && !x.done).filter((x) => !items.some((y) => y.text.trim() === x.text.trim()));
  const n = Math.min(leftovers.length, items.filter((x) => !x.text.trim()).length);
  if (n > 0 && !store.get(`db.carryDismissed.${today}`, false)) {
    carry.hidden = false;
    carry.className = "carry pressable";
    carry.textContent = n === 1 ? "Bring over 1 from yesterday" : `Bring over ${n} from yesterday`;
    carry.onclick = () => {
      let j = 0;
      for (const slot of items) if (!slot.text.trim() && j < n) { slot.text = leftovers[j++].text; slot.done = false; }
      store.set(top3Key(today), items); store.set(`db.carryDismissed.${today}`, true);
      haptic(); renderTop3();
    };
  } else carry.hidden = true;

  const cutoff = shiftKey(today, -14);
  for (const k of store.keys("db.top3.")) if (k.slice(8) < cutoff) store.remove(k);
  for (const k of store.keys("db.carryDismissed.")) if (k.slice(18) < cutoff) store.remove(k);
}

/* ---------- markets ---------- */
const num = (v, d = 2) => (typeof v === "number" ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
function pill(p) {
  if (typeof p !== "number" || Number.isNaN(p)) return el("span", { class: "pill", text: "n/a" });
  const dir = p > 0.005 ? "up" : p < -0.005 ? "down" : "flat";
  const sign = dir === "up" ? "+" : dir === "down" ? "−" : "";
  return el("span", { class: `pill ${dir}`, text: `${sign}${Math.abs(p).toFixed(2)}%`,
    "aria-label": `${dir === "flat" ? "unchanged" : dir} ${Math.abs(p).toFixed(2)} percent` });
}
const qRow = (name, sub, val, p) => el("div", { class: "q-row" },
  el("p", { class: "q-name" }, name, sub ? el("span", { class: "q-sub", text: sub }) : null),
  el("p", { class: "q-val", text: val }), pill(p));

function renderMarket() {
  const box = $("market");
  const m = state.data.market;
  box.replaceChildren();
  $("mktAsOf").textContent = "";

  if (!m || !Array.isArray(m.indices) || !m.indices.length) {
    box.append(el("p", { class: "empty", text: state.failed.includes("market")
      ? "The market brief didn't load. Pull down to refresh."
      : "No market brief yet. It refreshes every morning around 7:00." }));
    return;
  }
  const asOf = m.asOf ? new Date(m.asOf) : null;
  const valid = asOf && !Number.isNaN(asOf.getTime());
  const stale = valid && Date.now() - asOf.getTime() > 36 * 3600e3;
  $("mktAsOf").textContent = stale ? "Not updated today" : (m.session || "");

  m.indices.forEach((x) => box.append(qRow(x.name, null, num(x.level), x.changePct)));

  const wl = Array.isArray(m.watchlist) ? m.watchlist : [];
  box.append(el("p", { class: "sub-head", text: "Watchlist" }));
  if (wl.length) wl.forEach((w) => box.append(qRow(w.ticker, w.name, typeof w.price === "number" ? `$${num(w.price)}` : "n/a", w.changePct)));
  else box.append(el("p", { class: "empty", text: "No tickers yet. Tell Claude which stocks to watch and they'll appear here." }));

  if (Array.isArray(m.notes) && m.notes.length) {
    box.append(el("p", { class: "sub-head", text: "What moved" }), el("ul", { class: "notes" }, m.notes.map((t) => el("li", { text: t }))));
  }
  if (Array.isArray(m.events) && m.events.length) {
    box.append(el("p", { class: "sub-head", text: "Coming up" }), el("ul", { class: "notes" }, m.events.map((t) => el("li", { text: t }))));
  }
  const fine = el("p", { class: "fine" });
  if (valid) fine.append(`Updated ${fmt(asOf, { weekday: "short", hour: "2-digit", minute: "2-digit" })}. `);
  const src = (m.sources ?? []).filter((s) => /^https?:\/\//.test(s.url || ""));
  if (src.length) {
    fine.append("Sources: ");
    src.forEach((s, i) => fine.append(i ? ", " : "", el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.title || new URL(s.url).hostname })));
    fine.append(". ");
  }
  fine.append("For information only, not investment advice.");
  box.append(fine);
}

/* ---------- lesson ---------- */
const LESSONS_KEY = "db.lessons"; // { lessonId: "YYYY-MM-DD" completed }
function flatLessons() {
  const out = [];
  (state.data.curriculum?.weeks ?? []).forEach((w, wi) => (w.days ?? []).forEach((d, di) =>
    out.push({ ...d, id: d.id ?? `w${wi + 1}-d${di + 1}`, week: wi + 1, weekTitle: w.title, idx: di, weekLen: w.days.length })));
  return out;
}
function streak(done) {
  const dates = new Set(Object.values(done));
  let k = dates.has(state.today) ? state.today : shiftKey(state.today, -1);
  let n = 0;
  while (dates.has(k)) { n++; k = shiftKey(k, -1); }
  return n;
}
function ring(weekLessons, done) {
  const r = 27, C = 2 * Math.PI * r, n = weekLessons.length, gap = n > 1 ? 7 : 0, len = C / n - gap;
  const svg = svgEl("svg", { viewBox: "0 0 64 64", "aria-hidden": "true" });
  weekLessons.forEach((l, i) => {
    const rot = `rotate(${(i * 360) / n + (gap / C) * 180} 32 32)`;
    svg.append(svgEl("circle", { class: "track", cx: 32, cy: 32, r, fill: "none", "stroke-width": 7, "stroke-linecap": "round", "stroke-dasharray": `${len} ${C}`, transform: rot }));
    svg.append(svgEl("circle", { class: `seg${done[l.id] ? " on" : ""}`, cx: 32, cy: 32, r, fill: "none", "stroke-width": 7, "stroke-linecap": "round", style: `--len:${len}`, transform: rot }));
  });
  const count = weekLessons.filter((l) => done[l.id]).length;
  return el("div", { class: "ring", role: "img", "aria-label": `${count} of ${n} lessons done this week` }, svg, el("span", { class: "ring-label", text: `${count}/${n}` }));
}

function renderLesson(animateFrom) {
  const box = $("learn");
  box.replaceChildren();
  const lessons = flatLessons();
  const done = store.get(LESSONS_KEY, {}) ?? {};
  const s = streak(done);
  $("learnStreak").textContent = s > 1 ? `${s}-day streak` : s === 1 ? "Day 1" : "";

  if (!lessons.length) {
    box.append(el("p", { class: "empty", text: state.failed.includes("curriculum") ? "Lessons didn't load. Pull down to refresh." : "No lessons yet. Ask Claude to set up your learning plan." }));
    return;
  }
  const doneToday = [...lessons].reverse().find((l) => done[l.id] === state.today);
  const cur = doneToday ?? lessons.find((l) => !done[l.id]);
  if (!cur) {
    box.append(el("p", { class: "empty", text: `You've finished all ${lessons.length} lessons. Ask Claude for the next weeks.` }));
    return;
  }
  const weekLessons = lessons.filter((l) => l.week === cur.week);
  const shown = animateFrom ? { ...done, [cur.id]: animateFrom === "on" ? undefined : done[cur.id] } : done;
  const ringEl = ring(weekLessons, shown);

  const isDone = Boolean(done[cur.id]);
  const btn = el("button", { type: "button", class: "done-btn pressable", "aria-pressed": String(isDone) });
  if (isDone) {
    const check = svgEl("svg", { class: "check", viewBox: "0 0 18 18", "aria-hidden": "true" });
    check.append(svgEl("path", { d: "M3.5 9.5 7.2 13 14.5 5" }));
    btn.append(check, "Done for today");
    btn.title = "Tap to undo";
  } else btn.append("Mark as done");
  btn.addEventListener("click", () => {
    const d = store.get(LESSONS_KEY, {}) ?? {};
    const turningOn = !d[cur.id];
    if (turningOn) d[cur.id] = state.today; else delete d[cur.id];
    store.set(LESSONS_KEY, d);
    haptic();
    renderLesson(turningOn ? "on" : null);
  });

  box.append(
    el("div", { class: "lesson-top" }, ringEl,
      el("div", {},
        el("p", { class: "lesson-where", text: `Week ${cur.week}${cur.weekTitle ? `, ${cur.weekTitle}` : ""}` }),
        el("p", { class: "lesson-task", text: cur.task }))),
    cur.why ? el("p", { class: "lesson-why", text: cur.why }) : null,
    Array.isArray(cur.steps) && cur.steps.length ? el("ol", { class: "lesson-steps" }, cur.steps.map((t) => el("li", { text: t }))) : null,
    el("p", { class: "lesson-meta" },
      cur.minutes ? `About ${cur.minutes} min` : null,
      cur.link && /^https?:\/\//.test(cur.link) ? [cur.minutes ? ". " : "", el("a", { href: cur.link, target: "_blank", rel: "noopener", text: cur.linkLabel || "Open the reading" })] : null),
    btn);

  if (isDone) {
    const next = lessons.find((l) => !done[l.id]);
    if (next) box.append(el("p", { class: "next-up", text: `Up next: ${next.task}` }));
  }
  if (animateFrom === "on") {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ringEl.querySelectorAll(".seg").forEach((sEl, i) => { if (done[weekLessons[i].id]) sEl.classList.add("on"); });
      ringEl.querySelector(".ring-label").textContent = `${weekLessons.filter((l) => done[l.id]).length}/${weekLessons.length}`;
    }));
  }
}

/* ---------- motion: compact title bar, pull to refresh ---------- */
function setupNavbar() {
  const bar = $("navbar");
  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver(([e]) => bar.classList.toggle("show", !e.isIntersecting), { rootMargin: "-40px 0px 0px 0px" })
    .observe($("dateNum"));
}

function setupPullToRefresh() {
  const ptr = $("ptr");
  const TRIGGER = 72;
  let startY = null, dy = 0, busy = false;
  const paint = (p) => {
    ptr.style.opacity = String(Math.min(p, 1));
    ptr.style.transform = `scale(${0.6 + 0.4 * Math.min(p, 1)}) rotate(${p * 270}deg)`;
  };
  window.addEventListener("touchstart", (e) => {
    if (busy || window.scrollY > 0 || e.touches.length !== 1) return;
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 0 && window.scrollY <= 0) paint(dy / TRIGGER);
    if (dy >= TRIGGER && !ptr.dataset.armed) { ptr.dataset.armed = "1"; haptic(); }
  }, { passive: true });
  window.addEventListener("touchend", async () => {
    if (startY == null) return;
    startY = null;
    if (dy >= TRIGGER && !busy) {
      busy = true;
      ptr.style.transform = "scale(1)"; ptr.style.opacity = "1"; ptr.classList.add("spin");
      await refresh();
      ptr.classList.remove("spin");
      busy = false;
    }
    delete ptr.dataset.armed;
    ptr.style.transition = "opacity .25s ease, transform .4s var(--spring)";
    paint(0);
    setTimeout(() => { ptr.style.transition = ""; }, 400);
  });
}

/* ---------- orchestration ---------- */
function renderAll() { renderHero(); renderStatus(); renderTop3(); renderMarket(); renderLesson(); }

async function refresh() {
  const btn = $("refreshBtn");
  btn.disabled = true; btn.textContent = "Refreshing";
  await loadAll();
  renderAll();
  btn.disabled = false; btn.textContent = "Refresh";
}

$("refreshBtn").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const old = !state.loadedAt || Date.now() - state.loadedAt.getTime() > 30 * 60e3;
  if (old || dateKey() !== state.today) refresh();
});
window.addEventListener("online", refresh);
window.addEventListener("offline", () => { state.offline = true; renderStatus(); });

renderHero();                     // date paints immediately
setupNavbar();
setupPullToRefresh();
const reveal = () => requestAnimationFrame(() => document.body.classList.add("ready"));
const fallback = setTimeout(reveal, 1200); // never leave the screen blank on a slow network
refresh().then(() => { clearTimeout(fallback); reveal(); });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

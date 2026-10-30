/* Daily Brief v1.2. Today / Colours / Lessons, rendered from data/*.json.
   Content files are updated by Claude via git commits; priorities and lesson ticks stay on this device. */

const APP_VERSION = "1.3.1";
const DEFAULT_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Qatar"; } catch { return "Asia/Qatar"; } })();
const NEUTRAL = "#3A4256";
const PREVIEW_DAYS = 14;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const chevron = () => { const s = svgEl("svg", { class: "chev", viewBox: "0 0 8 13", "aria-hidden": "true" }); s.append(svgEl("path", { d: "m1.5 1.5 5 5-5 5" })); return s; };
const haptic = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };
const restartAnim = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

/* ---------- storage ---------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable */ } },
  keys(prefix) { try { return Object.keys(localStorage).filter((k) => k.startsWith(prefix)); } catch { return []; } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ---------- dates ---------- */
let TZ = DEFAULT_TZ;
const dateKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const keyToUTC = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const shiftKey = (key, days) => { const t = keyToUTC(key); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
const fmt = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
const fmtKey = (key, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(keyToUTC(key));

const CN_DAYS = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十","十一","十二","十三","十四","十五",
  "十六","十七","十八","十九","二十","廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
function lunarDate(key) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { timeZone: "UTC", month: "long", day: "numeric" }).formatToParts(keyToUTC(key));
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return month && day ? "农历" + month + (CN_DAYS[day - 1] ?? "") : "";
  } catch { return ""; }
}
function ganzhi(key) { // 2000-01-07 was a 甲子 day
  const i = ((Math.round((keyToUTC(key) - Date.UTC(2000, 0, 7, 12)) / 864e5) % 60) + 60) % 60;
  return "甲乙丙丁戊己庚辛壬癸"[i % 10] + "子丑寅卯辰巳午未申酉戌亥"[i % 12] + "日";
}

/* ---------- colour helpers ---------- */
function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function luminance(hex) {
  const c = rgb(hex); if (!c) return null;
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const mix = (hex, toward, t) => { const a = rgb(hex), b = rgb(toward); return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
function applySky(hex) {
  const base = rgb(hex) ? hex : NEUTRAL;
  const L = luminance(base);
  const light = (L + 0.05) / 0.05 > 1.05 / (L + 0.05);
  const root = document.documentElement;
  root.dataset.tone = light ? "light" : "dark";
  root.style.setProperty("--swatch", base);
  root.style.setProperty("--swatch-deep", mix(base, "#000000", light ? 0.22 : 0.55));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", base);
}

/* ---------- state + data ---------- */
const state = {
  data: {}, failed: [], loadedAt: null, offline: false,
  today: null, viewDay: null, view: "today", lesson: null,
  calMonth: null, calSel: null,
};

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
  const tz = state.data.config?.tz;
  TZ = tz && tz !== "auto" ? tz : DEFAULT_TZ; // "auto" = follow the phone, so travel days stay right
}

function colourFor(key) {
  const c = state.data.colors;
  const star = c?.days?.[key];
  const s = c?.stars?.[String(star)];
  if (!s) return null;
  const choices = s.choices.map((k) => c.palettes?.[k]).filter(Boolean);
  return choices.length ? { star, ...s, choices } : null;
}
const skyFor = (key) => colourFor(key)?.choices[0].hex ?? null;

/* ---------- Today: hero ---------- */
function chipButton(name, hex) {
  return el("button", { type: "button", class: "chip", style: `background:${hex}`, "aria-label": name, "aria-pressed": "false",
    onclick: (e) => showCallout(e.currentTarget, name) });
}
let calloutTimer;
function showCallout(btn, name) {
  const c = $("chipCallout");
  document.querySelectorAll("#wearChips .chip").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  c.textContent = name;
  restartAnim(c, "show");
  haptic();
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => { c.classList.remove("show"); btn.setAttribute("aria-pressed", "false"); }, 2200);
}

function renderHero(dx = 0) {
  const key = state.viewDay;
  const isToday = key === state.today;
  $("todayPill").hidden = isToday;
  $("weekday").textContent = isToday ? fmt(new Date(), { weekday: "long" }) : fmtKey(key, { weekday: "long" });
  $("dateNum").textContent = String(Number(key.slice(8)));
  $("monthYear").textContent = fmtKey(key, { month: "long", year: "numeric" });
  $("lunar").textContent = [lunarDate(key), ganzhi(key)].filter(Boolean).join(" ");

  const c = colourFor(key);
  const chips = $("wearChips");
  chips.replaceChildren();
  $("chipCallout").textContent = "";
  if (c) {
    const first = c.choices[0];
    $("wearLead").hidden = false;
    $("wearName").textContent = first.en;
    $("wearZh").textContent = first.zh;
    (first.chips ?? []).forEach(([n, h]) => chips.append(chipButton(n, h)));
    $("wearNote").textContent = "";
  } else {
    $("wearLead").hidden = true;
    $("wearName").textContent = "No colour set";
    $("wearZh").textContent = "";
    $("wearNote").textContent = state.failed.includes("colors")
      ? "The colour chart didn't load. Pull down to refresh."
      : isToday ? "Today isn't on your colour chart yet. Send Claude the next chart to fill it in."
        : "This day isn't on your colour chart yet.";
  }
  if (state.view === "today") applySky(c?.choices[0].hex);
  if (dx) for (const id of ["dateNum", "weekday", "wear"]) { const n = $(id); n.style.setProperty("--dx", `${dx}px`); restartAnim(n, "swap"); }
  renderColourModule(c, key);
  renderWeek();
}

function renderWeek() {
  const week = $("week");
  week.replaceChildren();
  for (let i = 0; i < PREVIEW_DAYS; i++) {
    const key = shiftKey(state.today, i);
    const hex = skyFor(key);
    week.append(el("button", {
      type: "button",
      class: `day${i === 0 ? " is-today" : ""}`,
      "aria-pressed": String(key === state.viewDay),
      "aria-label": `${i === 0 ? "Today, " : ""}${fmtKey(key, { weekday: "long", day: "numeric", month: "long" })}${hex ? "" : ", not on the chart"}`,
      onclick: () => setDay(key),
    },
      el("span", { class: "day-dow", text: i === 0 ? "Today" : fmtKey(key, { weekday: "narrow" }) }),
      el("span", { class: "day-num", text: String(Number(key.slice(8))) }),
      el("span", { class: `day-dot${hex ? "" : " none"}`, style: hex ? `background:${hex}` : "" })));
  }
  const sel = week.querySelector('[aria-pressed="true"]');
  sel?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function setDay(key) {
  if (key === state.viewDay) return;
  const dx = key > state.viewDay ? 28 : -28;
  state.viewDay = key;
  haptic();
  renderHero(dx);
}

function renderColourModule(c, key) {
  const box = $("altChoices");
  box.replaceChildren();
  const isToday = key === state.today;
  $("altTitleText").textContent = isToday ? "Also works today" : `Also works ${fmtKey(key, { weekday: "short", day: "numeric", month: "short" })}`;
  const nextKey = shiftKey(key, 1);
  const t = colourFor(nextKey);
  if (!c && !t) { box.append(el("p", { class: "empty", text: "No colours on the chart for these days yet." })); return; }
  if (c) {
    c.choices.slice(1).forEach((p, i) => box.append(choiceRow(p, i + 2)));
    box.append(el("p", { class: "star-line", text: `Day star ${c.star}, ${c.element.toLowerCase()} day (${c.zh})` }));
  }
  if (t) {
    const p = t.choices[0];
    box.append(el("button", { type: "button", class: "tomorrow-line", onclick: () => setDay(nextKey) },
      el("span", { class: "chip sm", style: `background:${p.hex}` }),
      `${isToday ? "Tomorrow" : "Next day"}: ${p.en}`, chevron()));
  }
}
const choiceRow = (p, rank) => el("div", { class: "alt-row" },
  el("span", { class: `alt-rank${rank === 1 ? " first" : ""}`, text: String(rank), "aria-label": `Choice ${rank}` }),
  el("p", { class: "alt-name" }, p.en, el("span", { class: "alt-zh", lang: "zh-CN", text: p.zh })),
  el("span", { class: "alt-chips" }, (p.chips ?? []).map(([n, h]) => el("span", { class: "chip", title: n, role: "img", "aria-label": n, style: `background:${h}` }))));

function renderStatus() {
  $("status").textContent = state.offline ? "Offline, showing saved data" : state.failed.length === 4 ? "Couldn't load today's data" : "";
  $("footMeta").textContent = `Daily Brief ${APP_VERSION}` + (state.loadedAt ? `. Loaded ${fmt(state.loadedAt, { hour: "2-digit", minute: "2-digit" })}` : "");
}

/* ---------- Today: top 3 ---------- */
const top3Key = (k) => `db.top3.${k}`;
function saveTop3(day, items) {
  store.set(top3Key(day), items);
  store.set(`db.ts.top3.${day}`, Date.now());
  scheduleSync();
}
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
    tick.addEventListener("change", () => { items[i].done = tick.checked; li.classList.toggle("done", tick.checked); saveTop3(today, items); haptic(); });
    input.addEventListener("input", () => { items[i].text = input.value; saveTop3(today, items); });
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
      saveTop3(today, items); store.set(`db.carryDismissed.${today}`, true); haptic(); renderTop3();
    };
  } else carry.hidden = true;
  const cutoff = shiftKey(today, -14);
  for (const k of store.keys("db.top3.")) if (k.slice(8) < cutoff) store.remove(k);
  for (const k of store.keys("db.carryDismissed.")) if (k.slice(18) < cutoff) store.remove(k);
  for (const k of store.keys("db.ts.top3.")) if (k.slice(11) < cutoff) store.remove(k);
}

/* ---------- Today: markets ---------- */
const num = (v, d = 2) => (typeof v === "number" ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
function pill(p) {
  if (typeof p !== "number" || Number.isNaN(p)) return el("span", { class: "pill", text: "n/a" });
  const dir = p > 0.005 ? "up" : p < -0.005 ? "down" : "flat";
  const sign = dir === "up" ? "+" : dir === "down" ? "−" : "";
  return el("span", { class: `pill ${dir}`, text: `${sign}${Math.abs(p).toFixed(2)}%`, "aria-label": `${dir === "flat" ? "unchanged" : dir} ${Math.abs(p).toFixed(2)} percent` });
}
function quote({ name, sub, value, level, pct, note, symbol, currency }) {
  const moreId = `q-${Math.random().toString(36).slice(2, 8)}`;
  const detail = [];
  if (typeof level === "number" && typeof pct === "number" && pct > -100) {
    const pts = (level * pct) / (100 + pct);
    detail.push(el("p", { text: `${pts >= 0 ? "Up" : "Down"} ${currency ? "$" : ""}${num(Math.abs(pts))}${currency ? "" : " points"} on the day.` }));
  }
  if (note) detail.push(el("p", { text: note }));
  if (symbol) detail.push(el("p", {}, el("a", { href: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, target: "_blank", rel: "noopener", text: "Open the chart on Yahoo Finance" })));
  const wrap = el("div", { class: "q" });
  const btn = el("button", { type: "button", class: "q-row", "aria-expanded": "false", "aria-controls": moreId,
    onclick: () => { const open = wrap.classList.toggle("open"); btn.setAttribute("aria-expanded", String(open)); haptic(); } },
    el("span", { class: "q-name" }, name, sub ? el("span", { class: "q-sub", text: sub }) : null),
    el("span", { class: "q-val", text: value }), pill(pct));
  wrap.append(btn, el("div", { class: "q-more", id: moreId }, el("div", {}, el("div", { class: "q-detail" }, detail))));
  return wrap;
}

function renderMarket() {
  const box = $("market");
  const m = state.data.market;
  box.replaceChildren();
  $("mktAsOf").textContent = "";
  if (!m || !Array.isArray(m.indices) || !m.indices.length) {
    box.append(el("p", { class: "empty", text: state.failed.includes("market") ? "The market brief didn't load. Pull down to refresh." : "No market brief yet. It refreshes after each US market close." }));
    return;
  }
  const asOf = m.asOf ? new Date(m.asOf) : null;
  const valid = asOf && !Number.isNaN(asOf.getTime());
  const dowUTC = new Date().getUTCDay();             // no US session Sat/Sun, so allow the weekend gap
  const allowH = dowUTC === 0 || dowUTC === 1 || dowUTC === 6 ? 84 : 36;
  const stale = valid && Date.now() - asOf.getTime() > allowH * 3600e3;
  $("mktAsOf").textContent = stale ? "Not updated today" : (m.session || "");

  const idx = el("div");
  m.indices.forEach((x) => idx.append(quote({ name: x.name, value: num(x.level), level: x.level, pct: x.changePct, note: x.note, symbol: x.symbol })));
  box.append(idx);

  const wl = Array.isArray(m.watchlist) ? m.watchlist : [];
  box.append(el("p", { class: "sub-head", text: "Watchlist" }));
  if (wl.length) {
    const w = el("div");
    wl.forEach((x) => w.append(quote({ name: x.ticker, sub: x.name, value: typeof x.price === "number" ? `$${num(x.price)}` : "n/a", level: x.price, pct: x.changePct, note: x.note, symbol: x.ticker, currency: true })));
    box.append(w);
  } else box.append(el("p", { class: "empty", text: "No tickers yet. Tell Claude which stocks to watch and they'll appear here." }));

  if (m.notes?.length) box.append(el("p", { class: "sub-head", text: "What moved" }), el("ul", { class: "notes" }, m.notes.map((t) => el("li", { text: t }))));
  if (m.events?.length) box.append(el("p", { class: "sub-head", text: "Coming up" }), el("ul", { class: "notes" }, m.events.map((t) => el("li", { text: t }))));
  const fine = el("p", { class: "fine" });
  if (valid) fine.append(`Updated ${fmt(asOf, { weekday: "short", hour: "2-digit", minute: "2-digit" })}. `);
  const src = (m.sources ?? []).filter((s) => /^https?:\/\//.test(s.url || ""));
  if (src.length) { fine.append("Sources: "); src.forEach((s, i) => fine.append(i ? ", " : "", el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.title || new URL(s.url).hostname }))); fine.append(". "); }
  fine.append("For information only, not investment advice.");
  box.append(fine);
}

/* ---------- lessons (shared) ---------- */
const LESSONS_KEY = "db.lessons"; // { lessonId: "YYYY-MM-DD" completed }
const getDone = () => store.get(LESSONS_KEY, {}) ?? {};
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
function toggleLesson(id) {
  const d = getDone();
  const on = !d[id];
  if (on) d[id] = state.today; else delete d[id];
  store.set(LESSONS_KEY, d);
  const ts = store.get("db.ts.lessons", {}) ?? {};
  ts[id] = Date.now();
  store.set("db.ts.lessons", ts);
  scheduleSync();
  haptic();
  return on;
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
  return el("button", { type: "button", class: "ring", "aria-label": `${count} of ${n} lessons done this week. Open all lessons`, onclick: () => go("lessons") },
    svg, el("span", { class: "ring-label", text: `${count}/${n}` }));
}
function animateRing(ringEl, weekLessons, done) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ringEl.querySelectorAll(".seg").forEach((s, i) => s.classList.toggle("on", Boolean(done[weekLessons[i].id])));
    ringEl.querySelector(".ring-label").textContent = `${weekLessons.filter((l) => done[l.id]).length}/${weekLessons.length}`;
  }));
}
function doneButton(lesson, done, after) {
  const isDone = Boolean(done[lesson.id]);
  const btn = el("button", { type: "button", class: "done-btn pressable", "aria-pressed": String(isDone), title: isDone ? "Tap to undo" : null,
    onclick: () => { const on = toggleLesson(lesson.id); after(on); } });
  if (isDone) {
    const check = svgEl("svg", { class: "check", viewBox: "0 0 18 18", "aria-hidden": "true" });
    check.append(svgEl("path", { d: "M3.5 9.5 7.2 13 14.5 5" }));
    btn.append(check, done[lesson.id] === state.today ? "Done for today" : `Done ${fmtKey(done[lesson.id], { day: "numeric", month: "short" })}`);
  } else btn.append("Mark as done");
  return btn;
}
const lessonBody = (l) => [
  l.why ? el("p", { class: "lesson-why", text: l.why }) : null,
  l.steps?.length ? el("ol", { class: "lesson-steps" }, l.steps.map((t) => el("li", { text: t }))) : null,
  el("p", { class: "lesson-meta" }, l.minutes ? `About ${l.minutes} min` : null,
    l.link && /^https?:\/\//.test(l.link) ? [l.minutes ? ". " : "", el("a", { href: l.link, target: "_blank", rel: "noopener", text: l.linkLabel || "Open the reading" })] : null),
];

/* ---------- Today: lesson card ---------- */
function renderLesson(animate = false) {
  const box = $("learn");
  box.replaceChildren();
  const lessons = flatLessons();
  const done = getDone();
  const s = streak(done);
  if (!lessons.length) {
    box.append(el("p", { class: "empty", text: state.failed.includes("curriculum") ? "Lessons didn't load. Pull down to refresh." : "No lessons yet. Ask Claude to set up your learning plan." }));
    return;
  }
  const doneToday = [...lessons].reverse().find((l) => done[l.id] === state.today);
  const cur = doneToday ?? lessons.find((l) => !done[l.id]);
  if (!cur) { box.append(el("p", { class: "empty", text: `You've finished all ${lessons.length} lessons. Ask Claude for the next weeks.` })); return; }
  const weekLessons = lessons.filter((l) => l.week === cur.week);
  const ringEl = ring(weekLessons, animate ? { ...done, [cur.id]: undefined } : done);
  box.append(
    el("div", { class: "lesson-top" }, ringEl,
      el("div", {},
        el("p", { class: "lesson-where", text: `Week ${cur.week}${cur.weekTitle ? `, ${cur.weekTitle}` : ""}${s > 1 ? `. ${s}-day streak` : ""}` }),
        el("p", { class: "lesson-task", text: cur.task }))),
    lessonBody(cur),
    doneButton(cur, done, (on) => renderLesson(on)));
  if (done[cur.id]) {
    const next = lessons.find((l) => !done[l.id]);
    if (next) box.append(el("p", { class: "next-up", text: `Up next: ${next.task}` }));
  }
  if (animate) animateRing(ringEl, weekLessons, done);
}

/* ---------- Colours page ---------- */
function chartMonths() {
  const keys = Object.keys(state.data.colors?.days ?? {}).sort();
  const months = new Set(keys.map((k) => k.slice(0, 7)));
  months.add(state.today.slice(0, 7));
  return [...months].sort();
}
function renderCalendar() {
  const months = chartMonths();
  if (!months.includes(state.calMonth)) state.calMonth = state.today.slice(0, 7);
  const i = months.indexOf(state.calMonth);
  $("calPrev").disabled = i <= 0;
  $("calNext").disabled = i >= months.length - 1;
  const first = `${state.calMonth}-01`;
  $("calMonth").textContent = fmtKey(first, { month: "long", year: "numeric" });

  const dow = document.querySelector(".cal-dow");
  if (!dow.childElementCount) for (let d = 0; d < 7; d++) dow.append(el("span", { text: fmtKey(shiftKey("2026-11-01", d), { weekday: "narrow" }) })); // 1 Nov 2026 is a Sunday

  const grid = $("calGrid");
  grid.replaceChildren();
  const lead = keyToUTC(first).getUTCDay();
  for (let k = 0; k < lead; k++) grid.append(el("span", { "aria-hidden": "true" }));
  for (let key = first; key.startsWith(state.calMonth); key = shiftKey(key, 1)) {
    const hex = skyFor(key);
    const cell = el("button", {
      type: "button",
      class: `cal-cell${key === state.today ? " today" : ""}${key < state.today ? " past" : ""}`,
      "aria-selected": String(key === state.calSel),
      "aria-label": `${fmtKey(key, { weekday: "long", day: "numeric", month: "long" })}${hex ? "" : ", not on the chart"}`,
      onclick: () => { state.calSel = key; haptic(); applySky(skyFor(key)); renderCalendar(); renderCalDetail(); },
    }, el("span", { class: "n", text: String(Number(key.slice(8))) }), el("span", { class: `dot${hex ? "" : " none"}`, style: hex ? `background:${hex}` : "" }));
    grid.append(cell);
  }
}
function renderCalDetail() {
  const box = $("calDetail");
  box.replaceChildren();
  const key = state.calSel;
  const c = colourFor(key);
  box.append(el("p", { class: "detail-title", text: key === state.today ? `Today, ${fmtKey(key, { day: "numeric", month: "long" })}` : fmtKey(key, { weekday: "long", day: "numeric", month: "long" }) }));
  if (!c) {
    box.append(el("p", { class: "detail-sub", text: "Not on your colour chart. Send Claude the chart that covers this date." }));
    return;
  }
  box.append(el("p", { class: "detail-sub" }, `Day star ${c.star}, ${c.element.toLowerCase()} day (${c.zh}). `, el("span", { lang: "zh-CN", text: [lunarDate(key), ganzhi(key)].join(" ") })));
  c.choices.forEach((p, i) => box.append(choiceRow(p, i + 1)));
  box.append(el("button", { type: "button", class: "second-btn pressable", onclick: () => { state.viewDay = key; go("today"); } },
    key === state.today ? "Show on Today" : `Show ${fmtKey(key, { weekday: "short", day: "numeric" })} on Today`));
}
function renderLegend() {
  const box = $("legend");
  if (box.childElementCount) return;
  const c = state.data.colors;
  if (!c?.stars) return;
  const groups = {};
  for (const [star, s] of Object.entries(c.stars)) {
    const g = (groups[s.element] ??= { choices: s.choices, stars: [], zhs: [] });
    g.stars.push(star);
    g.zhs.push(s.zh);
  }
  for (const name of ["Fire", "Earth", "Metal", "Wood", "Water"]) {
    const g = groups[name];
    if (!g) continue;
    box.append(el("div", { class: "legend-row" },
      el("p", { class: "legend-name" }, `${name} day `, el("span", { text: `star ${g.stars.join(", ")} (${g.zhs.join(" ")})` })),
      el("div", { class: "legend-choices" }, g.choices.map((k, i) => {
        const p = c.palettes[k];
        return el("span", { class: "legend-choice" }, el("span", { class: `alt-rank${i === 0 ? " first" : ""}`, text: String(i + 1) }),
          el("span", { class: "alt-chips" }, p.chips.map(([n, h]) => el("span", { class: "chip", title: n, role: "img", "aria-label": n, style: `background:${h}` }))),
          el("span", { lang: "zh-CN", text: p.zh }));
      }))));
  }
  box.append(el("p", { class: "legend-note", text: "1st choice is the element the day feeds (生), 2nd matches it (比和), 3rd is the one it controls (克入). Transcribed from your 2026 chart; send Claude next year's chart before January." }));
}

/* ---------- Lessons page ---------- */
function renderLessonList() {
  const lessons = flatLessons();
  const done = getDone();
  const n = lessons.filter((l) => done[l.id]).length;
  const s = streak(done);
  $("lessonsSub").textContent = lessons.length
    ? `${state.data.curriculum?.title ?? "Your plan"}. ${n} of ${lessons.length} done${s > 1 ? `, ${s}-day streak` : ""}.`
    : "No lessons yet. Ask Claude to set up your learning plan.";
  const next = lessons.find((l) => !done[l.id]);
  const weeks = $("weeks");
  weeks.replaceChildren();
  const byWeek = {};
  lessons.forEach((l) => (byWeek[l.week] ??= []).push(l));
  for (const [w, ls] of Object.entries(byWeek)) {
    weeks.append(el("section", { class: "module week-mod" },
      el("div", { class: "module-head" }, el("h2", {}, el("span", { text: `Week ${w}: ${ls[0].weekTitle ?? ""}` })),
        el("span", { class: "module-meta", text: `${ls.filter((l) => done[l.id]).length}/${ls.length}` })),
      ls.map((l) => {
        const status = done[l.id] ? "done" : l === next ? "next" : "";
        const meta = done[l.id] ? `Done ${fmtKey(done[l.id], { day: "numeric", month: "short" })}` : l === next ? `Up next, about ${l.minutes ?? 20} min` : `About ${l.minutes ?? 20} min`;
        return el("button", { type: "button", class: "l-row", onclick: () => go("lessons", { lesson: l.id }) },
          el("span", { class: `l-status ${status}`, "aria-hidden": "true" }),
          el("span", { class: "l-title" }, l.task, el("span", { class: "l-meta", text: meta })),
          chevron());
      })));
  }
}
function renderLessonDetail(animate = false) {
  const box = $("lessonDetail");
  const lessons = flatLessons();
  const l = lessons.find((x) => x.id === state.lesson);
  box.replaceChildren();
  if (!l) { box.append(el("p", { class: "empty", text: "That lesson isn't in your plan any more." })); return; }
  const done = getDone();
  const i = lessons.indexOf(l);
  const next = lessons[i + 1];
  const weekLessons = lessons.filter((x) => x.week === l.week);
  const ringEl = ring(weekLessons, animate ? { ...done, [l.id]: undefined } : done);
  box.append(
    el("p", { class: "lesson-where", text: `Week ${l.week}, lesson ${l.idx + 1} of ${l.weekLen}` }),
    el("h1", { class: "large-title", id: "lessonTitle", text: l.task }),
    el("section", { class: "module" },
      el("div", { class: "lesson-top" }, ringEl, el("p", { class: "lesson-where", text: l.weekTitle ?? "" })),
      lessonBody(l),
      doneButton(l, done, (on) => { renderLessonDetail(on); renderLessonList(); renderLesson(); }),
      next ? el("button", { type: "button", class: "second-btn pressable", onclick: () => go("lessons", { lesson: next.id, replace: true }) }, "Next lesson", chevron()) : null));
  if (animate) animateRing(ringEl, weekLessons, done);
}

/* ---------- sync between phones ----------
   Top 3 and lesson ticks are kept in one JSON file in a PRIVATE GitHub repo, read and written with a
   fine-grained token that only has Contents access to that repo. Every entry carries a timestamp and
   the newest copy wins, so edits on either phone merge cleanly. */
const SYNC_KEY = "db.sync";
const SYNC_FILE = "brief-state.json";
const syncCfg = () => store.get(SYNC_KEY, null) ?? {};
const syncOn = () => Boolean(syncCfg().repo && syncCfg().token);
const saveSyncCfg = (patch) => store.set(SYNC_KEY, { ...syncCfg(), ...patch });

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

function localDoc() {
  const doc = { v: 1, top3: {}, lessons: {} };
  for (const k of store.keys("db.top3.")) {
    const day = k.slice(8);
    doc.top3[day] = { items: store.get(k, []), t: store.get(`db.ts.top3.${day}`, 0) };
  }
  const done = getDone();
  const ts = store.get("db.ts.lessons", {}) ?? {};
  for (const id of new Set([...Object.keys(done), ...Object.keys(ts)])) doc.lessons[id] = { date: done[id] ?? null, t: ts[id] ?? 0 };
  return doc;
}
function mergeDocs(a, b) {
  const out = { v: 1, top3: { ...(a?.top3 ?? {}) }, lessons: { ...(a?.lessons ?? {}) } };
  for (const [d, r] of Object.entries(b?.top3 ?? {})) if (!out.top3[d] || (r.t ?? 0) > (out.top3[d].t ?? 0)) out.top3[d] = r;
  for (const [id, r] of Object.entries(b?.lessons ?? {})) if (!out.lessons[id] || (r.t ?? 0) > (out.lessons[id].t ?? 0)) out.lessons[id] = r;
  const cutoff = shiftKey(state.today ?? dateKey(), -14);
  for (const d of Object.keys(out.top3)) if (d < cutoff) delete out.top3[d];
  return out;
}
function applyDoc(doc) {
  for (const [d, r] of Object.entries(doc.top3)) { store.set(top3Key(d), r.items); store.set(`db.ts.top3.${d}`, r.t ?? 0); }
  const done = {}, ts = {};
  for (const [id, r] of Object.entries(doc.lessons)) { if (r.date) done[id] = r.date; ts[id] = r.t ?? 0; }
  store.set(LESSONS_KEY, done);
  store.set("db.ts.lessons", ts);
}

async function gh(method, body) {
  const { repo, token } = syncCfg();
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${SYNC_FILE}`, {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}
const syncError = (status) => ({
  401: "GitHub rejected the token. Make a new one and paste it again.",
  403: "The token can't write to this repo. Give it Contents: Read and write on the sync repo.",
  404: "Repo not found. Check the name, that it exists, and that the token can see it.",
}[status] ?? `GitHub answered ${status}. Try again in a minute.`);

let syncing = null, syncTimer = 0;
function scheduleSync() {
  if (!syncOn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(), 1500);
}
async function runSync({ quiet = true } = {}) {
  if (!syncOn() || !navigator.onLine) return;
  if (syncing) return syncing;
  syncing = (async () => {
    const before = canon(localDoc());
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const got = await gh("GET");
        let remote = null, sha;
        if (got.ok) { const j = await got.json(); sha = j.sha; remote = JSON.parse(b64decode(j.content)); }
        else if (got.status !== 404) throw new Error(syncError(got.status));
        const merged = mergeDocs(localDoc(), remote);
        applyDoc(merged);
        if (remote && canon(merged) === canon(mergeDocs(remote, null))) break; // nothing new to send
        const put = await gh("PUT", { message: `Sync from ${navigator.userAgent.includes("Android") ? "Android" : "iPhone"}`, content: b64encode(JSON.stringify(merged, null, 1)), ...(sha ? { sha } : {}) });
        if (put.ok) break;
        if ((put.status === 409 || put.status === 422) && attempt === 0) continue; // the other phone wrote first: merge again
        if (got.status === 404 && put.status === 404) throw new Error(syncError(404));
        throw new Error(syncError(put.status));
      }
      saveSyncCfg({ lastSync: Date.now(), lastError: null });
    } catch (e) {
      saveSyncCfg({ lastError: e.message || "Couldn't reach GitHub." });
    } finally {
      syncing = null;
    }
    if (canon(localDoc()) !== before) {
      if (!document.activeElement?.closest?.("#top3")) renderTop3();
      renderLesson();
      if (state.view === "lessons") state.lesson ? renderLessonDetail() : renderLessonList();
    }
    renderSyncStatus();
    if (state.view === "sync") renderSyncPage();
  })();
  return syncing;
}

function renderSyncStatus() {
  const c = syncCfg();
  const link = $("syncLink");
  if (!link) return;
  link.textContent = !syncOn() ? "Sync is off" : c.lastError ? "Sync needs attention" : c.lastSync ? `Synced ${fmt(new Date(c.lastSync), { hour: "2-digit", minute: "2-digit" })}` : "Sync on";
}
function renderSyncPage() {
  const c = syncCfg();
  if (!$("syncRepo").value) $("syncRepo").value = c.repo ?? "yhgiam97-tech/daily-brief-sync";
  $("syncToken").placeholder = c.token ? "Saved on this phone" : "github_pat_…";
  $("syncOff").hidden = !syncOn();
  $("syncNow").hidden = !syncOn();
  $("syncSave").textContent = syncOn() ? "Update" : "Turn on sync";
  const st = $("syncState");
  st.textContent = !syncOn() ? "Off. Top 3 and lesson ticks stay on this phone only."
    : c.lastError ? c.lastError
      : c.lastSync ? `On. Last synced ${fmt(new Date(c.lastSync), { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : "On. Syncing…";
  st.classList.toggle("bad", Boolean(syncOn() && c.lastError));
}
function setupSyncPage() {
  $("syncLink").addEventListener("click", () => go("sync"));
  $("syncSave").addEventListener("click", async () => {
    const repo = $("syncRepo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    const token = $("syncToken").value.trim() || syncCfg().token;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { $("syncState").textContent = "Enter the repo as owner/name, e.g. yhgiam97-tech/daily-brief-sync."; return; }
    if (!token) { $("syncState").textContent = "Paste the access token first."; return; }
    saveSyncCfg({ repo, token, lastError: null });
    $("syncToken").value = "";
    $("syncState").textContent = "Connecting…";
    haptic();
    await runSync({ quiet: false });
  });
  $("syncNow").addEventListener("click", async () => { haptic(); $("syncState").textContent = "Syncing…"; await runSync({ quiet: false }); });
  $("syncOff").addEventListener("click", () => { store.remove(SYNC_KEY); haptic(); renderSyncPage(); renderSyncStatus(); });
}

/* ---------- navigation ---------- */
function go(view, { lesson = null, replace = false } = {}) {
  const st = { view, lesson };
  if (replace) history.replaceState(st, ""); else history.pushState(st, "");
  showView(view, lesson);
}
function showView(view, lesson = null) {
  const changed = view !== state.view || lesson !== state.lesson;
  state.view = view;
  state.lesson = lesson;
  for (const v of ["today", "colours", "lessons", "sync"]) $(`view-${v}`).hidden = v !== view;
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.view === (view === "sync" ? "today" : view)) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });

  if (view === "today") { renderHero(); applySky(skyFor(state.viewDay)); }
  if (view === "colours") {
    state.calSel ??= state.viewDay;
    state.calMonth = state.calSel.slice(0, 7);
    renderCalendar(); renderCalDetail(); renderLegend();
    applySky(skyFor(state.calSel));
  }
  if (view === "lessons") {
    $("lessonList").hidden = Boolean(lesson);
    $("lessonDetail").hidden = !lesson;
    if (lesson) { renderLessonDetail(); restartAnim($("lessonDetail"), "in"); } else renderLessonList();
    applySky(skyFor(state.today));
  }
  if (view === "sync") { renderSyncPage(); applySky(skyFor(state.today)); }
  const back = $("navBack");
  back.hidden = !((view === "lessons" && lesson) || view === "sync");
  $("navBackLabel").textContent = view === "sync" ? "Today" : "Lessons";
  if (changed) {
    window.scrollTo({ top: 0 });
    if (!(view === "lessons" && lesson)) restartAnim($(`view-${view}`), "in");
  }
  updateNavbar();
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  haptic();
  if (t.dataset.view === state.view && !state.lesson) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  go(t.dataset.view);
}));
$("navBack").addEventListener("click", () => history.back());
$("todayPill").addEventListener("click", () => setDay(state.today));
$("openCalendar").addEventListener("click", () => { state.calSel = state.viewDay; go("colours"); });
$("openLessons").addEventListener("click", () => go("lessons"));
$("calPrev").addEventListener("click", () => { const m = chartMonths(); state.calMonth = m[Math.max(0, m.indexOf(state.calMonth) - 1)]; haptic(); renderCalendar(); });
$("calNext").addEventListener("click", () => { const m = chartMonths(); state.calMonth = m[Math.min(m.length - 1, m.indexOf(state.calMonth) + 1)]; haptic(); renderCalendar(); });
window.addEventListener("popstate", (e) => showView(e.state?.view ?? "today", e.state?.lesson ?? null));

/* Compact title bar: shows once the page's big title scrolls under it. */
function updateNavbar() {
  const bar = $("navbar");
  const anchor = state.view === "today" ? $("dateNum") : state.view === "colours" ? $("coloursTitle") : state.view === "sync" ? $("syncTitle") : state.lesson ? $("lessonTitle") : $("lessonsTitle");
  const title = state.view === "today" ? fmtKey(state.viewDay, { weekday: "short", day: "numeric", month: "short" })
    : state.view === "colours" ? "Colours" : state.view === "sync" ? "Sync" : state.lesson ? (flatLessons().find((l) => l.id === state.lesson)?.task ?? "Lesson") : "Lessons";
  const pinned = (state.view === "lessons" && Boolean(state.lesson)) || state.view === "sync";
  const scrolledPast = anchor ? anchor.getBoundingClientRect().bottom < bar.offsetHeight + 4 : false;
  const twoPane = state.view === "today" && matchMedia("(min-width: 680px)").matches;
  bar.classList.toggle("show", !twoPane && (pinned || scrolledPast));
  $("navTitle").textContent = scrolledPast ? title : "";
}
let navRaf = 0;
window.addEventListener("scroll", () => { if (!navRaf) navRaf = requestAnimationFrame(() => { navRaf = 0; updateNavbar(); }); }, { passive: true });
window.addEventListener("resize", updateNavbar);

/* Swipe the date sideways to step through days. */
function setupHeroSwipe() {
  const hero = $("hero");
  let x0 = null, y0 = null;
  hero.addEventListener("touchstart", (e) => { if (e.touches.length === 1 && !e.target.closest(".week")) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  hero.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const step = dx < 0 ? 1 : -1;
    const target = shiftKey(state.viewDay, step);
    if (target < state.today || target > shiftKey(state.today, 60)) return;
    setDay(target);
  }, { passive: true });
}

/* Pull to refresh (Today only). */
function setupPullToRefresh() {
  const ptr = $("ptr");
  const TRIGGER = 72;
  let startY = null, dy = 0, busy = false;
  const paint = (p) => { ptr.style.opacity = String(Math.min(p, 1)); ptr.style.transform = `scale(${0.6 + 0.4 * Math.min(p, 1)}) rotate(${p * 270}deg)`; };
  window.addEventListener("touchstart", (e) => {
    if (busy || state.view !== "today" || window.scrollY > 0 || e.touches.length !== 1 || e.target.closest(".week")) return;
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
function syncToday() {
  const t = dateKey();
  if (t !== state.today) { state.today = t; state.viewDay = t; state.calSel = null; }
}
function renderAll() {
  syncToday();
  renderStatus(); renderTop3(); renderMarket(); renderLesson();
  showView(state.view, state.lesson);
}
async function refresh() {
  const btn = $("refreshBtn");
  btn.disabled = true; btn.textContent = "Refreshing";
  await loadAll();
  $("legend").replaceChildren();
  renderAll();
  runSync();
  btn.disabled = false; btn.textContent = "Refresh";
}
$("refreshBtn").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const old = !state.loadedAt || Date.now() - state.loadedAt.getTime() > 30 * 60e3;
  if (old || dateKey() !== state.today) refresh(); else runSync();
});
window.addEventListener("online", refresh);
window.addEventListener("pagehide", () => { if (syncTimer) { clearTimeout(syncTimer); runSync(); } });
window.addEventListener("offline", () => { state.offline = true; renderStatus(); });

syncToday();
history.replaceState({ view: "today", lesson: null }, "");
renderHero();
setupHeroSwipe();
setupPullToRefresh();
setupSyncPage();
renderSyncStatus();
const reveal = () => requestAnimationFrame(() => document.body.classList.add("ready"));
const fallback = setTimeout(reveal, 1200);
refresh().then(() => { clearTimeout(fallback); reveal(); });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

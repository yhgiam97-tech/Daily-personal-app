/* Daily Brief — renders the Today screen from data/*.json.
   Content files are updated by Claude via git commits; priorities and lesson ticks stay on this device. */

const APP_VERSION = "1.0.0";
const DEFAULT_TZ = "Asia/Qatar";
const INK = "#1C2029";
const PAPER = "#F6F7F8";
const NEUTRAL_SWATCH = "#2B3140";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
};

/* ---------- storage (never trusted to exist) ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  keys(prefix) {
    try { return Object.keys(localStorage).filter((k) => k.startsWith(prefix)); } catch { return []; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ---------- dates in the user's time zone ---------- */
let TZ = DEFAULT_TZ;

function dateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function keyToUTC(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function shiftKey(key, days) {
  const t = keyToUTC(key);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
function fmt(d, opts) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
}

const CN_DAYS = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
  "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
  "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];

function lunarDate(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { timeZone: TZ, month: "long", day: "numeric" }).formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = Number(parts.find((p) => p.type === "day")?.value);
    if (!month || !day) return "";
    return "农历" + month + (CN_DAYS[day - 1] ?? "");
  } catch { return ""; }
}

/* ---------- colour helpers ---------- */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function applySwatch(hex) {
  const L = luminance(hex) ?? luminance(NEUTRAL_SWATCH);
  const useInk = contrast(L, luminance(INK)) >= contrast(L, luminance(PAPER));
  const on = useInk ? INK : PAPER;
  const root = document.documentElement.style;
  root.setProperty("--swatch", luminance(hex) == null ? NEUTRAL_SWATCH : hex);
  root.setProperty("--on-swatch", on);
  root.setProperty("--on-swatch-soft", useInk ? "rgba(28,32,41,.72)" : "rgba(246,247,248,.78)");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", luminance(hex) == null ? NEUTRAL_SWATCH : hex);
}

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
  results.forEach((r, i) => {
    if (r.status === "fulfilled") state.data[names[i]] = r.value;
    else state.failed.push(names[i]);
  });
  state.offline = !navigator.onLine;
  state.loadedAt = new Date();
  if (state.data.config?.tz) TZ = state.data.config.tz;
}

/* ---------- hero ---------- */
function renderHero() {
  const now = new Date();
  const today = dateKey(now);
  state.today = today;

  $("weekday").textContent = fmt(now, { weekday: "long" });
  $("dateNum").textContent = String(Number(today.slice(8)));
  $("monthYear").textContent = fmt(now, { month: "long", year: "numeric" });
  $("lunar").textContent = lunarDate(now);

  const colors = state.data.colors?.days ?? state.data.colors ?? {};
  const c = colors[today];
  if (c && c.color) {
    applySwatch(c.hex);
    $("wearName").textContent = c.color;
    $("wearNote").textContent = c.note || "";
    $("wear").querySelector(".wear-lead").hidden = false;
  } else {
    applySwatch(null);
    $("wear").querySelector(".wear-lead").hidden = true;
    $("wearName").textContent = "No colour set";
    $("wearNote").textContent = state.failed.includes("colors")
      ? "The colour chart didn't load. Tap Refresh, or check your connection."
      : "Today isn't on your colour chart yet. Send Claude the next chart to fill it in.";
  }

  const t = colors[shiftKey(today, 1)];
  if (t && t.color) {
    $("tomorrow").hidden = false;
    $("tomorrowDot").style.background = luminance(t.hex) == null ? "transparent" : t.hex;
    $("tomorrowText").textContent = `Tomorrow: ${t.color}`;
  } else {
    $("tomorrow").hidden = true;
  }
}

function renderStatus() {
  const s = $("status");
  if (state.offline) s.textContent = "Offline, showing saved data";
  else if (state.failed.length === 4) s.textContent = "Couldn't load today's data";
  else s.textContent = "";
  $("footMeta").textContent = `Version ${APP_VERSION}` +
    (state.loadedAt ? `, loaded ${fmt(state.loadedAt, { hour: "2-digit", minute: "2-digit" })}` : "");
}

/* ---------- top 3 (device only) ---------- */
const top3Key = (k) => `db.top3.${k}`;
const blankTop3 = () => [{ text: "", done: false }, { text: "", done: false }, { text: "", done: false }];

function renderTop3() {
  const today = state.today;
  const items = store.get(top3Key(today), null) ?? blankTop3();
  const list = $("top3");
  list.replaceChildren();

  items.forEach((item, i) => {
    const tick = el("input", { type: "checkbox", class: "tick", checked: item.done, "aria-label": `Mark priority ${i + 1} done` });
    const input = el("input", { type: "text", value: item.text, placeholder: i === 0 ? "What matters most today?" : "Add a priority", "aria-label": `Priority ${i + 1}`, enterKeyHint: "done", maxLength: 120 });
    const li = el("li", { class: item.done ? "done" : "" }, tick, input);

    tick.addEventListener("change", () => {
      items[i].done = tick.checked;
      li.classList.toggle("done", tick.checked);
      store.set(top3Key(today), items);
    });
    input.addEventListener("input", () => { items[i].text = input.value; store.set(top3Key(today), items); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    list.append(li);
  });

  // Offer yesterday's unfinished items for any empty slots.
  const carry = $("carryBtn");
  const yesterday = store.get(top3Key(shiftKey(today, -1)), []) ?? [];
  const leftovers = yesterday.filter((x) => x.text.trim() && !x.done)
    .filter((x) => !items.some((y) => y.text.trim() === x.text.trim()));
  const free = items.filter((x) => !x.text.trim()).length;
  const n = Math.min(leftovers.length, free);
  if (n > 0 && !store.get(`db.carryDismissed.${today}`, false)) {
    carry.hidden = false;
    carry.textContent = n === 1 ? "Bring over 1 unfinished from yesterday" : `Bring over ${n} unfinished from yesterday`;
    carry.onclick = () => {
      let j = 0;
      for (const slot of items) if (!slot.text.trim() && j < n) { slot.text = leftovers[j++].text; slot.done = false; }
      store.set(top3Key(today), items);
      store.set(`db.carryDismissed.${today}`, true);
      renderTop3();
    };
  } else {
    carry.hidden = true;
  }

  // Keep two weeks of history.
  const cutoff = shiftKey(today, -14);
  for (const k of store.keys("db.top3.")) if (k.slice(8) < cutoff) store.remove(k);
  for (const k of store.keys("db.carryDismissed.")) if (k.slice(18) < cutoff) store.remove(k);
}

/* ---------- markets ---------- */
function chg(p) {
  if (typeof p !== "number" || Number.isNaN(p)) return el("span", { class: "chg flat", text: "n/a" });
  const dir = p > 0.005 ? "up" : p < -0.005 ? "down" : "flat";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
  const label = `${arrow}${arrow ? " " : ""}${Math.abs(p).toFixed(2)}%`;
  return el("span", { class: `chg ${dir}`, text: label, "aria-label": `${dir === "down" ? "down" : dir === "up" ? "up" : "unchanged"} ${Math.abs(p).toFixed(2)} percent` });
}
const num = (v, d = 2) => (typeof v === "number" ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");

function renderMarket() {
  const box = $("market");
  const m = state.data.market;
  box.replaceChildren();
  $("mktAsOf").textContent = "";

  if (!m || !Array.isArray(m.indices) || m.indices.length === 0) {
    box.append(el("p", { class: "empty", text: state.failed.includes("market")
      ? "The market brief didn't load. Tap Refresh, or check your connection."
      : "No market brief yet. It refreshes every morning around 7:00." }));
    return;
  }

  const asOf = m.asOf ? new Date(m.asOf) : null;
  if (asOf && !Number.isNaN(asOf.getTime())) {
    const stale = Date.now() - asOf.getTime() > 36 * 3600 * 1000;
    $("mktAsOf").textContent = (m.session ? `${m.session}, ` : "") +
      `updated ${fmt(asOf, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` +
      (stale ? ". May be out of date" : "");
  }

  box.append(el("div", { class: "indices" }, m.indices.map((x) =>
    el("div", {},
      el("p", { class: "idx-name", text: x.name }),
      el("p", { class: "idx-level", text: num(x.level) }),
      el("p", {}, chg(x.changePct))))));

  const wl = Array.isArray(m.watchlist) ? m.watchlist : [];
  const watch = el("div", { class: "watch" }, el("h3", { text: "Your watchlist" }));
  if (wl.length === 0) {
    watch.append(el("p", { class: "empty", text: "No tickers yet. Tell Claude which stocks to watch and they'll appear here." }));
  } else {
    for (const w of wl) {
      watch.append(el("div", { class: "watch-row" },
        el("p", { class: "tkr" }, w.ticker, w.name ? el("span", { class: "tkr-name", text: w.name }) : null),
        el("p", { class: "px", text: typeof w.price === "number" ? `$${num(w.price)}` : "n/a" }),
        el("p", { class: "px" }, chg(w.changePct))));
    }
  }
  box.append(watch);

  if (Array.isArray(m.notes) && m.notes.length) {
    box.append(el("div", { class: "moved" }, el("h3", { text: "What moved" }),
      el("ul", {}, m.notes.map((t) => el("li", { text: t })))));
  }
  if (Array.isArray(m.events) && m.events.length) {
    box.append(el("div", { class: "events" }, el("h3", { text: "Coming up" }),
      el("ul", {}, m.events.map((t) => el("li", { text: t })))));
  }
  if (Array.isArray(m.sources) && m.sources.length) {
    const src = el("p", { class: "sources" }, "Sources: ");
    m.sources.forEach((s) => {
      if (/^https?:\/\//.test(s.url || "")) src.append(el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.title || new URL(s.url).hostname }));
    });
    box.append(src);
  }
  box.append(el("p", { class: "disclaim", text: "A summary for information only, not investment advice." }));
}

/* ---------- lesson ---------- */
const LESSONS_KEY = "db.lessons"; // { lessonId: "YYYY-MM-DD" completed }

function flatLessons() {
  const weeks = state.data.curriculum?.weeks ?? [];
  const out = [];
  weeks.forEach((w, wi) => (w.days ?? []).forEach((d, di) => out.push({
    ...d, id: d.id ?? `w${wi + 1}-d${di + 1}`, week: wi + 1, weekTitle: w.title, idx: di, weekLen: (w.days ?? []).length,
  })));
  return out;
}

function streak(done) {
  const dates = new Set(Object.values(done));
  let k = dates.has(state.today) ? state.today : shiftKey(state.today, -1);
  let n = 0;
  while (dates.has(k)) { n++; k = shiftKey(k, -1); }
  return n;
}

function renderLesson() {
  const box = $("learn");
  box.replaceChildren();
  const lessons = flatLessons();
  const done = store.get(LESSONS_KEY, {}) ?? {};

  const s = streak(done);
  $("learnStreak").textContent = s > 1 ? `${s}-day streak` : s === 1 ? "1 day so far" : "";

  if (lessons.length === 0) {
    box.append(el("p", { class: "empty", text: state.failed.includes("curriculum")
      ? "Lessons didn't load. Tap Refresh, or check your connection."
      : "No lessons yet. Ask Claude to set up your learning plan." }));
    return;
  }

  const doneToday = [...lessons].reverse().find((l) => done[l.id] === state.today);
  const current = doneToday ?? lessons.find((l) => !done[l.id]);
  if (!current) {
    box.append(el("p", { class: "empty", text: `You've finished all ${lessons.length} lessons. Ask Claude for the next weeks.` }));
    return;
  }

  const weekLessons = lessons.filter((l) => l.week === current.week);
  const card = el("div", { class: "lesson" },
    el("p", { class: "lesson-where", text: `Week ${current.week}, ${current.weekTitle ?? ""}`.replace(/, $/, "") + `. Lesson ${current.idx + 1} of ${current.weekLen}` }),
    el("p", { class: "lesson-task", text: current.task }),
    current.why ? el("p", { class: "lesson-why", text: current.why }) : null,
    Array.isArray(current.steps) && current.steps.length ? el("ol", { class: "lesson-steps" }, current.steps.map((t) => el("li", { text: t }))) : null,
    el("p", { class: "lesson-meta" },
      current.minutes ? `About ${current.minutes} min` : "",
      current.link && /^https?:\/\//.test(current.link) ? [current.minutes ? ". " : "", el("a", { href: current.link, target: "_blank", rel: "noopener", text: current.linkLabel || "Open the reading" })] : null),
    el("div", { class: "week-dots", "aria-label": `${weekLessons.filter((l) => done[l.id]).length} of ${weekLessons.length} lessons done this week` },
      weekLessons.map((l) => el("span", { class: done[l.id] ? "on" : "" }))));

  const isDone = Boolean(done[current.id]);
  const btn = el("button", { type: "button", class: "done-btn", "aria-pressed": String(isDone), text: isDone ? "Done for today. Tap to undo" : "Mark lesson done" });
  btn.addEventListener("click", () => {
    const d = store.get(LESSONS_KEY, {}) ?? {};
    if (d[current.id]) delete d[current.id]; else d[current.id] = state.today;
    store.set(LESSONS_KEY, d);
    renderLesson();
  });
  card.append(btn);

  if (isDone) {
    const next = lessons.find((l) => !done[l.id]);
    if (next) card.append(el("p", { class: "next-up", text: `Tomorrow: ${next.task}` }));
  }
  box.append(card);
}

/* ---------- orchestration ---------- */
function renderAll() {
  renderHero();
  renderStatus();
  renderTop3();
  renderMarket();
  renderLesson();
}

async function refresh() {
  const btn = $("refreshBtn");
  btn.setAttribute("aria-busy", "true");
  btn.textContent = "Refreshing";
  await loadAll();
  renderAll();
  btn.removeAttribute("aria-busy");
  btn.textContent = "Refresh";
}

$("refreshBtn").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const old = !state.loadedAt || Date.now() - state.loadedAt.getTime() > 30 * 60 * 1000;
  if (old || dateKey() !== state.today) refresh();
});
window.addEventListener("online", refresh);
window.addEventListener("offline", () => { state.offline = true; renderStatus(); });

renderHero();       // date shows instantly, before data arrives
refresh();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

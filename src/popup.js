/* Popup: reads/writes chrome.storage.sync and drives the active tab. */
"use strict";

const D = window.FSDefaults.DEFAULTS;
const $ = (id) => document.getElementById(id);

// Hand-written sample so the preview never needs the tokenizer.
const SAMPLE = [
  ["日本語", "ニホンゴ"], ["を", ""], ["勉強", "ベンキョウ"], ["します", ""]
];
const KATA_WORD = "コーヒー";

let settings = { ...D };
let hanviet = null; // lazily fetched, same table the content script uses
let grantedAllSites = false;
let tab = null;
let host = "";

/* ------------------------------------------------------------- rendering */

async function ensureHanviet() {
  if (hanviet) return hanviet;
  try {
    hanviet = await (await fetch(chrome.runtime.getURL("data/hanviet.json"))).json();
  } catch {
    hanviet = {};
  }
  return hanviet;
}

/** Hán-Việt is per character: 東京 -> "đông kinh". */
function hanvietOf(text) {
  if (!hanviet) return null;
  const parts = [...text].filter((c) => hanviet[c]).map((c) => hanviet[c]);
  return parts.length === [...text].length && parts.length ? parts.join(" ") : null;
}

function renderPreview() {
  const box = $("preview");
  box.textContent = "";
  const skip = window.FSDefaults.skipSet(settings.skipLevel);

  for (const [surface, reading] of SAMPLE) {
    const known = skip && [...surface].every((c) => skip.has(c));
    if (!reading || known) {
      box.appendChild(document.createTextNode(surface));
      continue;
    }
    const ruby = document.createElement("ruby");
    ruby.appendChild(document.createTextNode(surface));
    const rt = document.createElement("rt");
    const hv = settings.script === "hanviet" ? hanvietOf(surface) : null;
    if (hv) {
      rt.className = "fs-hv";
      rt.textContent = hv;
    } else {
      rt.textContent = window.FSKana.convert(reading, settings.script);
    }
    ruby.appendChild(rt);
    box.appendChild(ruby);
  }

  // Katakana sample, so the effect of the loanword setting is visible too.
  if (settings.katakanaMode !== "off") {
    const gloss =
      settings.katakanaMode === "english"
        ? window.FSLoan.lookup(KATA_WORD)
        : window.FSKana.convert(KATA_WORD, settings.script === "hanviet" ? "hiragana" : settings.script);
    box.appendChild(document.createTextNode("\u3002"));
    if (gloss && gloss !== KATA_WORD) {
      const ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(KATA_WORD));
      const rt = document.createElement("rt");
      if (settings.katakanaMode === "english") rt.className = "fs-en";
      rt.textContent = gloss;
      ruby.appendChild(rt);
      box.appendChild(ruby);
    } else {
      box.appendChild(document.createTextNode(KATA_WORD));
    }
    box.appendChild(document.createTextNode("\u3082"));
  }

  box.style.setProperty("--p-size", settings.size + "%");
  box.style.setProperty("--p-opacity", String(settings.opacity / 100));
  box.style.setProperty("--p-color", settings.color || "inherit");
  box.style.lineHeight = String(settings.lineHeight);
}

function renderBlocklist() {
  const ul = $("blocklist");
  ul.textContent = "";
  const list = settings.blocklist || [];

  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No sites yet";
    ul.appendChild(li);
    return;
  }

  for (const name of list) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = name;
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.title = `Turn furigana back on for ${name}`;
    remove.addEventListener("click", () => {
      save({ blocklist: list.filter((h) => h !== name) });
    });
    li.append(span, remove);
    ul.appendChild(li);
  }
}

function renderControls() {
  $("power").setAttribute("aria-pressed", String(settings.enabled));
  document.body.classList.toggle("off", !settings.enabled);

  // Reflect what is actually granted, not just what was last stored.
  $("autoRun").checked = settings.autoRun && grantedAllSites;
  $("hoverOnly").checked = settings.hoverOnly;
  $("lookup").checked = settings.lookup;

  for (const group of ["script", "skipLevel", "katakanaMode"]) {
    for (const btn of $(group).children) {
      btn.setAttribute("aria-pressed", String(btn.dataset.value === settings[group]));
    }
  }

  for (const key of ["size", "opacity", "lineHeight"]) {
    $(key).value = settings[key];
    $(key + "Out").textContent =
      key === "lineHeight" ? Number(settings[key]).toFixed(1) : settings[key] + "%";
  }

  for (const sw of $("swatches").querySelectorAll("button")) {
    sw.setAttribute("aria-pressed", String(sw.dataset.color === (settings.color || "")));
  }
  $("color").value = settings.color || "#2f4a7d";

  const off = (settings.blocklist || []).includes(host);
  $("siteOff").checked = off;
  $("siteState").textContent = off ? "Furigana is off here" : "Furigana is on here";
  renderBlocklist();
  renderPreview();
}

/* ------------------------------------------------------------------ tabs */

function selectTab(name) {
  for (const btn of $("tabs").querySelectorAll("[role=tab]")) {
    const on = btn.dataset.tab === name;
    btn.setAttribute("aria-selected", String(on));
    if (on) {
      $("ink").style.width = btn.offsetWidth + "px";
      $("ink").style.transform = `translateX(${btn.offsetLeft}px)`;
    }
  }
  for (const panel of document.querySelectorAll(".panel")) {
    panel.hidden = panel.dataset.panel !== name;
  }
}

/* -------------------------------------------------------------- plumbing */

function save(patch) {
  Object.assign(settings, patch);
  chrome.storage.sync.set(patch);
  if (patch.script === "hanviet" && !hanviet) {
    ensureHanviet().then(renderControls);
  }
  renderControls();
}

/**
 * The popup cannot inject anything itself, so anything that needs the content
 * script present goes through the service worker first — that is where
 * activeTab can be spent.
 */
async function tell(message, { ensure = false } = {}) {
  if (!tab) return null;
  if (ensure) {
    try {
      await chrome.runtime.sendMessage({ type: "ensureInjected", tabId: tab.id });
    } catch {
      /* fall through and let the send below fail quietly */
    }
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (res) => {
      void chrome.runtime.lastError;
      resolve(res);
    });
  });
}

const ALL_SITES = { origins: ["<all_urls>"] };

async function hasAllSites() {
  try {
    return await chrome.permissions.contains(ALL_SITES);
  } catch {
    return false;
  }
}

async function refreshStatus() {
  const res = await tell({ type: "status" });
  if (!res) {
    $("status").textContent = "Not available on this page";
    return;
  }
  $("status").textContent = res.running
    ? "Working…"
    : res.annotated
      ? `${res.annotated} lines annotated · ${host}`
      : host || "Ready";
}

/* ------------------------------------------------------------ status bar */

const PHASE_TEXT = {
  idle: () => "Engine idle — starts on the first Japanese page",
  starting: () => "Starting the tokenizer\u2026",
  loading: (st) => `Loading dictionary\u2026 ${(st.elapsed / 1000).toFixed(1)}s`,
  ready: (st) =>
    st.dictMs
      ? `Ready \u00b7 dictionary in ${(st.dictMs / 1000).toFixed(1)}s \u00b7 Alt+F toggles`
      : "Ready \u00b7 Alt+F toggles the page",
  error: (st) => st.error || "Engine error"
};

let pollTimer = null;

async function refreshEngine() {
  let st;
  try {
    st = await chrome.runtime.sendMessage({ type: "engineStatus" });
  } catch {
    st = null;
  }
  if (!st) {
    // The service worker is asleep or restarting; that is not an error.
    st = { phase: "idle", elapsed: 0 };
  }

  const bar = $("statusBar");
  bar.dataset.phase = st.phase;
  $("statusText").textContent = (PHASE_TEXT[st.phase] || PHASE_TEXT.idle)(st);
  $("statusText").title = st.error || "";
  $("warmup").hidden = st.phase !== "idle" && st.phase !== "error";

  // Poll quickly while something is happening, slowly once it settles.
  const busy = st.phase === "starting" || st.phase === "loading";
  clearTimeout(pollTimer);
  pollTimer = setTimeout(refreshEngine, busy ? 250 : 1500);
}

/* ----------------------------------------------------------------- wiring */

function wire() {
  $("power").addEventListener("click", () => save({ enabled: !settings.enabled }));

  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[role=tab]");
    if (btn) selectTab(btn.dataset.tab);
  });

  for (const id of ["hoverOnly", "lookup"]) {
    $(id).addEventListener("change", (e) => save({ [id]: e.target.checked }));
  }

  // Running without being asked each time needs access to the sites it runs
  // on, so the checkbox is really a permission prompt.
  $("autoRun").addEventListener("change", async (e) => {
    if (e.target.checked) {
      let granted = false;
      try {
        granted = await chrome.permissions.request(ALL_SITES);
      } catch {
        granted = false;
      }
      if (!granted) {
        e.target.checked = false;
        $("autoRunNote").textContent = "Needs access to the sites you read.";
        return;
      }
    } else {
      try {
        await chrome.permissions.remove(ALL_SITES);
      } catch {
        /* nothing granted to remove */
      }
    }
    $("autoRunNote").textContent = "";
    save({ autoRun: e.target.checked });
    chrome.runtime.sendMessage({ type: "syncRegistration" }).catch(() => {});
  });

  for (const group of ["script", "skipLevel", "katakanaMode"]) {
    $(group).addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) save({ [group]: btn.dataset.value });
    });
  }

  for (const key of ["size", "opacity", "lineHeight"]) {
    $(key).addEventListener("input", (e) => save({ [key]: Number(e.target.value) }));
  }

  $("swatches").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) save({ color: btn.dataset.color });
  });
  $("color").addEventListener("input", (e) => save({ color: e.target.value }));

  $("siteOff").addEventListener("change", async (e) => {
    if (!host) return;
    const list = new Set(settings.blocklist || []);
    e.target.checked ? list.add(host) : list.delete(host);
    save({ blocklist: [...list] });
    if (e.target.checked) {
      await tell({ type: "clear" });
      refreshStatus();
    }
  });

  $("run").addEventListener("click", async () => {
    $("status").textContent = "Working…";
    await tell({ type: "run", scope: "page" });
    refreshStatus();
  });
  $("runSel").addEventListener("click", async () => {
    await tell({ type: "run", scope: "selection" });
    refreshStatus();
  });
  $("clear").addEventListener("click", async () => {
    await tell({ type: "clear" });
    refreshStatus();
  });

  $("warmup").addEventListener("click", async () => {
    $("statusBar").dataset.phase = "starting";
    $("statusText").textContent = "Starting the tokenizer\u2026";
    try {
      await chrome.runtime.sendMessage({ type: "warmup" });
    } catch { /* the status poll will show whatever happened */ }
    refreshEngine();
  });

  $("reset").addEventListener("click", () => {
    chrome.storage.sync.set(D);
    settings = { ...D };
    renderControls();
  });
}

(async function init() {
  const stored = await chrome.storage.sync.get(null);
  settings = { ...D, ...stored };
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  grantedAllSites = await hasAllSites();
  try {
    host = new URL(tab.url).hostname;
  } catch {
    host = "";
  }
  $("hostName").textContent = host || "this page";

  if (settings.script === "hanviet") await ensureHanviet();
  renderControls();
  wire();
  selectTab("reading");
  refreshStatus();
  refreshEngine();
  addEventListener("unload", () => clearTimeout(pollTimer));
})();

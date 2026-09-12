/* Service worker: owns the offscreen tokenizer and routes messages. */
"use strict";

importScripts("defaults.js");

const OFFSCREEN_PATH = "src/offscreen.html";

/* ------------------------------------------------------------ injection --
   The extension asks for no site access at install. It reaches a page one of
   two ways: activeTab, when the user clicks the toolbar icon, presses the
   shortcut or uses the context menu; or a dynamically registered content
   script, on the origins the user has granted for automatic furigana. */

const CONTENT_SCRIPT = {
  id: "furigana",
  js: ["src/defaults.js", "src/kana.js", "src/align.js", "src/loanwords.js", "src/content.js"],
  css: ["src/content.css"],
  runAt: "document_idle",
  allFrames: true
};

/** Put the content script into a tab we have a right to touch, once. */
async function inject(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: CONTENT_SCRIPT.css });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_SCRIPT.js });
    return true;
  } catch (err) {
    // No access to this tab (chrome://, the Web Store, a PDF viewer …), or the
    // script is already there — content.js guards against running twice.
    console.warn("[Furigana Sensei] cannot inject here:", err && err.message);
    return false;
  }
}

/** Keep the auto-run registration in step with whatever the user has granted. */
async function syncRegistration() {
  const granted = await chrome.permissions.getAll();
  const origins = granted.origins || [];
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT.id] })
    .catch(() => []);

  if (!origins.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT.id] });
    return;
  }
  const spec = Object.assign({ matches: origins, persistAcrossSessions: true }, CONTENT_SCRIPT);
  if (existing.length) await chrome.scripting.updateContentScripts([spec]);
  else await chrome.scripting.registerContentScripts([spec]);
}

chrome.permissions.onAdded.addListener(syncRegistration);
chrome.permissions.onRemoved.addListener(syncRegistration);
chrome.runtime.onStartup.addListener(syncRegistration);
let creating = null; // in-flight createDocument promise

/* --------------------------------------------------------------- status --
   One place that knows what the engine is doing, so the popup and the toolbar
   badge can both show it instead of the user guessing. */

const engine = {
  phase: "idle",   // idle | starting | loading | ready | error
  since: Date.now(),
  dictMs: null,    // how long the dictionary took, once it is up
  error: null
};

function setPhase(phase, extra) {
  engine.phase = phase;
  engine.since = Date.now();
  engine.error = null;
  if (extra && extra.error) engine.error = extra.error;
  if (extra && extra.dictMs != null) engine.dictMs = extra.dictMs;
  paintBadge();
}

const BADGE = {
  starting: { text: "…", color: "#c98a2f" },
  loading: { text: "…", color: "#c98a2f" },
  error: { text: "!", color: "#c8503c" }
};

async function paintBadge(tabId) {
  const state = BADGE[engine.phase];
  try {
    if (state) {
      // A problem or a wait applies to every tab, so paint it globally.
      await chrome.action.setBadgeBackgroundColor({ color: state.color });
      await chrome.action.setBadgeText({ text: state.text });
      return;
    }
    // Otherwise the badge belongs to whatever the tab in question is showing.
    if (tabId == null) {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }
    const count = annotatedByTab.get(tabId) || 0;
    await chrome.action.setBadgeBackgroundColor({ color: "#2f4a7d", tabId });
    await chrome.action.setBadgeText({ text: count ? String(count) : "", tabId });
  } catch (_) {
    /* the tab closed, or the action is unavailable */
  }
}

const annotatedByTab = new Map();

chrome.tabs.onRemoved.addListener((tabId) => annotatedByTab.delete(tabId));

async function hasOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (creating) return creating;
  setPhase("starting");
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS"],
      justification: "Runs the Japanese morphological analyser and keeps its 17 MB dictionary in memory once for all tabs."
    })
    .catch((err) => {
      // Another call may have won the race.
      if (!String(err && err.message).includes("Only a single offscreen")) {
        setPhase("error", { error: String((err && err.message) || err) });
        throw err;
      }
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

async function tokenize(chunks) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", type: "tokenize", chunks });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === "offscreen") return; // not ours

  // Progress reports from the offscreen tokenizer.
  if (msg.type === "engine") {
    setPhase(msg.phase, { error: msg.error, dictMs: msg.dictMs });
    return;
  }

  // A content script telling us how much it annotated, for the badge.
  if (msg.type === "annotated") {
    const tabId = sender.tab && sender.tab.id;
    if (tabId != null) {
      annotatedByTab.set(tabId, msg.count || 0);
      paintBadge(tabId);
    }
    return;
  }

  if (msg.type === "ensureInjected") {
    const tabId = msg.tabId;
    chrome.tabs
      .sendMessage(tabId, { type: "ping" })
      .then(() => sendResponse({ ok: true }))
      .catch(async () => sendResponse({ ok: await inject(tabId) }));
    return true; // async
  }

  if (msg.type === "syncRegistration") {
    syncRegistration().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "engineStatus") {
    sendResponse({
      phase: engine.phase,
      elapsed: Date.now() - engine.since,
      dictMs: engine.dictMs,
      error: engine.error
    });
    return;
  }
  if (msg.type === "tokenize") {
    tokenize(msg.chunks).then(
      (res) => sendResponse(res),
      (err) => sendResponse({ error: String((err && err.message) || err) })
    );
    return true; // async
  }
  if (msg.type === "warmup") {
    ensureOffscreen().then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ error: String(err) })
    );
    return true;
  }
});

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    // Not there yet: activeTab lets us put it there, then try once more.
    if (!(await inject(tabId))) return;
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      console.warn("[Furigana Sensei]", err && err.message);
    }
  }
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) await sendToTab(tab.id, message);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-furigana") sendToActiveTab({ type: "toggle" });
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  const merged = Object.assign({}, self.FSDefaults.DEFAULTS, stored);
  await chrome.storage.sync.set(merged);

  syncRegistration();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "furigana-selection",
      title: "Add furigana to selection",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "furigana-page",
      title: "Add furigana to whole page",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "furigana-clear",
      title: "Remove furigana from this page",
      contexts: ["page"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const map = {
    "furigana-selection": { type: "run", scope: "selection" },
    "furigana-page": { type: "run", scope: "page" },
    "furigana-clear": { type: "clear" }
  };
  const message = map[info.menuItemId];
  if (message) sendToTab(tab.id, message);
});

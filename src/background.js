/* Service worker: owns the offscreen tokenizer and routes messages. */
"use strict";

importScripts("defaults.js");

const OFFSCREEN_PATH = "src/offscreen.html";
let creating = null; // in-flight createDocument promise

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
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS"],
      justification: "Runs the Japanese morphological analyser and keeps its 17 MB dictionary in memory once for all tabs."
    })
    .catch((err) => {
      // Another call may have won the race.
      if (!String(err && err.message).includes("Only a single offscreen")) throw err;
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

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (_) {
      /* no content script on this page (chrome:// etc.) */
    }
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-furigana") sendToActiveTab({ type: "toggle" });
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  const merged = Object.assign({}, self.FSDefaults.DEFAULTS, stored);
  await chrome.storage.sync.set(merged);

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
  if (message) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
});

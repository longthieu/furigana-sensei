/* Loads the real service worker with a stubbed chrome API and checks the
   engine state machine that drives the badge and the popup status bar. */
const path = require("path");

function assert(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const badge = { text: [], color: [] };
const listeners = { message: [], command: [], installed: [], tabRemoved: [] };

global.self = global;
global.importScripts = (file) => require(path.join(__dirname, "..", "src", file));

global.chrome = {
  runtime: {
    getURL: (p) => `chrome-extension://test/${p}`,
    getContexts: async () => [],
    onMessage: { addListener: (fn) => listeners.message.push(fn) },
    onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
    sendMessage: async () => ({})
  },
  offscreen: { createDocument: async () => {} },
  action: {
    setBadgeText: async (o) => badge.text.push(o),
    setBadgeBackgroundColor: async (o) => badge.color.push(o)
  },
  tabs: { query: async () => [], sendMessage: async () => {}, onRemoved: { addListener: (fn) => listeners.tabRemoved.push(fn) } },
  commands: { onCommand: { addListener: (fn) => listeners.command.push(fn) } },
  contextMenus: { removeAll: (cb) => cb && cb(), create: () => {}, onClicked: { addListener: () => {} } },
  storage: { sync: { get: async () => ({}), set: async () => {} }, local: { get: async () => ({}) } }
};

require("../src/background.js");

function send(msg, sender = {}) {
  return new Promise((resolve) => {
    let answered = false;
    for (const fn of listeners.message) {
      const kept = fn(msg, sender, (res) => {
        answered = true;
        resolve(res);
      });
      if (!kept && !answered) continue;
    }
    if (!answered) setTimeout(() => resolve(undefined), 10);
  });
}

(async () => {
  let st = await send({ type: "engineStatus" });
  assert(st && st.phase === "idle", `starts idle (got ${st && st.phase})`);

  // The offscreen document reports its progress.
  await send({ type: "engine", phase: "loading" });
  st = await send({ type: "engineStatus" });
  assert(st.phase === "loading", `relays the loading phase (got ${st.phase})`);
  assert(
    badge.text.some((b) => b.text === "…"),
    "a working phase paints a busy badge"
  );

  await send({ type: "engine", phase: "ready", dictMs: 2130 });
  st = await send({ type: "engineStatus" });
  assert(st.phase === "ready" && st.dictMs === 2130, "keeps how long the dictionary took");
  assert(st.error === null, "a good phase clears the previous error");

  await send({ type: "engine", phase: "error", error: "boom" });
  st = await send({ type: "engineStatus" });
  assert(st.phase === "error" && st.error === "boom", "surfaces the error message");
  assert(
    badge.text.some((b) => b.text === "!"),
    "an error paints an alert badge"
  );

  // Per-tab counts come from the content scripts.
  await send({ type: "engine", phase: "ready", dictMs: 10 });
  badge.text.length = 0;
  await send({ type: "annotated", count: 42 }, { tab: { id: 7 } });
  assert(
    badge.text.some((b) => b.text === "42" && b.tabId === 7),
    `badges the reporting tab with its count (got ${JSON.stringify(badge.text)})`
  );

  badge.text.length = 0;
  await send({ type: "annotated", count: 0 }, { tab: { id: 7 } });
  assert(
    badge.text.some((b) => b.text === "" && b.tabId === 7),
    "clearing a page clears its badge"
  );
})();

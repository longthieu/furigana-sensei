/* Offscreen document: holds one kuromoji tokenizer for every tab. */
"use strict";

let tokenizer = null;
let loading = null;

/** Tell the service worker where we are, so the badge and popup can show it. */
function report(phase, extra) {
  try {
    chrome.runtime.sendMessage(Object.assign({ type: "engine", phase }, extra || {}));
  } catch (e) {
    /* worker asleep; it will ask again via engineStatus */
  }
}

function getTokenizer() {
  if (tokenizer) return Promise.resolve(tokenizer);
  if (loading) return loading;
  const startedAt = Date.now();
  report("loading");
  loading = new Promise((resolve, reject) => {
    // Relative path on purpose: kuromoji joins paths with path.join(), which
    // would mangle the "//" of an absolute chrome-extension:// URL.
    kuromoji.builder({ dicPath: "../vendor/dict" }).build((err, built) => {
      if (err) {
        loading = null;
        report("error", { error: String((err && err.message) || err) });
        reject(err);
        return;
      }
      tokenizer = built;
      report("ready", { dictMs: Date.now() - startedAt });
      resolve(built);
    });
  });
  return loading;
}

// Warm the dictionary as soon as the document exists.
getTokenizer().catch((e) => console.error("[Furigana Sensei] dictionary load failed", e));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  if (msg.type !== "tokenize") return;

  getTokenizer().then(
    (tk) => {
      const results = msg.chunks.map((text) => {
        try {
          // Compact pairs [surface, katakana reading] keep the message small.
          return tk.tokenize(text).map((t) => [t.surface_form, t.reading || ""]);
        } catch (e) {
          return [[text, ""]];
        }
      });
      sendResponse({ results });
    },
    (err) => sendResponse({ error: String((err && err.message) || err) })
  );
  return true; // async
});

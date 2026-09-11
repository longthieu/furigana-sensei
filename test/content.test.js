/* Loads the real content script into jsdom with a stubbed chrome API and a
   real kuromoji tokenizer, then checks the DOM it produces. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const kuromoji = require("kuromoji");

const HTML = `<!doctype html><html><body>
  <h1>日本語の練習</h1>
  <p id="p1">東京の学校で勉強しています。</p>
  <p>Plain English, no Japanese here.</p>
  <pre>これは無視される</pre>
  <div contenteditable="true">編集中のテキスト</div>
  <p>コーヒーを飲む</p>
  <p id="zh" lang="zh">我在北京的大学学习经济。</p>
  <div lang="zh"><p id="ja-in-zh" lang="ja">東京で勉強する。</p></div>
  <p id="inline">Our office is in 東京 and opens at 9am.</p>
</body></html>`;

function stubChrome(tokenizer) {
  const messageListeners = [];
  const changeListeners = [];
  return {
    listeners: messageListeners,
    changeListeners,
    api: {
      runtime: {
        // Chrome always sets this; it becomes undefined when the extension is
        // reloaded and this content script is orphaned.
        id: "furigana-sensei-test",
        lastError: undefined,
        getURL: (path) => path,
        sendMessage(msg, cb) {
          if (msg.type === "tokenize") {
            const results = msg.chunks.map((t) =>
              tokenizer.tokenize(t).map((x) => [x.surface_form, x.reading || ""])
            );
            setTimeout(() => cb({ results }), 0);
          } else {
            setTimeout(() => cb({ ok: true }), 0);
          }
        },
        onMessage: { addListener: (fn) => messageListeners.push(fn) }
      },
      storage: {
        sync: { get: (_k, cb) => cb({}), set: () => {} },
        onChanged: { addListener: (fn) => changeListeners.push(fn) }
      }
    }
  };
}

function send(listeners, msg) {
  return new Promise((resolve) => {
    listeners.forEach((fn) => fn(msg, {}, resolve));
  });
}

function assert(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

kuromoji.builder({ dicPath: "node_modules/kuromoji/dict" }).build(async (err, tokenizer) => {
  if (err) throw err;

  const dom = new JSDOM(HTML, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const stub = stubChrome(tokenizer);
  window.chrome = stub.api;
  // The Hán-Việt table is fetched lazily from the extension's own files.
  window.fetch = async (rel) => ({
    json: async () =>
      JSON.parse(fs.readFileSync(path.join(__dirname, "..", rel), "utf8"))
  });

  for (const f of ["defaults.js", "kana.js", "align.js", "loanwords.js", "content.js"]) {
    window.eval(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"));
  }

  await send(stub.listeners, { type: "run", scope: "page" });

  const doc = window.document;
  const p1 = doc.getElementById("p1");

  assert(p1.querySelectorAll("ruby").length > 0, "paragraph gets ruby elements");
  assert(
    p1.querySelector("ruby rt").textContent === "とうきょう" &&
      p1.querySelector("ruby").firstChild.nodeValue === "東京",
    `first ruby is 東京/とうきょう (got "${p1.querySelector("ruby").firstChild.nodeValue}"/"${p1.querySelector("ruby rt").textContent}")`
  );
  assert(p1.textContent.replace(/とう|きょう|がっ|こう|べん/g, "") !== "", "base text preserved");
  assert(doc.querySelector("pre").querySelector("ruby") === null, "<pre> is skipped");
  assert(
    doc.querySelector("[contenteditable]").querySelector("ruby") === null,
    "contenteditable is skipped"
  );
  assert(
    doc.querySelectorAll("p")[1].querySelector("ruby") === null,
    "English paragraph untouched"
  );
  assert(
    doc.getElementById("zh").querySelector("ruby") === null &&
      doc.getElementById("zh").textContent === "我在北京的大学学习经济。",
    "Chinese (lang=zh) is left alone — same characters, wrong language"
  );
  assert(
    doc.getElementById("ja-in-zh").querySelectorAll("ruby").length > 0,
    "lang=ja inside a lang=zh block is still annotated (nearest lang wins)"
  );
  const inline = doc.getElementById("inline");
  assert(
    inline.querySelectorAll("ruby").length === 1 &&
      inline.querySelector("ruby").firstChild.nodeValue === "東京" &&
      inline.textContent.startsWith("Our office is in "),
    "mixed sentence: only the Japanese span is annotated, latin text untouched"
  );
  assert(
    !doc.body.textContent.includes("コーヒー[") &&
      doc.body.innerHTML.includes("コーヒー") &&
      doc.querySelectorAll("ruby").length > 0,
    "katakana left bare while the option is off"
  );
  assert(doc.querySelectorAll(".fs-wrap").length >= 2, "wrappers recorded for undo");

  const before = doc.body.textContent;
  await send(stub.listeners, { type: "clear" });
  assert(doc.querySelectorAll("ruby").length === 0, "clear removes every ruby");
  assert(
    doc.getElementById("p1").textContent === "東京の学校で勉強しています。",
    `clear restores original text (got "${doc.getElementById("p1").textContent}")`
  );
  assert(before !== doc.body.textContent, "text actually changed back");

  // Katakana glosses: switch the setting the way chrome.storage would.
  stub.changeListeners.forEach((fn) =>
    fn({ katakanaMode: { newValue: "english" } }, "sync")
  );
  await send(stub.listeners, { type: "run", scope: "page" });

  const kataRuby = [...doc.querySelectorAll("ruby")].find(
    (r) => r.firstChild.nodeValue === "コーヒー"
  );
  assert(!!kataRuby, "katakana word is annotated in english mode");
  assert(
    kataRuby && kataRuby.querySelector("rt").textContent === "coffee",
    `gloss is the English word (got "${kataRuby && kataRuby.querySelector("rt").textContent}")`
  );
  assert(
    kataRuby && kataRuby.querySelector("rt").className === "fs-en",
    "gloss is marked with .fs-en so CSS can give it a latin face"
  );

  await send(stub.listeners, { type: "clear" });

  // Hán-Việt readings, fetched from data/hanviet.json.
  stub.changeListeners.forEach((fn) =>
    fn({ script: { newValue: "hanviet" }, katakanaMode: { newValue: "off" } }, "sync")
  );
  await send(stub.listeners, { type: "run", scope: "page" });

  const hvRuby = [...doc.querySelectorAll("ruby")].find(
    (r) => r.firstChild.nodeValue === "東京"
  );
  assert(!!hvRuby, "kanji word annotated in Hán-Việt mode");
  assert(
    hvRuby && hvRuby.querySelector("rt").textContent === "đông kinh",
    `東京 reads "đông kinh" (got "${hvRuby && hvRuby.querySelector("rt").textContent}")`
  );
  assert(
    hvRuby && hvRuby.querySelector("rt").className === "fs-hv",
    "Hán-Việt reading is marked with .fs-hv"
  );

  await send(stub.listeners, { type: "clear" });
  stub.changeListeners.forEach((fn) => fn({ script: { newValue: "hiragana" } }, "sync"));

  // Idempotency: running twice must not double-annotate.
  await send(stub.listeners, { type: "run", scope: "page" });
  const once = doc.querySelectorAll("ruby").length;
  await send(stub.listeners, { type: "run", scope: "page" });
  assert(doc.querySelectorAll("ruby").length === once, "re-running does not double-annotate");

  // Reloading the extension orphans this script: chrome.runtime.id goes away
  // and every chrome.* call throws. Nothing may escape as an unhandled
  // rejection, and the observer must stop.
  const unhandled = [];
  process.on("unhandledRejection", (e) => unhandled.push(e));

  stub.api.runtime.id = undefined;
  stub.api.runtime.sendMessage = () => {
    throw new Error("Extension context invalidated.");
  };
  await send(stub.listeners, { type: "clear" });
  const after = await send(stub.listeners, { type: "run", scope: "page" });
  // Give any stray promise a tick to reject.
  await new Promise((r) => setTimeout(r, 50));

  assert(
    doc.querySelectorAll("ruby").length === 0,
    "an orphaned script annotates nothing instead of throwing"
  );
  assert(
    after && after.annotated === 0,
    `orphaned run reports zero rather than rejecting (got ${JSON.stringify(after)})`
  );
  assert(unhandled.length === 0, `no unhandled rejection (got ${unhandled.map(String)})`);
});

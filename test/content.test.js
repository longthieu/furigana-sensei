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
  <p id="linkword"><a href="https://example.com/">東京の記事</a></p>
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

  // Clicking an annotated word opens the reference panel.
  await send(stub.listeners, { type: "run", scope: "page" });
  const target = [...doc.querySelectorAll(".fs-wrap ruby")].find(
    (r) => r.firstChild.nodeValue === "勉強"
  );
  assert(!!target, "found the 勉強 ruby to click");
  target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // The panel fetches ~2.4 MB of reference data before it can render.
  for (let i = 0; i < 60 && !doc.querySelector(".fs-word"); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const panel = doc.querySelector(".fs-panel");
  assert(!!panel, "clicking an annotated word opens the panel");
  assert(
    panel && panel.querySelector(".fs-word").textContent === "勉強",
    "the panel is about the word that was clicked"
  );
  assert(
    panel && /study/.test(panel.querySelector(".fs-word-gloss").textContent),
    `the word gloss comes from JMdict (got "${panel && panel.querySelector(".fs-word-gloss").textContent}")`
  );
  assert(
    panel && panel.querySelectorAll(".fs-kanji").length === 2,
    "one block per kanji in the word"
  );
  // The chips start from KRADFILE, then KanjiVG's real structure replaces them.
  for (let i = 0; i < 60 && !panel.querySelector(".fs-part-img"); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const first = panel.querySelectorAll(".fs-kanji")[0];
  const chips = [...first.querySelectorAll(".fs-part")].map((c) => c.textContent);
  assert(
    chips.length === 2 && chips.some((c) => c.includes("power")) && chips.some((c) => c.includes("excuse")),
    `勉 breaks down as 免 + 力 per KanjiVG, not KRADFILE's four (got ${JSON.stringify(chips)})`
  );
  assert(
    [...first.querySelectorAll(".fs-part")].every((c) => c.querySelector("svg")),
    "each component chip carries a drawing of its own strokes"
  );

  // Hovering a chip lights that component up inside the character.
  const bigSvg = first.querySelector(".fs-glyph svg");
  const chip = first.querySelector(".fs-part");
  chip.dispatchEvent(new window.MouseEvent("mouseenter"));
  const hot = [...bigSvg.querySelectorAll("path.fs-hot")];
  assert(
    bigSvg.classList.contains("fs-focusing") && hot.length > 0 &&
      hot.length < bigSvg.querySelectorAll("path").length,
    `hovering a chip highlights only that component's strokes (${hot.length} of ${bigSvg.querySelectorAll("path").length})`
  );
  chip.dispatchEvent(new window.MouseEvent("mouseleave"));
  assert(
    bigSvg.querySelectorAll("path.fs-hot").length === 0,
    "leaving the chip clears the highlight"
  );

  // 漢 is written with 汁 in KRADFILE, standing for 氵 — it must not say "soup".
  const kanjiTable = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "components.json"), "utf8")
  );
  assert(
    Array.isArray(kanjiTable["汁"]) && kanjiTable["汁"][1] === "water",
    `the 汁 stand-in resolves to water (got ${JSON.stringify(kanjiTable["汁"])})`
  );

  // A plain click inside a link belongs to the page, not to us.
  doc.querySelector(".fs-panel").remove();
  const linked = doc.getElementById("linkword").querySelector("ruby");
  linked.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  assert(
    !doc.querySelector(".fs-panel"),
    "a plain click inside a link does not hijack navigation"
  );

  await send(stub.listeners, { type: "clear" });

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

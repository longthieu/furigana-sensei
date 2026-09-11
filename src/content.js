/* Furigana Sensei — content script.
   Walks the page for Japanese text, asks the offscreen tokenizer for readings,
   and rewrites the matching text nodes as <ruby> elements. */
(function () {
  "use strict";

  if (window.__furiganaSensei) return;
  window.__furiganaSensei = true;

  var KANJI = /[々一-鿿㐀-䶿豈-﫿]/;
  var KATAKANA_WORD = /^[ァ-ヺー]+$/;
  var JAPANESE = /[々぀-ヿ一-鿿㐀-䶿]/;

  var SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "CODE", "KBD", "SAMP", "VAR", "PRE", "SVG", "CANVAS", "IFRAME", "OBJECT",
    "EMBED", "VIDEO", "AUDIO", "RUBY", "RT", "RP", "MATH", "TITLE"
  ]);

  var MAX_CHARS_PER_BATCH = 12000;
  var MAX_NODES_PER_BATCH = 150;

  var settings = Object.assign({}, self.FSDefaults.DEFAULTS);
  var hanviet = null;          // kanji -> Hán-Việt, fetched on demand
  var hanvietLoading = null;
  var skipKanji = null;
  var running = false;
  var observer = null;
  var pending = new Set();
  var pendingTimer = null;
  var stopped = false;

  /* ------------------------------------------------------------ lifecycle --
     Reloading the extension orphans the content scripts already running in
     open tabs: every chrome.* call from one then throws "Extension context
     invalidated". Detect that and shut this instance down quietly instead of
     letting the MutationObserver keep firing into a dead port. */

  function noop() {}

  function alive() {
    if (stopped) return false;
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function shutDown() {
    if (stopped) return;
    stopped = true;
    stopObserver();
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    pending.clear();
    // The furigana already in the DOM is plain markup and stays valid; it is
    // removed by reloading the page, which is what re-injects the new script.
  }

  /* ---------------------------------------------------------------- utils */

  function isKanjiChar(ch) {
    return window.FSAlign.isKanji(ch);
  }

  function toHira(s) {
    return window.FSKana.kataToHira(s);
  }

  function alignFurigana(surface, readingKata) {
    return window.FSAlign.align(surface, readingKata, toHira);
  }

  /** 132 KB of data nobody needs unless they picked Hán-Việt, so fetch it late. */
  function loadHanviet() {
    if (hanviet) return Promise.resolve(hanviet);
    if (hanvietLoading) return hanvietLoading;
    var url;
    try {
      url = chrome.runtime.getURL("data/hanviet.json");
    } catch (e) {
      shutDown();
      return Promise.resolve(null);
    }
    hanvietLoading = fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (table) {
        hanviet = table;
        return table;
      })
      .catch(function (err) {
        console.warn("[Furigana Sensei] Hán-Việt table failed to load", err);
        hanvietLoading = null;
        return null;
      });
    return hanvietLoading;
  }

  /**
   * Hán-Việt is per character, not per word: 東京 -> "đông kinh".
   * Returns null if any character is missing (kokuji such as 峠 have no
   * Sino-Vietnamese reading at all), so the caller can fall back to kana.
   */
  function hanvietOf(text) {
    if (!hanviet) return null;
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (!isKanjiChar(ch)) continue;
      var r = hanviet[ch];
      if (!r) return null;
      out.push(r);
    }
    return out.length ? out.join(" ") : null;
  }

  /** Should this kanji run get a reading, given the "already known" filter? */
  function worthAnnotating(text) {
    if (!skipKanji) return true;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (isKanjiChar(ch) && !skipKanji.has(ch)) return true;
    }
    return false;
  }

  function rubyEl(base, reading, kind) {
    var ruby = document.createElement("ruby");
    ruby.appendChild(document.createTextNode(base));
    var rt = document.createElement("rt");

    if (kind === "en" || kind === "hv") {
      rt.className = kind === "en" ? "fs-en" : "fs-hv";
      rt.textContent = reading;
    } else {
      rt.textContent = window.FSKana.convert(
        window.FSKana.hiraToKata(reading),
        settings.script
      );
    }
    ruby.appendChild(rt);
    return ruby;
  }

  /** Build the replacement fragment for one tokenized text node. */
  function buildFragment(tokens) {
    var frag = document.createDocumentFragment();
    var annotated = 0;

    tokens.forEach(function (tk) {
      var surface = tk[0];
      var reading = tk[1];

      var isKata = KATAKANA_WORD.test(surface);
      var hasKanji = KANJI.test(surface);
      var kataMode = settings.katakanaMode;

      if (!reading || (!hasKanji && !(isKata && kataMode !== "off"))) {
        frag.appendChild(document.createTextNode(surface));
        return;
      }

      if (isKata && !hasKanji) {
        if (kataMode === "english") {
          // Only gloss words the dictionary actually knows. Falling back to a
          // kana reading here would just spell the katakana back at the reader.
          var english = window.FSLoan.lookup(surface);
          if (english) {
            frag.appendChild(rubyEl(surface, english, "en"));
            annotated++;
          } else {
            frag.appendChild(document.createTextNode(surface));
          }
          return;
        }
        // kana mode: skip when the reading would be identical to the word.
        if (window.FSKana.convert(reading, settings.script) === surface ||
            settings.script === "hanviet") {
          frag.appendChild(document.createTextNode(surface));
          return;
        }
        frag.appendChild(rubyEl(surface, toHira(reading)));
        annotated++;
        return;
      }

      var parts = alignFurigana(surface, reading);
      if (!parts) parts = [{ t: surface, r: toHira(reading) }];

      parts.forEach(function (p) {
        if (!p.r || !worthAnnotating(p.t)) {
          frag.appendChild(document.createTextNode(p.t));
          return;
        }
        if (settings.script === "hanviet") {
          var hv = hanvietOf(p.t);
          // No Hán-Việt for this character: show the kana reading rather than
          // silently dropping the annotation.
          frag.appendChild(hv ? rubyEl(p.t, hv, "hv") : rubyEl(p.t, p.r, "kana"));
        } else {
          frag.appendChild(rubyEl(p.t, p.r));
        }
        annotated++;
      });
    });

    return annotated ? frag : null;
  }

  /* ----------------------------------------------------------- collecting */

  function nodeIsEligible(node) {
    var text = node.nodeValue;
    if (!text || text.length > 5000) return false;
    if (!KANJI.test(text) && !(settings.katakanaMode !== "off" && JAPANESE.test(text))) return false;

    var el = node.parentElement;
    var langSettled = false;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return false;
      if (el.isContentEditable) return false;
      var ce = el.getAttribute && el.getAttribute("contenteditable");
      if (ce === "" || ce === "true") return false;
      if (el.classList && el.classList.contains("fs-wrap")) return false;
      if (el.getAttribute && el.getAttribute("translate") === "no") return false;

      // Chinese is written in the same characters, so a Japanese tokenizer will
      // happily give 我在北京 a Japanese reading. Only the NEAREST lang counts:
      // a ja block inside a zh page is still Japanese.
      if (!langSettled) {
        var lang = el.getAttribute && el.getAttribute("lang");
        if (lang) {
          langSettled = true;
          if (/^zh\b/i.test(lang)) return false;
        }
      }

      el = el.parentElement;
    }
    return true;
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return nodeIsEligible(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function collectFromSelection() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return [];
    var range = sel.getRangeAt(0);
    var container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      return nodeIsEligible(container) ? [container] : [];
    }
    return collectTextNodes(container).filter(function (node) {
      return range.intersectsNode(node);
    });
  }

  /* -------------------------------------------------------------- running */

  function tokenizeChunks(chunks) {
    return new Promise(function (resolve) {
      if (!alive()) {
        shutDown();
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "tokenize", chunks: chunks }, function (res) {
          if (chrome.runtime.lastError || !res || res.error) {
            console.warn(
              "[Furigana Sensei]",
              (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
                (res && res.error)
            );
            resolve(null);
            return;
          }
          resolve(res.results);
        });
      } catch (e) {
        shutDown(); // context went away between the check and the call
        resolve(null);
      }
    });
  }

  function applyToNodes(nodes, results) {
    var count = 0;
    // One pause for the whole batch: our own rewrites must not feed back into
    // the MutationObserver.
    withObserverPaused(function () {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var tokens = results[i];
        if (!node.parentNode || !tokens) continue;

        var frag = buildFragment(tokens);
        if (!frag) continue;

        var wrap = document.createElement("span");
        wrap.className = "fs-wrap";
        wrap.setAttribute("data-fs-orig", node.nodeValue);
        wrap.appendChild(frag);
        node.parentNode.replaceChild(wrap, node);
        count++;
      }
    });
    return count;
  }

  async function annotate(nodes) {
    if (!nodes.length || !alive()) return 0;
    var total = 0;

    for (var start = 0; start < nodes.length; ) {
      var batch = [];
      var chars = 0;
      while (
        start < nodes.length &&
        batch.length < MAX_NODES_PER_BATCH &&
        chars < MAX_CHARS_PER_BATCH
      ) {
        batch.push(nodes[start]);
        chars += nodes[start].nodeValue.length;
        start++;
      }

      var results = await tokenizeChunks(
        batch.map(function (n) {
          return n.nodeValue;
        })
      );
      if (!results) return total;
      total += applyToNodes(batch, results);
      await new Promise(function (r) {
        requestAnimationFrame(r);
      });
    }
    return total;
  }

  async function run(scope) {
    if (running || !alive()) return 0;
    running = true;
    var toast = showToast(scope === "selection" ? "Reading selection…" : "Reading page…");
    try {
      if (settings.script === "hanviet") await loadHanviet();
      var nodes = scope === "selection" ? collectFromSelection() : collectTextNodes(document.body);
      var n = await annotate(nodes);
      reportCount();
      hideToast(toast, n ? "Furigana added \u00b7 " + n + " lines" : "No Japanese text here");
      if (n && settings.autoRun) startObserver();
      return n;
    } finally {
      running = false;
    }
  }

  function clear() {
    withObserverPaused(function () {
      document.querySelectorAll(".fs-wrap").forEach(function (wrap) {
        var original = wrap.getAttribute("data-fs-orig");
        wrap.replaceWith(document.createTextNode(original == null ? wrap.textContent : original));
      });
    });
    reportCount();
  }

  function annotatedCount() {
    return document.querySelectorAll(".fs-wrap").length;
  }

  /** Let the service worker badge this tab with what is on it. */
  function reportCount() {
    if (!alive()) return;
    try {
      chrome.runtime.sendMessage({ type: "annotated", count: annotatedCount() }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {
      shutDown();
    }
  }

  /* -------------------------------------------------- dynamic page updates */

  function withObserverPaused(fn) {
    if (observer) observer.disconnect();
    try {
      fn();
    } finally {
      if (observer) observeNow();
    }
  }

  function observeNow() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function (records) {
      if (!alive()) {
        shutDown();
        return;
      }
      records.forEach(function (rec) {
        rec.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE && nodeIsEligible(node)) pending.add(node);
          else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains("fs-wrap")) {
            collectTextNodes(node).forEach(function (t) {
              pending.add(t);
            });
          }
        });
      });
      if (pending.size && !pendingTimer) {
        pendingTimer = setTimeout(flushPending, 400);
      }
    });
    observeNow();
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  async function flushPending() {
    pendingTimer = null;
    if (!alive()) return;
    var nodes = Array.from(pending).filter(function (n) {
      return n.isConnected;
    });
    pending.clear();
    if (nodes.length) await annotate(nodes);
  }

  /* --------------------------------------------------------------- styles */

  function applyStyleVars() {
    var root = document.documentElement;
    root.style.setProperty("--fs-size", settings.size + "%");
    root.style.setProperty("--fs-opacity", String(settings.opacity / 100));
    root.style.setProperty("--fs-line-height", String(settings.lineHeight));
    if (settings.color) root.style.setProperty("--fs-color", settings.color);
    else root.style.removeProperty("--fs-color");
    root.classList.toggle("fs-hover-only", !!settings.hoverOnly);
  }

  /* ---------------------------------------------------------------- toast */

  function showToast(text) {
    var el = document.createElement("div");
    el.className = "fs-toast";
    el.setAttribute("role", "status");

    var dot = document.createElement("span");
    dot.className = "fs-toast-dot";
    var label = document.createElement("span");
    label.className = "fs-toast-text";
    label.textContent = text;

    el.append(dot, label);
    (document.body || document.documentElement).appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add("fs-show");
    });
    return el;
  }

  function hideToast(el, finalText) {
    if (!el) return;
    if (finalText) el.querySelector(".fs-toast-text").textContent = finalText;
    el.classList.add("fs-done"); // spinner becomes a tick
    setTimeout(function () {
      el.classList.remove("fs-show");
      setTimeout(function () {
        el.remove();
      }, 250);
    }, 1100);
  }

  /* -------------------------------------------------------------- wiring  */

  function blocked() {
    return (settings.blocklist || []).indexOf(location.hostname) !== -1;
  }

  function loadSettings() {
    return new Promise(function (resolve) {
      if (!alive()) {
        resolve(settings);
        return;
      }
      chrome.storage.sync.get(null, function (stored) {
        if (chrome.runtime.lastError) {
          resolve(settings);
          return;
        }
        settings = Object.assign({}, self.FSDefaults.DEFAULTS, stored || {});
        skipKanji = self.FSDefaults.skipSet(settings.skipLevel);
        applyStyleVars();
        resolve(settings);
      });
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync" || !alive()) return;
    var needsRebuild = false;
    Object.keys(changes).forEach(function (key) {
      settings[key] = changes[key].newValue;
      if (key === "script" || key === "skipLevel" || key === "katakanaMode") needsRebuild = true;
    });
    skipKanji = self.FSDefaults.skipSet(settings.skipLevel);
    applyStyleVars();

    if (!settings.enabled || blocked()) {
      stopObserver();
      clear();
      return;
    }
    if (needsRebuild && annotatedCount()) {
      clear();
      run("page").catch(function () { /* page went away mid-run */ });
    }
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    switch (msg.type) {
      case "status":
        sendResponse({
          host: location.hostname,
          annotated: annotatedCount(),
          running: running
        });
        return;
      case "run":
        run(msg.scope || "page").then(
          function (n) { sendResponse({ annotated: n }); },
          function () { sendResponse({ annotated: 0 }); }
        );
        return true;
      case "clear":
        clear();
        stopObserver();
        sendResponse({ ok: true });
        return;
      case "toggle":
        if (annotatedCount()) {
          clear();
          stopObserver();
        } else {
          run("page").catch(noop);
        }
        return;
    }
  });

  // Auto-run
  loadSettings().then(function () {
    if (!settings.enabled || !settings.autoRun || blocked() || !alive()) return;
    // Cheap sniff first: textContent avoids the reflow that innerText forces.
    var sample = document.body ? (document.body.textContent || "").slice(0, 6000) : "";
    if (!JAPANESE.test(sample)) return;
    try {
      chrome.runtime.sendMessage({ type: "warmup" }, function () {
        void chrome.runtime.lastError;
        run("page").catch(noop);
      });
    } catch (e) {
      shutDown();
    }
  }, noop);
})();

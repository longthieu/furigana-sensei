/* Lines a word's reading up with the kanji inside it, so okurigana stays bare.
   食べる + タベル -> [{t:"食", r:"た"}, {t:"べる"}]                        */
(function (root) {
  "use strict";

  var KANJI = /[々一-鿿㐀-䶿豈-﫿]/;

  function isKanji(ch) {
    return KANJI.test(ch);
  }

  /** Split a surface form into alternating kanji / kana runs. */
  function runsOf(surface) {
    var runs = [];
    var cur = null;
    for (var i = 0; i < surface.length; i++) {
      var ch = surface[i];
      // ヶ / ヵ behave like kanji here (一ヶ月 -> いっかげつ).
      var k = isKanji(ch) || ch === "ヶ" || ch === "ヵ";
      if (!cur || cur.kanji !== k) {
        cur = { kanji: k, text: "" };
        runs.push(cur);
      }
      cur.text += ch;
    }
    return runs;
  }

  /**
   * @returns {Array<{t:string, r?:string}>|null} null when the reading cannot
   *   be matched against the surface form; the caller then falls back to
   *   putting the whole reading over the whole word.
   */
  function align(surface, readingKata, kataToHira) {
    var reading = kataToHira(readingKata || "");
    if (!reading) return null;

    var runs = runsOf(surface);
    var out = [];
    var pos = 0;

    for (var i = 0; i < runs.length; i++) {
      var run = runs[i];

      if (!run.kanji) {
        var kana = kataToHira(run.text);
        if (reading.substr(pos, kana.length) !== kana) return null;
        out.push({ t: run.text });
        pos += kana.length;
        continue;
      }

      var next = runs[i + 1];
      if (!next) {
        var tail = reading.slice(pos);
        if (!tail) return null;
        out.push({ t: run.text, r: tail });
        pos = reading.length;
        continue;
      }

      // The following kana run marks where this kanji run's reading ends.
      // Each kanji needs at least one mora, so start the search accordingly.
      var needle = kataToHira(next.text);
      var at = reading.indexOf(needle, pos + run.text.length);
      if (at === -1 || at <= pos) return null;
      out.push({ t: run.text, r: reading.slice(pos, at) });
      pos = at;
    }

    if (pos !== reading.length) return null;
    return out;
  }

  root.FSAlign = { isKanji: isKanji, runsOf: runsOf, align: align };
})(typeof window !== "undefined" ? window : self);

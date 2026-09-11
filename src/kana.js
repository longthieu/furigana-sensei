/* Kana utilities: katakana -> hiragana -> romaji (modified Hepburn).
   Shared by the content script and the popup preview. */
(function (root) {
  "use strict";

  function kataToHira(str) {
    return str.replace(/[ァ-ヶ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  function hiraToKata(str) {
    return str.replace(/[ぁ-ゖ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0x60);
    });
  }

  // Digraphs first, then single kana. Keys are hiragana.
  var ROMA = {
    きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho",
    ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
    ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
    りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
    じゃ: "ja", じゅ: "ju", じょ: "jo", ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
    びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
    ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo", ふゅ: "fyu",
    うぃ: "wi", うぇ: "we", うぉ: "wo", ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
    てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du", ちぇ: "che", しぇ: "she", じぇ: "je",
    あ: "a", い: "i", う: "u", え: "e", お: "o",
    か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
    た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
    は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
    ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
    や: "ya", ゆ: "yu", よ: "yo",
    ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
    わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
    ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
    ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
    ゔ: "vu",
    ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
    ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa"
  };

  var VOWELS = "aiueo";
  var MACRON = { a: "ā", i: "ī", u: "ū", e: "ē", o: "ō" };

  function toRomaji(input, useMacron) {
    var s = kataToHira(String(input || ""));
    var out = "";
    var i = 0;
    while (i < s.length) {
      var two = s.substr(i, 2);
      var one = s.charAt(i);

      if (one === "っ") { // っ sokuon
        var nextTwo = s.substr(i + 1, 2);
        var nextRoma = ROMA[nextTwo] || ROMA[s.charAt(i + 1)];
        if (nextRoma) {
          out += nextRoma.charAt(0) === "c" ? "t" : nextRoma.charAt(0);
        }
        i += 1;
        continue;
      }

      if (one === "ー") { // ー long vowel mark
        var last = out.charAt(out.length - 1);
        if (VOWELS.indexOf(last) !== -1) {
          out = useMacron ? out.slice(0, -1) + MACRON[last] : out + last;
        }
        i += 1;
        continue;
      }

      if (ROMA[two]) {
        out += ROMA[two];
        i += 2;
        continue;
      }

      if (ROMA[one]) {
        var r = ROMA[one];
        if (r === "n") {
          // n' before a vowel or y, so んあ != な
          var peek = s.substr(i + 1, 2);
          var peekRoma = ROMA[peek] || ROMA[s.charAt(i + 1)] || "";
          var head = peekRoma.charAt(0);
          if (VOWELS.indexOf(head) !== -1 || head === "y") r = "n'";
        }
        out += r;
        i += 1;
        continue;
      }

      out += one; // punctuation, latin, digits
      i += 1;
    }
    return out;
  }

  root.FSKana = {
    kataToHira: kataToHira,
    hiraToKata: hiraToKata,
    toRomaji: toRomaji,
    // Convert a katakana reading from the tokenizer into the requested script.
    convert: function (katakanaReading, script) {
      if (!katakanaReading) return "";
      if (script === "katakana") return katakanaReading;
      if (script === "romaji") return toRomaji(katakanaReading, true);
      return kataToHira(katakanaReading);
    }
  };
})(typeof window !== "undefined" ? window : self);

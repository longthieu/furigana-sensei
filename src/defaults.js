/* Default settings + kanji grade sets, shared by popup and content script. */
(function (root) {
  "use strict";

  var DEFAULTS = {
    enabled: true,          // master switch
    autoRun: true,          // run automatically when a page loads
    script: "hiragana",     // hiragana | katakana | romaji
    skipLevel: "none",      // none | grade1 | grade2  (kanji considered "already known")
    size: 55,               // furigana size, % of base text
    color: "",              // "" = inherit page colour
    opacity: 100,           // 0-100
    hoverOnly: false,       // hide furigana until the word is hovered
    lookup: true,           // click an annotated word for the reference panel
    katakanaMode: "off",    // off | kana | english — what to do with katakana loanwords
    lineHeight: 2,          // line-height for annotated lines, so ruby cannot overlap
    blocklist: []           // hostnames where the extension stays off
  };

  // Kyōiku kanji, grade 1 (80 characters)
  var GRADE1 =
    "一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六";

  // Kyōiku kanji, grade 2 (160 characters)
  var GRADE2 =
    "引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話";

  function skipSet(level) {
    if (level === "grade1") return new Set(GRADE1);
    if (level === "grade2") return new Set(GRADE1 + GRADE2);
    return null;
  }

  root.FSDefaults = { DEFAULTS: DEFAULTS, GRADE1: GRADE1, GRADE2: GRADE2, skipSet: skipSet };
})(typeof window !== "undefined" ? window : self);

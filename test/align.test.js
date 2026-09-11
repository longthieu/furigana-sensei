/* Runs the real tokenizer over sample sentences and prints the ruby layout. */
const kuromoji = require("kuromoji");
global.window = global;
require("../src/kana.js");
require("../src/align.js");

const SENTENCES = [
  "東京の学校で日本語を勉強しています。",
  "彼は毎朝六時に起きて、新聞を読みます。",
  "お寿司を食べに行きませんか。",
  "今日は天気がよくて、気持ちがいい。",
  "子供たちが公園で遊んでいる。",
  "一ヶ月後に引っ越します。",
  "コーヒーを飲みながら本を読む。",
  "山田さんは大学で物理学を研究している。",
  "食べ物の話をしましょう。",
  "申し込みは明日締め切ります。"
];

kuromoji.builder({ dicPath: "node_modules/kuromoji/dict" }).build((err, tokenizer) => {
  if (err) throw err;
  let fallbacks = 0, aligned = 0;

  for (const s of SENTENCES) {
    const out = [];
    for (const t of tokenizer.tokenize(s)) {
      const surface = t.surface_form;
      const reading = t.reading || "";
      if (!reading || !/[々一-鿿]/.test(surface)) { out.push(surface); continue; }
      const parts = window.FSAlign.align(surface, reading, window.FSKana.kataToHira);
      if (!parts) {
        fallbacks++;
        out.push(`${surface}[${window.FSKana.kataToHira(reading)}]`);
        continue;
      }
      aligned++;
      out.push(parts.map((p) => (p.r ? `${p.t}[${p.r}]` : p.t)).join(""));
    }
    console.log(out.join(""));
  }
  console.log(`\naligned=${aligned} fallback=${fallbacks}`);
});

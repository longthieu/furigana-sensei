/* Katakana loanwords (外来語) -> the English word a learner is actually after.
 *
 * Where a word is wasei-eigo — coined in Japan, or borrowed from a language
 * other than English — the gloss is the MEANING, not the source spelling:
 * マンション is a condo, not a mansion; アルバイト (German "Arbeit") is a
 * part-time job; コンセント is a power outlet. Getting those right is the
 * whole point of showing this at all.
 */
(function (root) {
  "use strict";

  var WORDS = {
    // ---- food & drink
    "コーヒー": "coffee", "ケーキ": "cake", "パン": "bread", "ジュース": "juice",
    "ミルク": "milk", "チーズ": "cheese", "バター": "butter", "ヨーグルト": "yogurt",
    "アイスクリーム": "ice cream", "アイス": "ice cream", "クリーム": "cream",
    "チョコレート": "chocolate", "キャンディー": "candy", "クッキー": "cookie",
    "ビスケット": "biscuit", "サンドイッチ": "sandwich", "ハンバーガー": "hamburger",
    "ハンバーグ": "hamburg steak", "ピザ": "pizza", "パスタ": "pasta",
    "スパゲッティ": "spaghetti", "カレー": "curry", "サラダ": "salad", "スープ": "soup",
    "ステーキ": "steak", "ソーセージ": "sausage", "ベーコン": "bacon", "ハム": "ham",
    "トースト": "toast", "ジャム": "jam", "オムレツ": "omelette", "デザート": "dessert",
    "ビール": "beer", "ワイン": "wine", "ウイスキー": "whisky", "カクテル": "cocktail",
    "ソーダ": "soda", "コーラ": "cola", "レモン": "lemon", "オレンジ": "orange",
    "バナナ": "banana", "トマト": "tomato", "ポテト": "potato", "キャベツ": "cabbage",
    "レタス": "lettuce", "メロン": "melon", "パイナップル": "pineapple",
    "グレープフルーツ": "grapefruit", "メニュー": "menu", "レストラン": "restaurant",
    "カフェ": "cafe", "バー": "bar", "レシピ": "recipe", "オーブン": "oven",
    "トースター": "toaster", "フライパン": "frying pan", "ナイフ": "knife",
    "フォーク": "fork", "スプーン": "spoon", "コップ": "cup", "グラス": "glass",
    "カップ": "cup", "ボトル": "bottle", "ストロー": "straw", "ミックス": "mix",

    // ---- computing & devices
    "パソコン": "PC", "コンピューター": "computer",
    "ノートパソコン": "laptop", "スマートフォン": "smartphone", "スマホ": "smartphone",
    "タブレット": "tablet", "キーボード": "keyboard", "マウス": "mouse",
    "モニター": "monitor", "ディスプレイ": "display", "プリンター": "printer",
    "スキャナー": "scanner", "カメラ": "camera", "ビデオ": "video", "テレビ": "TV",
    "ラジオ": "radio", "インターネット": "internet", "ネット": "internet",
    "ウェブ": "web", "サイト": "site", "ホームページ": "website", "ブログ": "blog",
    "メール": "email", "アドレス": "address", "パスワード": "password",
    "アカウント": "account", "ログイン": "login", "ダウンロード": "download",
    "アップロード": "upload", "ファイル": "file", "フォルダ": "folder", "データ": "data",
    "ソフト": "software", "ソフトウェア": "software", "ハードウェア": "hardware",
    "アプリ": "app", "プログラム": "program", "システム": "system",
    "ネットワーク": "network", "サーバー": "server", "セキュリティ": "security",
    "ウイルス": "virus", "バックアップ": "backup", "クリック": "click",
    "スクロール": "scroll", "コピー": "copy", "デジタル": "digital",
    "オンライン": "online", "オフライン": "offline", "ワイヤレス": "wireless",
    "バッテリー": "battery", "ケーブル": "cable", "コンセント": "power outlet",
    "スイッチ": "switch", "ボタン": "button", "リモコン": "remote",
    "イヤホン": "earphones", "ヘッドホン": "headphones", "スピーカー": "speaker",
    "マイク": "microphone", "アニメ": "anime", "キャラクター": "character",

    // ---- home & everyday things
    "ソファ": "sofa", "ベッド": "bed", "カーテン": "curtain", "ドア": "door",
    "キッチン": "kitchen", "トイレ": "toilet", "シャワー": "shower",
    "バスルーム": "bathroom", "タオル": "towel", "シャンプー": "shampoo",
    "ティッシュ": "tissue", "プラスチック": "plastic", "ビニール": "plastic",
    "ガラス": "glass", "ガス": "gas", "エアコン": "air conditioner",
    "ストーブ": "heater", "ヒーター": "heater", "ライト": "light", "ランプ": "lamp",
    "ロッカー": "locker", "ポスト": "mailbox", "ベル": "bell", "カレンダー": "calendar",
    "ノート": "notebook", "ペン": "pen", "ボールペン": "ballpoint pen",
    "シャーペン": "mechanical pencil", "マーカー": "marker", "ホッチキス": "stapler",
    "テープ": "tape", "カード": "card", "チケット": "ticket", "レシート": "receipt",
    "メモ": "note", "サイン": "signature", "スタンプ": "stamp",
    "プレゼント": "gift", "リボン": "ribbon",

    // ---- clothing
    "シャツ": "shirt", "ワイシャツ": "dress shirt", "ズボン": "trousers",
    "パンツ": "underwear", "スカート": "skirt", "ドレス": "dress",
    "コート": "coat", "ジャケット": "jacket", "セーター": "sweater", "ジーンズ": "jeans",
    "スーツ": "suit", "ネクタイ": "necktie", "ベルト": "belt", "ソックス": "socks",
    "スニーカー": "sneakers", "ブーツ": "boots", "サンダル": "sandals",
    "ハンカチ": "handkerchief", "バッグ": "bag", "ポケット": "pocket", "サイズ": "size",
    "ファッション": "fashion", "ブランド": "brand", "アクセサリー": "accessory",
    "リング": "ring", "ネックレス": "necklace",

    // ---- getting around, places
    "バス": "bus", "タクシー": "taxi", "バイク": "motorcycle", "オートバイ": "motorcycle",
    "トラック": "truck", "トンネル": "tunnel", "ホーム": "platform",
    "エスカレーター": "escalator", "エレベーター": "elevator", "ホテル": "hotel",
    "ビル": "building", "アパート": "apartment", "マンション": "condo",
    "デパート": "department store", "スーパー": "supermarket",
    "コンビニ": "convenience store", "ショップ": "shop", "ストア": "store",
    "モール": "mall", "プール": "pool", "ジム": "gym", "センター": "centre",
    "オフィス": "office", "ロビー": "lobby", "カウンター": "counter",
    "レジ": "cash register", "エリア": "area", "コーナー": "corner",
    "スペース": "space", "ルート": "route", "マップ": "map", "ガイド": "guide",
    "ツアー": "tour", "チェックイン": "check-in",

    // ---- work & abstract nouns
    "サラリーマン": "office worker", "アルバイト": "part-time job",
    "パート": "part-time work", "スタッフ": "staff", "マネージャー": "manager",
    "リーダー": "leader", "チーム": "team", "グループ": "group",
    "プロジェクト": "project", "ミーティング": "meeting", "スケジュール": "schedule",
    "プラン": "plan", "アイデア": "idea", "テーマ": "theme",
    "ポイント": "point", "レベル": "level", "サービス": "service",
    "ビジネス": "business", "マーケット": "market", "コスト": "cost", "セール": "sale",
    "キャンペーン": "campaign", "イベント": "event", "パーティー": "party",
    "ニュース": "news", "レポート": "report", "グラフ": "graph", "テスト": "test",
    "チェック": "check", "ルール": "rule", "マナー": "manners", "チャンス": "chance",
    "リスク": "risk", "ストレス": "stress", "エネルギー": "energy", "パワー": "power",
    "スピード": "speed", "バランス": "balance", "スタイル": "style",
    "イメージ": "image", "メッセージ": "message",
    "コミュニケーション": "communication", "インタビュー": "interview",
    "アンケート": "questionnaire", "コメント": "comment", "アドバイス": "advice",
    "サポート": "support", "トラブル": "trouble", "ミス": "mistake",
    "クレーム": "complaint", "サンプル": "sample", "タイプ": "type",
    "パターン": "pattern", "プロ": "professional", "アマチュア": "amateur",
    "ベテラン": "veteran", "ファン": "fan", "メンバー": "member",
    "パートナー": "partner", "カップル": "couple", "ペア": "pair",

    // ---- sport, music, leisure
    "スポーツ": "sports", "サッカー": "soccer", "テニス": "tennis",
    "ゴルフ": "golf", "バスケットボール": "basketball", "バレーボール": "volleyball",
    "スキー": "skiing", "スケート": "skating", "ランニング": "running",
    "ジョギング": "jogging", "マラソン": "marathon", "トレーニング": "training",
    "コーチ": "coach", "ゲーム": "game", "スコア": "score", "ゴール": "goal",
    "ボール": "ball", "ラケット": "racket", "チャンピオン": "champion",
    "オリンピック": "Olympics", "ダンス": "dance", "ピアノ": "piano",
    "ギター": "guitar", "バイオリン": "violin", "ドラム": "drums",
    "コンサート": "concert", "カラオケ": "karaoke", "パズル": "puzzle",
    "クイズ": "quiz", "ドラマ": "TV drama", "ストーリー": "story",
    "シーン": "scene", "ページ": "page", "タイトル": "title",

    // ---- verbs-as-nouns, quantities, colours
    "スタート": "start", "ストップ": "stop", "オープン": "open", "キャンセル": "cancel",
    "オーダー": "order", "リクエスト": "request", "セット": "set", "リスト": "list",
    "ナンバー": "number", "パーセント": "percent", "キロ": "kilo",
    "メートル": "metre", "センチ": "centimetre", "グラム": "gram", "リットル": "litre",
    "ピンク": "pink", "グレー": "grey", "ブルー": "blue", "グリーン": "green",
    "ホワイト": "white", "ブラック": "black", "イエロー": "yellow"
  };

  /**
   * Katakana is written inconsistently in the wild — コンピュータ / コンピューター,
   * フォルダ / フォルダー — so try the word with and without its final 長音.
   */
  function lookup(word) {
    if (!word) return null;
    if (WORDS[word]) return WORDS[word];
    if (word.slice(-1) === "ー") {
      var trimmed = word.slice(0, -1);
      if (WORDS[trimmed]) return WORDS[trimmed];
    } else if (WORDS[word + "ー"]) {
      return WORDS[word + "ー"];
    }
    return null;
  }

  root.FSLoan = { WORDS: WORDS, lookup: lookup, size: Object.keys(WORDS).length };
})(typeof window !== "undefined" ? window : self);

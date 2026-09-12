# Chrome Web Store listing

Everything the submission form asks for. Assets live next to this file.

## Item details

**Name** (max 75)
```
Furigana Sensei
```

**Summary** (max 132 — this is `description` in manifest.json, keep the two in step)
```
Adds furigana above kanji on any Japanese web page — hiragana, katakana, romaji or Hán-Việt readings. For learners.
```

**Category:** Education · **Language:** English

**Detailed description**

```
Furigana Sensei prints the reading above the kanji on any Japanese page, so you can
read without stopping to look things up.

READINGS
• Hiragana, katakana, or romaji
• Hán-Việt (Sino-Vietnamese) readings — 東京 reads đông kinh — for Vietnamese learners
• Okurigana-aware: 食べる is annotated 食[た]べる, not 食べる[たべる]
• Katakana loanwords can show the English word instead: コンセント → power outlet

READ AT YOUR OWN LEVEL
• Skip the kanji you already know — grade 1 (80 characters) or grades 1–2 (240)
• Quiz mode hides the readings until you hover a word, with a dotted rule to show
  which words have one
• Size, fade, spacing and colour are all adjustable

LOOK ANYTHING UP
Click a word and a panel opens with its meaning, then each kanji drawn from its
strokes — not typeset, so you see the Japanese form even on a page with no Japanese
font. Hover for stroke numbers, click to watch it redraw stroke by stroke, and hover
a component to light that part up inside the character.

WORKS OFFLINE, SENDS NOTHING
The Japanese analyser and every dictionary ship inside the extension. It makes no
network requests at all and collects nothing.

Open source: https://github.com/longthieu/furigana-sensei

Dictionary data: KANJIDIC2, KRADFILE and JMdict © EDRDG, and KanjiVG © Ulrich Apel,
all under CC BY-SA and credited in the app.
```

## Screenshots (1280×800, upload in this order)

| File | Shows |
|---|---|
| `01-furigana.png` | Furigana on a news page, with English glosses on katakana |
| `02-hanviet.png` | The same page in Hán-Việt |
| `03-panel.png` | The reference panel, 氵 highlighted inside 漢 |
| `04-popup.png` | The popup |

Promo tile: `promo-440x280.png`.

## Privacy tab

**Single purpose**
```
Helping a reader understand Japanese text on the page they are on, by showing the
reading above each kanji and offering a dictionary entry for a word on request.
```

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `storage` | Stores the user's own settings — which reading script to show, appearance, and the list of sites they have switched the extension off on. Nothing else is stored, and nothing leaves the browser. |
| `offscreen` | The Japanese morphological analyser needs a DOM to load its 17 MB dictionary, which a service worker cannot provide. One offscreen document holds a single tokenizer so the dictionary is parsed once per session instead of once per tab. |
| `contextMenus` | Adds "Add furigana to selection", "Add furigana to whole page" and "Remove furigana" to the right-click menu. |
| `activeTab` | The extension requests no host access at install. When the user clicks the toolbar icon, presses the shortcut, or uses the context menu, activeTab grants access to that one tab so the furigana code can be injected there. |
| `scripting` | Injects the content script into the tab the user just asked about, and — only for origins the user has explicitly granted — registers it to run automatically. |
| `<all_urls>` as an **optional** host permission | Not requested at install. It is requested at runtime, through Chrome's own prompt, only when the user turns on "Run automatically on Japanese pages", because Japanese text can appear on any site and automatic furigana cannot be scoped in advance. Turning the option off revokes it. The access is used solely to read page text in order to place readings above it; nothing is transmitted anywhere, and individual sites can still be excluded in the popup's Sites tab. |

**Privacy policy URL** (a required field — the store demands one from anything that handles
user data at all, even data that never leaves the device)
```
https://github.com/longthieu/furigana-sensei/blob/main/PRIVACY.md
```

**Remote code:** No — everything, including the dictionaries, is packaged in the extension.

**Data collection:** none of the categories apply. The extension makes no network requests.

## What is left to a human

Publishing cannot be automated from here — it needs a developer account, a payment and
a Google sign-in:

1. Register at https://chrome.google.com/webstore/devconsole (one-off **$5 USD** fee).
2. **New item → upload** `dist/furigana-sensei.zip` (17 MB — under the 2 GB cap).
3. Paste the fields above; upload the screenshots and the promo tile.
4. Fill the Privacy tab with the justifications and the privacy policy URL above.
5. Submit.

Broad host permissions are the main thing that slows review down, so the extension does
not request any at install: `<all_urls>` is declared under `optional_host_permissions` and
asked for at runtime only if the user turns on automatic furigana.

Publishing later versions can be automated with the Web Store API, but it needs OAuth
credentials tied to that account, so set it up after step 1 if you want it.

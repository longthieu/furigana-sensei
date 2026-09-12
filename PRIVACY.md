# Privacy Policy — Furigana Sensei

**Effective 12 September 2026.** Applies to the Furigana Sensei Chrome extension.

## The short version

Furigana Sensei makes no network requests. There is no server, no account, no analytics,
no tracking, and no third party of any kind. Nothing you read and nothing you configure
ever leaves your browser by way of this extension.

## What the extension handles

### The text of pages you visit

To place a reading above a kanji, the extension has to read the text of the page you are
on. That text is read **in your browser's memory only**, for as long as it takes to work
out the readings, and is then discarded. It is never stored, logged, copied elsewhere, or
transmitted.

The analysis itself is local: the Japanese dictionary that works out the readings, and the
kanji, word and stroke dictionaries behind the lookup panel, are all files packaged inside
the extension. Looking a word up does not contact anything.

The extension skips password fields, text you are editing, and any part of a page marked
as not translatable.

### Your settings

The extension stores the choices you make in the popup, using Chrome's `storage.sync`:

| Stored | What it is |
|---|---|
| `enabled`, `autoRun`, `lookup`, `hoverOnly` | on/off switches |
| `script`, `skipLevel`, `katakanaMode` | which reading style you picked |
| `size`, `color`, `opacity`, `lineHeight` | appearance |
| `blocklist` | hostnames of sites where you turned the extension off |

That is the complete list. `blocklist` holds site names you chose yourself in the *Sites*
tab — it is not a browsing history, and the extension records nothing about pages you
visit beyond the ones you deliberately switch it off on.

**One thing worth knowing:** `storage.sync` is Chrome's own sync mechanism. If you have
Chrome Sync switched on, *Chrome* copies these settings to your Google Account so they
follow you between computers, exactly as it does for your bookmarks. That transfer is
performed by Chrome under Google's privacy policy, not by this extension, and this
extension has no access to your Google Account. If you would rather it did not happen,
turn off extension syncing in Chrome's own sync settings.

## What the extension does not do

- It does not make network requests. Not for dictionaries, not for updates, not for
  telemetry. You can confirm this in the source — every `fetch` in the code loads a file
  from inside the extension package.
- It does not collect, transmit, sell, or share any data with anyone.
- It does not use analytics, crash reporting, advertising, or fingerprinting.
- It does not read or store passwords, form contents, cookies, or browsing history.
- It does not execute remote code. Everything runs from the reviewed package.

## Why it asks for the permissions it does

The extension asks for **no access to any website when you install it**.

| Permission | Why |
|---|---|
| `activeTab` | When you click the toolbar icon, press <kbd>Alt</kbd>+<kbd>F</kbd>, or use the right-click menu, Chrome grants temporary access to that one tab so the extension can add furigana there. It goes away again by itself. |
| `scripting` | Puts the furigana code into the tab you just asked about. |
| `storage` | Saves the settings listed above. |
| `contextMenus` | Adds the right-click entries for adding and removing furigana. |
| `offscreen` | Runs the Japanese analyser in a hidden page, because its dictionary cannot be loaded in a service worker. |
| Access to all sites — **optional** | Only if you switch on *Run automatically on Japanese pages*. Chrome asks you first, and you can withdraw it at any time by switching that option back off. Without it the extension still works; you just ask for furigana per page instead of getting it automatically. |

Even once granted, that access is used for one thing: reading the text of a page in order to
place readings above it. Any site can still be excluded in the *Sites* tab.

## Keeping or removing your data

Your settings live in your browser. **Reset all** in the popup clears them, and uninstalling
the extension removes them. There is nothing held anywhere else for anyone to delete.

## Children

The extension is a reading aid. It collects nothing from anyone, of any age.

## Changes

If the extension ever starts handling data differently, this policy will be updated before
that version ships, and the change will be visible in the repository's history.

## Contact

Open an issue at https://github.com/longthieu/furigana-sensei/issues

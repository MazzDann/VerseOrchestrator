# VerseOrchestrator — roadmap & ideas

Single place for what's done and what's next. Checklist style; kept in sync as we go.

## Done

### Core pipeline

- [x] `builder`: MyBible `*.SQLite3` → merged `data/library.db` (own clean schema)
- [x] Cyrillic/diacritic-insensitive search via precomputed normalized column + FTS5
- [x] Builder runs as a separate process; server picks up rebuilds with no restart
- [x] Strong numbers + morphology (`<S>`, `<m>`) stripped from display; original kept in `text_raw`
- [x] `server`: Express + better-sqlite3 REST API
- [x] Modules live in project `modules/` folder (auto-detected; `old/` is reference-only)

### Navigation & search

- [x] Translations → books (virtualized, filterable) → chapters (chip strip) → verses
- [x] Multiple translations in parallel
- [x] **Translation checklist picker** — grouped-by-language checkbox list (inline in the navbar, with its own filter; not a Popover — overlays are unreliable here), replacing the header MultiSelect. First checked id is the primary; max 5. _(First slice of the Selection UX rework below.)_
- [x] Inline search panel: text + references (`Ів 3:16`, `Jn 3:16-18`, `бут 2 3`, `бут 2 3-5`, `бут 2`)
- [x] Search scope toggle: current module (F3 / Ctrl+F) vs all (F4)
- [x] History (auto-recorded, deletable: clear-all + per-item, abbreviated names) + bookmarks (export/import JSON), in the left sidebar
- [x] Responsive layout — navbar/aside collapse on narrow windows with Burger toggles (no more vanishing navigation)
- [x] Hotkeys: arrows (verse step), `b` blank, `Esc` clear, **F5/F2 push to screen**
- [x] **Wireless clicker / presenter remote** — `PageDown`/`PageUp` step the verse (with live-follow on, they advance the live screen); USB presenters emit exactly these keys
- [x] **Live-follow toggle** — a header switch (LIVE / F5): when on, the presenter follows the selection live; when off, navigation only updates the preview and you push with F5/F2. Persisted (`liveFollow`).
- [x] **Selection persists across reloads** — `useStore` wrapped in `persist` (`vo:selection`; translation/book/chapter/verses, not `live`)
- [x] **Scroll-to-verse on jump** — search/history/concordance navigation centres the target verse in the list (`data-verse` + a deferred instant `scrollIntoView`; smooth is ignored by Radix ScrollArea, and clearing the target synchronously cancels the pending scroll — both learned the hard way)

### Study & dictionaries

- [x] Dictionary import (`*.dictionary.SQLite3`) into `library.db` — Strong's and explanatory
- [x] **Strong's dictionary**: clickable Strong numbers on has-Strong modules (parsed from `text_raw`) → definition lookup (aside "Стронг" tab). Verified with a real Strong's dictionary (14k Hebrew+Greek entries); OT→Hebrew, NT→Greek; HTML entities decoded; definitions formatted (lemma/pronunciation on their own line via `cleanDefinition`).
- [x] **Interlinear study + word lookup**: every word in the "Стронг" tab is clickable → highlights it and shows its Strong entry and any explanatory-dictionary entry (`/api/dict?q=`) below. Makes explanatory dictionaries (e.g. CathEn) usable.
- [x] **Strong dictionary H/G disambiguation** — the builder now stores `dictionary_entries.strong_lang` ('H'/'G' from the topic prefix, e.g. `H3068`/`G3068`); `lookupStrong` ranks by it against the verse's testament (OT < 470 → Hebrew first, NT → Greek), so an OT #3068 shows יהוה (YHWH) first instead of the Greek λούω. Both entries are still returned, just ordered.
- [x] **Strong's concordance** ("where else is this word used") — builder writes a `verse_strongs(translation_id, verse_id, strong)` index from `text_raw`; `/api/strong/:num/refs` (`total`/`truncated`) lists occurrences. A Strong entry opens a **concordance panel beside the verse list** (`ConcordancePanel`) with a this-translation / all-Strong-translations scope toggle; clicking a row jumps to that verse (and centres it). `G####`/`H####` cross-refs inside definitions are clickable to follow the chain.
- [x] **Cross-references + commentaries** — builder imports `*.crossreferences.SQLite3` → `cross_references` and `*.commentaries.SQLite3` → `commentaries` (HTML cleaned at import; one `source` per module). `/api/crossrefs` + `/api/commentary` (verse-keyed). New **«Контекст»** study tab (`StudyContext`): clickable cross-reference chips (resolved to the primary translation's book names → jump) + commentary notes for the selected verse.

### Appearance & presenter

- [x] Presenter window synced via BroadcastChannel (abstracted in `presenterBus`)
- [x] Appearance settings (persisted): font, text colour, background colour, background image, alignment, verse numbers
- [x] **Configurable slide edge padding** — per-side `padTop/Right/Bottom/Left` with a **px/% unit toggle** and a **link mode** (all sides / vertical+horizontal pairs / independent); a four-input "square" in settings. Applied in `SlideCanvas` as a **proportional inset** (an absolutely-positioned content box: top/bottom = % of height, left/right = % of width; px is scaled to a 1080p reference) so the **preview matches the full-screen presenter** exactly. _(This is an interim layout — superseded by the template engine below.)_
- [x] **Project a Strong citation** — from the Strong tab, "На екран зі Стронгом" sends the Strong-bearing (primary) translation's verse with a "word · Стронг N — gloss" `subline` (rendered under a divider above the reference in `SlideCanvas`); contextual — normal navigation reverts it. The gloss is the lemma line or the **full definition**, per the "Текст Стронга" appearance setting.
- [x] **Styled slide segments** — `SlideLine.segments` (`{text, jesus?, hot?}`). **Words of Jesus** (`<J>…</J>`, shared `parseRedLetter`) are coloured in the reading list AND on the slide (`redLetter` toggle + `jesusColor`); projecting a Strong word (`parseStrongTokens`) **highlights it in place** on the slide (`highlightColor`, bold). `web` now imports `@vo/shared` (works via the workspace symlink + Bundler resolution).
- [x] **Fullscreen presenter** — the presenter window goes fullscreen on click or "F" (browsers can't auto-fullscreen `window.open` without a gesture); a hint fades out.
- [x] **Free-text slide composer («Текст»)** — a header «Текст» panel (title + body + a recents list) projects an announcement / prayer / welcome slide via the existing `projectText` (reuses the active style/template). Recents persisted in `settingsStore` (`recentTexts`). Ctrl+Enter projects.
- [x] **Two-level blank + force-black** — «Затемнити» keeps the background image/colour and hides only the text (`blank`); a new «Чорний екран» (`.` key, `Slide.forceBlack`) paints pure black ignoring the background. Matches VisioBible F12-vs-blank and ShowBible's text-only-vs-whole-window blanking.
- [x] Presenter applies the appearance; auto-fit text (binary search, refits on slide change/resize); fade transitions; vignette
- [x] **WYSIWYG preview** — the aside preview renders via the same `SlideCanvas` as the presenter (identical background/font/colour/alignment), with a pin toggle to dock it at the bottom of the aside (visible while in any mode)
- [x] **Panel placement switch** (Settings → Розташування панелей): the study panels (preview / Strong / appearance) live either in the right aside or docked at the bottom of the centre column (`StudyPanels` component, `panelPlacement` persisted)
- [x] Theme: Inter (UI) + Lora (scripture) + indigo accent

### Tooling

- [x] ESLint (+ jsx-a11y) + Prettier; Vitest (normalization + reference parsing)
- [x] Production build verified (`tsc -b && vite build`); dev deps excluded from bundle
- [x] Playwright MCP wired (`.mcp.json`) for browser screenshots — note: Playwright's chromium binary isn't installed in this environment (install needs admin), so the **reliable** path here is the **Claude_Preview** MCP (`preview_start('web')` + `preview_eval`/`screenshot`)
- [x] **In-app library rebuild** — `POST /api/rebuild` re-runs the builder process (guards overlapping runs via a `rebuilding` flag → 409; builder output goes to the server console) and `closeDb()`s on success so the read connection picks up the freshly-built DB without a restart; a «Пересканувати модулі» button in the settings panel triggers it and invalidates the React-Query caches.

## Next / backlog

### Features

- [x] **Slide template/scheme engine v1** (the VisioBible model) — a slide can carry a `SlideTemplate`: positioned **objects** (`quote` / `reference` / `subline` / `divider`) with proportional geometry (x/y/w/h in %), alignment, per-object font size (cqh), visibility; rendered in `SlideCanvas` (cqh + `container-type:size` so preview ≡ presenter). **Additive** — no template → the default centred layout (zero regression). 4 presets (Класичний/none, По центру з рискою, Нижня третина, Мінімал) + a per-object editor (`TemplateEditor`, in the Вигляд tab); active template persisted (`slideTemplate`). Red-letter/hot segments preserved inside the `quote` object.
- [ ] **Template engine — v2** — visual drag/resize editor; named/saveable template library (currently one active template); per-object colour + background-image objects; import/export VisioBible `.sch`; fold padding/appearance fully into the template.
- [ ] **Subheadings** — module subheadings live in separate `*.subheadings.SQLite3` companions (builder currently SKIPs them; main verse text has no `<h>` tags). Import into a `subheadings` table and render between verses in the reading list and (optionally) on slides.
- [x] **Songs / hymns ("Псалми") — v1 (text projection)** — the builder reads the hymn `.pptx` collection (`old/ПС укр 1-477/`, `SONGS_DIR` overridable) with `fflate`: per slide, walk `<a:t>` runs + `<a:br>` for line breaks (`builder/src/songs.ts`); number+title from the filename → `songs` + `song_slides` tables (479 indexed). `/api/songs?q=` (number or diacritic-insensitive title) + `/api/songs/:id`. A header **«Пісні»** button opens `SongsPanel` (search → hymn → stanzas); clicking a stanza projects it as a **text slide** (`projectText`, reusing the style/template; `SlideCanvas` uses `white-space: pre-line` so stanza line breaks survive).
- [x] **Songs — faithful pptx render** — the builder also extracts each slide's **style** (`songs.ts`: resolve the theme colour scheme + `clrMap`, the master background, and the first text shape's box geometry `EMU→%`, font `+mj-lt/+mn-lt→theme`, size, bold, align) → `song_slides.render` (JSON). A **«Точний показ / Простий текст»** toggle in `SongsPanel` (faithful by default): faithful builds a one-object `SlideTemplate` (positioned quote box) + a `SlideStyle` override (bg/colour/font/`bold`) so the projected slide reproduces the original pptx look (these hymns: white bold centred text on black). `SlideStyle.bold` added. Works for text-pptx; image/complex slides would need a real renderer.
- [ ] **Songs — v2** — advance stanzas with arrows / a service playlist; pixel-perfect "play the .pptx as-is" (images via LibreOffice — not installed — or a browser pptx renderer) for image-heavy decks; the user's own songs via `songs/` + a folder picker.
- [x] **Selection UX rework** — all four shipped: persist on reload (`useStore` → `vo:selection`, `live` excluded); grouped-by-language **checklist** picker (`TranslationPicker`); a header **"go to reference" jump bar** (type `Ів 3:16` → Enter → jump, via `api.search`); **make-primary** stars in the picker (`makePrimary` promotes a checked translation to first — drives navigation + the top slide line). Full drag-reorder of parallels is still future.
- [ ] **Export current slide as PNG** — render the live `SlideCanvas` to an image for sharing/printing (html-to-canvas of the same component the presenter uses).
- [ ] **Presenter layout presets** — centred / lower-third / top-banner, plus auto-split a long passage across multiple slides (max-lines), advanced with arrows.
- [ ] **Module downloader** — fetch from MyBible mirrors (`myb.1gb.ru`, `mybible.infoo.pro`, `mph4.ru`; `mybible.i-t.kz` is **dead** — expired TLS, dropped from the registry; catalog in `old/MyBible/-downloads.cache.SQLite3`) → unzip → `modules/` → build. The registry mechanism is first-party/sanctioned (MyBible ≥5.5.0 "extra registries"; canonical host `mybible.zone/repository/…`), but **read hosts from the registry's self-describing list, don't hardcode**; poll the tiny `registry_info.json` + cache; **allowlist by translation copyright, not by "it's in the registry"** (PD: Synodal 1876, Kulish 1903, CS Elizabeth 1900, WLC/WH1881; modern UBS/Ohienko/Turkonyak are ©). Sourcing decision (researched 2026-06-21): prefer a hybrid — keep user-supplied `.SQLite3` as primary; for an in-app downloader, **getBible v2** (keyless, per-text PD licenses, has uk/ru/CS) as the ship-safe default + **bolls.life** (keyless, richest: uk/ru/CS + WLC/LXX + Strong's, but no per-text license) as "advanced"; bundle **STEPBible TAHOT/TAGNT** (CC BY) for Hebrew/Greek + disambiguated Strong's.
- [ ] **Reading plan / slide playlist** — ordered passages, progress
- [ ] **Resizable panels** — `react-resizable-panels`, persist widths
- [ ] **Canonical cross-translation book abbreviations** — so `бут`/`gen`/`быт` resolve regardless of how a module names the book

### From the analog gap-analysis (2026-06-23)

Net-new ideas surfaced by diffing ShowBible + VisioBible against the app (the first
quick-wins batch — Текст composer, force-black, clicker, rescan — already shipped above).
Ranked roughly by value/effort for a church-projection tool:

- [ ] **Image projection / gallery tab** — full-bleed image slides (maps, sermon graphics, posters) via a file/folder picker; reuse `lib/image.ts` downscaling + the presenter render path. _(value: med, effort: med)_
- [ ] **User-rebindable hotkeys** — a `keymap` (action→combo) in `settingsStore` driving `useHotkeys`, with a capture UI + duplicate detection; named profiles later. Underpins the clicker. _(med/med)_
- [ ] **Complete RTL in the operator UI** — only the slide carries `rtl` today; thread the module's rtl into the navigator / verse list / search (`dir=rtl` + alignment) for Hebrew/Arabic modules. _(med/med)_
- [ ] **Song polish** — configurable end-of-song marker (e.g. `***`) appended on the last stanza; heuristic verse/chorus/bridge tagging (detect «Приспів»/«Chorus») with coloured chips in `SongsPanel`. _(med/med)_
- [ ] **Long/short book-name toggle + configurable verse separator** — display setting `bookNameStyle`; `verseSeparator` (space/newline) when concatenating a multi-verse selection; pairs with the page-splitting item. _(low/small)_
- [ ] **Separator line every N verses** on long multi-verse slides (readability). _(low/small)_
- [ ] **Integrated media slide (local video/audio)** — a `Slide.media` variant rendered as a fullscreen HTML5 `<video>`/`<audio>` in the presenter, with a Control transport bar (countdowns, clips). _(med/large)_ — and as a follow-on, **network HLS/IPTV by URL** via hls.js. _(low/med)_
- [ ] **Always-on-top output + window hardening (Aero/Win+D), NDI network output, auto-update, UI i18n/skins** — all **desktop-wrap-dependent** (browser popups can't pin or NDI); revisit after the Tauri/Electron item. _(low / large, long-horizon)_

### Architecture seams (toward a full web app)

- [ ] `BibleStore` interface over `server/db.ts` (SQLite now → PostgreSQL later); small, non-breaking refactor
- [ ] `ModuleSource` interface (mirrors / file upload / URL)
- [ ] WebSocket transport behind `presenterBus` (cross-device / multi-user presenting)
- [ ] Auth + per-user data (settings/history/bookmarks → DB); object storage for background images

### Polish

- [ ] **Appearance tab overhaul** — the current "Вигляд" tab can't configure everything; rework it (largely folds into the template engine above).
- [ ] **Named appearance presets** — save/load slide-style presets (font/colours/background/padding) so different rooms/screens are one click; presets persisted in `settingsStore`.
- [ ] **Morphology in the Strong tab** — surface the `<m>` grammar codes (currently stripped) next to each word, e.g. on hover or under the active token.
- [ ] Visual "wow" pass now that Playwright gives screenshots (spacing, hover/focus states, micro-animations)
- [ ] Bundle code-splitting (web bundle ~744 KB / 233 KB gzip)
- [ ] Optional desktop wrap (Tauri/Electron) for true multi-monitor control

## Notes & constraints

- **Mantine overlays** (`Modal`, `Spotlight`, `Drawer`) don't render their content in this setup → use inline panels.
- Two source modules have corrupted (mojibake) Cyrillic filenames → builder falls back to the module's description for the abbreviation.
- The control selection store (`useStore`) is persisted (`vo:selection`) — a reload restores translation/book/chapter/verses (but not `live`).

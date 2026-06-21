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
- [x] **Translation checklist picker** — grouped-by-language checkbox list (inline in the navbar, with its own filter; not a Popover — overlays are unreliable here), replacing the header MultiSelect. First checked id is the primary; max 5. *(First slice of the Selection UX rework below.)*
- [x] Inline search panel: text + references (`Ів 3:16`, `Jn 3:16-18`, `бут 2 3`, `бут 2 3-5`, `бут 2`)
- [x] Search scope toggle: current module (F3 / Ctrl+F) vs all (F4)
- [x] History (auto-recorded, deletable: clear-all + per-item, abbreviated names) + bookmarks (export/import JSON), in the left sidebar
- [x] Responsive layout — navbar/aside collapse on narrow windows with Burger toggles (no more vanishing navigation)
- [x] Hotkeys: arrows (verse step), `b` blank, `Esc` clear
- [x] **Scroll-to-verse on jump** — search/history/concordance navigation centres the target verse in the list (`data-verse` + a deferred instant `scrollIntoView`; smooth is ignored by Radix ScrollArea, and clearing the target synchronously cancels the pending scroll — both learned the hard way)

### Study & dictionaries

- [x] Dictionary import (`*.dictionary.SQLite3`) into `library.db` — Strong's and explanatory
- [x] **Strong's dictionary**: clickable Strong numbers on has-Strong modules (parsed from `text_raw`) → definition lookup (aside "Стронг" tab). Verified with a real Strong's dictionary (14k Hebrew+Greek entries); OT→Hebrew, NT→Greek; HTML entities decoded; definitions formatted (lemma/pronunciation on their own line via `cleanDefinition`).
- [x] **Interlinear study + word lookup**: every word in the "Стронг" tab is clickable → highlights it and shows its Strong entry and any explanatory-dictionary entry (`/api/dict?q=`) below. Makes explanatory dictionaries (e.g. CathEn) usable.
- [x] **Strong's concordance** ("where else is this word used") — builder writes a `verse_strongs(translation_id, verse_id, strong)` index from `text_raw`; `/api/strong/:num/refs` (scoped to the current translation, `total`/`truncated`) lists occurrences. In the "Стронг" tab a Strong entry expands into a clickable occurrence list (jump-to-verse), and `G####`/`H####` cross-refs inside definitions are clickable to follow the chain.

### Appearance & presenter

- [x] Presenter window synced via BroadcastChannel (abstracted in `presenterBus`)
- [x] Appearance settings (persisted): font, text colour, background colour, background image, alignment, verse numbers
- [x] **Configurable slide edge padding** — per-side `padTop/Right/Bottom/Left` with a **px/% unit toggle** and a **link mode** (all sides / vertical+horizontal pairs / independent); a four-input "square" in settings. Applied in `SlideCanvas` as a **proportional inset** (an absolutely-positioned content box: top/bottom = % of height, left/right = % of width; px is scaled to a 1080p reference) so the **preview matches the full-screen presenter** exactly. *(This is an interim layout — superseded by the template engine below.)*
- [x] **Project a Strong citation** — from the Strong tab, "На екран зі Стронгом" sends the Strong-bearing (primary) translation's verse with a "word · Стронг N — gloss" `subline` (rendered under a divider above the reference in `SlideCanvas`); contextual — normal navigation reverts it.
- [x] **Fullscreen presenter** — the presenter window goes fullscreen on click or "F" (browsers can't auto-fullscreen `window.open` without a gesture); a hint fades out.
- [x] Presenter applies the appearance; auto-fit text (binary search, refits on slide change/resize); fade transitions; vignette
- [x] **WYSIWYG preview** — the aside preview renders via the same `SlideCanvas` as the presenter (identical background/font/colour/alignment), with a pin toggle to dock it at the bottom of the aside (visible while in any mode)
- [x] **Panel placement switch** (Settings → Розташування панелей): the study panels (preview / Strong / appearance) live either in the right aside or docked at the bottom of the centre column (`StudyPanels` component, `panelPlacement` persisted)
- [x] Theme: Inter (UI) + Lora (scripture) + indigo accent

### Tooling

- [x] ESLint (+ jsx-a11y) + Prettier; Vitest (normalization + reference parsing)
- [x] Production build verified (`tsc -b && vite build`); dev deps excluded from bundle
- [x] Playwright MCP wired (`.mcp.json`) for reliable browser screenshots

## Next / backlog

### Features

- [ ] **Slide template/scheme engine** (big — the VisioBible model the user wants) — a slide becomes a set of named, positioned **objects** (Quote / Reference / Subline a.k.a. "Quote 2" / divider line(s) / background / decorations), each with proportional geometry (x/y/w/h in %), alignment, colour, opacity (cf. VisioBible `.sch` XML in `old/VisioBible 2.4/…/Templates` — `Object Type=0 Quote, 1 Refer, 5 line image, 6 Quote2`, all % `Width/Height/IndentionX/IndentionY`). Savable/loadable **templates** + a visual editor; subsumes today's appearance settings (font/colour/padding/divider/proportions) and the `subline`. Define `SlideTemplate` (JSON), render objects in `SlideCanvas`, ship presets, persist user templates. This is what "налаштувати все / маркований шаблон, де риска, які пропорції" means; the current per-side padding is the interim stand-in.
- [ ] **Styled slide segments** (in-text highlight + red-letter) — render the projected verse as styled segments (`{text, hot?}[]`) so a word can be emphasized *in place* (the Strong word, beyond the subline citation that's already done) and **words of Jesus** can be coloured. Data is ready: `parseStrongTokens` for the Strong word; `<J>…</J>` red-letter markup exists in **30k+ verses** (e.g. CARSA, OJB). Needs `SlideLine` to carry segments and `SlideCanvas`/`Presenter` to style them.
- [ ] **Subheadings** — module subheadings live in separate `*.subheadings.SQLite3` companions (builder currently SKIPs them; main verse text has no `<h>` tags). Import into a `subheadings` table and render between verses in the reading list and (optionally) on slides.
- [ ] **Concordance results in the verse panel** — show "where else used" occurrences in the main centre list (like search results) rather than only the small study panel; reuse the search-results UI + `jumpTo` (occurrence shape already == `SearchResult`). Add a scope toggle: this translation vs all Strong translations.
- [ ] **Selection UX rework** (do *before* the downloader) — rethink how translations/books/chapters/verses are chosen. Candidates: persist the `useStore` selection across reloads (known gotcha — reload currently clears it), replace the Mantine `MultiSelect` translation picker (e.g. a language-grouped **checklist** — user request), a first-class "go to reference" jump bar, better parallel-translation management (reorder / pick primary). **Scope confirmed (2026-06-21): all four** — persist on reload + ~~translation picker~~ (DONE — grouped checklist) + go-to-reference jump bar + parallel-translation management (reorder / pick primary).
- [ ] **Export current slide as PNG** — render the live `SlideCanvas` to an image for sharing/printing (html-to-canvas of the same component the presenter uses).
- [ ] **Presenter layout presets** — centred / lower-third / top-banner, plus auto-split a long passage across multiple slides (max-lines), advanced with arrows.
- [ ] **Module downloader** — fetch from MyBible mirrors (`myb.1gb.ru`, `mybible.infoo.pro`, `mph4.ru`; `mybible.i-t.kz` is **dead** — expired TLS, dropped from the registry; catalog in `old/MyBible/-downloads.cache.SQLite3`) → unzip → `modules/` → build. The registry mechanism is first-party/sanctioned (MyBible ≥5.5.0 "extra registries"; canonical host `mybible.zone/repository/…`), but **read hosts from the registry's self-describing list, don't hardcode**; poll the tiny `registry_info.json` + cache; **allowlist by translation copyright, not by "it's in the registry"** (PD: Synodal 1876, Kulish 1903, CS Elizabeth 1900, WLC/WH1881; modern UBS/Ohienko/Turkonyak are ©). Sourcing decision (researched 2026-06-21): prefer a hybrid — keep user-supplied `.SQLite3` as primary; for an in-app downloader, **getBible v2** (keyless, per-text PD licenses, has uk/ru/CS) as the ship-safe default + **bolls.life** (keyless, richest: uk/ru/CS + WLC/LXX + Strong's, but no per-text license) as "advanced"; bundle **STEPBible TAHOT/TAGNT** (CC BY) for Hebrew/Greek + disambiguated Strong's.
- [ ] **Reading plan / slide playlist** — ordered passages, progress
- [ ] **Resizable panels** — `react-resizable-panels`, persist widths
- [ ] **Canonical cross-translation book abbreviations** — so `бут`/`gen`/`быт` resolve regardless of how a module names the book

### Architecture seams (toward a full web app)

- [ ] `BibleStore` interface over `server/db.ts` (SQLite now → PostgreSQL later); small, non-breaking refactor
- [ ] `ModuleSource` interface (mirrors / file upload / URL)
- [ ] WebSocket transport behind `presenterBus` (cross-device / multi-user presenting)
- [ ] Auth + per-user data (settings/history/bookmarks → DB); object storage for background images

### Polish

- [ ] **Configurable Strong subline** — let the user choose how much of the Strong entry shows in the projected subline / Strong tab (just the lemma+pronunciation vs the full definition), controlled from the appearance settings (user request — "щоб весь текст зі стронга відображався, але налаштовувано").
- [ ] **Appearance tab overhaul** — the current "Вигляд" tab can't configure everything; rework it (largely folds into the template engine above).
- [ ] **Named appearance presets** — save/load slide-style presets (font/colours/background/padding) so different rooms/screens are one click; presets persisted in `settingsStore`.
- [ ] **Morphology in the Strong tab** — surface the `<m>` grammar codes (currently stripped) next to each word, e.g. on hover or under the active token.
- [ ] **Strong dictionary H/G disambiguation** — the single combined "Strong" dict has no per-entry language, so `lookupStrong`'s OT→Hebrew/NT→Greek `rank` can't separate H#### from G#### sharing the same digits (e.g. OT verse on #430 shows both Greek *anechomai* G430 and Hebrew *Elohim* H430, Greek possibly first). Tag entries H/G at import (topic prefix / language column) and rank on that.
- [ ] Visual "wow" pass now that Playwright gives screenshots (spacing, hover/focus states, micro-animations)
- [ ] Bundle code-splitting (web bundle ~744 KB / 233 KB gzip)
- [ ] Optional desktop wrap (Tauri/Electron) for true multi-monitor control

## Notes & constraints

- **Mantine overlays** (`Modal`, `Spotlight`, `Drawer`) don't render their content in this setup → use inline panels.
- Two source modules have corrupted (mojibake) Cyrillic filenames → builder falls back to the module's description for the abbreviation.
- The control selection store (`useStore`) is not persisted — a reload clears the current selection (could persist if wanted).

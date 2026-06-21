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
- [x] Inline search panel: text + references (`Ів 3:16`, `Jn 3:16-18`, `бут 2 3`, `бут 2 3-5`, `бут 2`)
- [x] Search scope toggle: current module (F3 / Ctrl+F) vs all (F4)
- [x] History (auto-recorded, deletable: clear-all + per-item, abbreviated names) + bookmarks (export/import JSON), in the left sidebar
- [x] Responsive layout — navbar/aside collapse on narrow windows with Burger toggles (no more vanishing navigation)
- [x] Hotkeys: arrows (verse step), `b` blank, `Esc` clear

### Study & dictionaries

- [x] Dictionary import (`*.dictionary.SQLite3`) into `library.db` — Strong's and explanatory
- [x] **Strong's dictionary**: clickable Strong numbers on has-Strong modules (parsed from `text_raw`) → definition lookup (aside "Стронг" tab). Verified with a real Strong's dictionary (14k Hebrew+Greek entries); OT→Hebrew, NT→Greek; HTML entities decoded; definitions formatted (lemma/pronunciation on their own line via `cleanDefinition`).
- [x] **Interlinear study + word lookup**: every word in the "Стронг" tab is clickable → highlights it and shows its Strong entry and any explanatory-dictionary entry (`/api/dict?q=`) below. Makes explanatory dictionaries (e.g. CathEn) usable.

### Appearance & presenter

- [x] Presenter window synced via BroadcastChannel (abstracted in `presenterBus`)
- [x] Appearance settings (persisted): font, text colour, background colour, background image, alignment, verse numbers
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

- [ ] **Strong's concordance** ("where else is this word used") — find all verses containing a given Strong number. Design: the data already exists in `verses.text_raw` (`<S>####>`); build a `verse_strongs(translation_id, book, chapter, verse, strong)` index in the builder, add `/api/strong/:num/refs`, and make Strong numbers (incl. the `G####`/`H####` cross-refs inside definitions) clickable to list occurrences.
- [ ] **Module downloader** — fetch from MyBible mirrors (`mybible.i-t.kz`, `myb.1gb.ru`, `mybible.infoo.pro`, `mph4.ru`; catalog in `old/MyBible/-downloads.cache.SQLite3`) → unzip → `modules/` → build
- [ ] **Reading plan / slide playlist** — ordered passages, progress
- [ ] **Resizable panels** — `react-resizable-panels`, persist widths
- [ ] **Canonical cross-translation book abbreviations** — so `бут`/`gen`/`быт` resolve regardless of how a module names the book

### Architecture seams (toward a full web app)

- [ ] `BibleStore` interface over `server/db.ts` (SQLite now → PostgreSQL later); small, non-breaking refactor
- [ ] `ModuleSource` interface (mirrors / file upload / URL)
- [ ] WebSocket transport behind `presenterBus` (cross-device / multi-user presenting)
- [ ] Auth + per-user data (settings/history/bookmarks → DB); object storage for background images

### Polish

- [ ] Visual "wow" pass now that Playwright gives screenshots (spacing, hover/focus states, micro-animations)
- [ ] Bundle code-splitting (web bundle ~663 KB / 206 KB gzip)
- [ ] Optional desktop wrap (Tauri/Electron) for true multi-monitor control

## Notes & constraints

- **Mantine overlays** (`Modal`, `Spotlight`, `Drawer`) don't render their content in this setup → use inline panels.
- Two source modules have corrupted (mojibake) Cyrillic filenames → builder falls back to the module's description for the abbreviation.
- The control selection store (`useStore`) is not persisted — a reload clears the current selection (could persist if wanted).

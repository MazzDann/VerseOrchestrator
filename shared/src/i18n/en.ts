/**
 * The English interface (0.11.0): each Ukrainian string of the app → its English version.
 * Keys are copied exactly from the code (a test checks that every `tr` / `trn` / `N_` key is
 * here, with the same `{placeholders}` and plural forms `one|other`).
 *
 * Terms: вікно керування — control window; вікно показу — presentation window; сцена — stage
 * display; вікна виводу — output windows; на екран — to screen; наживо — live; прев’ю —
 * preview; сховати текст — hide text; чорний екран — black screen; послідовність показу —
 * running order; програма — program; власний текст — custom text; глядачі — viewers; пульт
 * доповідача — speaker remote; бандл — bundle; уривок — passage; розділ — chapter.
 */
export const EN: Record<string, string> = {
  // shared server copy (web/src/serverStore.ts)
  'Щоб запустити знову, відкрийте start.cmd (Windows), start.command (macOS) або ./start.sh (Linux) у папці застосунку.':
    'To start it again, open start.cmd (Windows), start.command (macOS), or ./start.sh (Linux) in the app folder.',
  'Потрібен сервер застосунку (start.cmd / start.command / ./start.sh) — зараз працює лише бібліотека в браузері':
    "Needs the app's server (start.cmd / start.command / ./start.sh) — only the library in the browser is running now",
  // fonts (web/src/settingsStore.ts)
  'Lora (сериф)': 'Lora (serif)',
  'Inter (без зарубок)': 'Inter (sans serif)',
  Системний: 'System',
  // settings panel (web/src/components/SettingsPanel.tsx)
  'Бібліотеку оновлено': 'Library updated',
  'Не вдалося перебудувати бібліотеку: {error}': "Couldn't rebuild the library: {error}",
  власний: 'custom',
  класичний: 'classic',
  ліворуч: 'left',
  'по центру': 'centered',
  праворуч: 'right',
  'Відкрити окремим вікном': 'Open in a separate window',
  Пресети: 'Presets',
  'готові набори вигляду': 'ready-made looks',
  'Скинути вигляд до типового': 'Reset the look to default',
  Текст: 'Text',
  'швидкий перехід': 'fast transition',
  'без анімації': 'no animation',
  Шрифт: 'Font',
  Колір: 'Color',
  Вирівнювання: 'Alignment',
  Ліворуч: 'Left',
  Центр: 'Center',
  Праворуч: 'Right',
  'Показувати номери віршів': 'Show verse numbers',
  'Перехід між слайдами': 'Slide transition',
  'Плавний: старий слайд згасає, новий проявляється (новий текст — за ~0,4 с). Швидкий: новий одразу, коротке проявлення. Без анімації: миттєва заміна.':
    'Smooth: the old slide fades out and the new one fades in (new text in about 0.4 s). Fast: the new one at once, with a short fade-in. No animation: an instant swap.',
  Плавний: 'Smooth',
  Швидкий: 'Fast',
  'Без анімації': 'No animation',
  Фон: 'Background',
  зображення: 'image',
  'Колір фону': 'Background color',
  'Фонове зображення': 'Background image',
  Замінити: 'Replace',
  Завантажити: 'Upload',
  'Прибрати фон': 'Remove the background',
  'Розкладка слайда': 'Slide layout',
  'відступи {top}/{right}/{bottom}/{left} {unit}': 'margins {top}/{right}/{bottom}/{left} {unit}',
  'Відступи від країв': 'Margins',
  'Усі разом': 'All together',
  'Верт./Гориз.': 'Vert./Horiz.',
  Окремо: 'Each side',
  'Відступ зверху': 'Top margin',
  'Відступ зліва': 'Left margin',
  'Відступ справа': 'Right margin',
  'Відступ знизу': 'Bottom margin',
  'Довгі уривки': 'Long passages',
  'по {n} на слайд': '{n} per slide',
  'усе на одному слайді': 'all on one slide',
  поступово: 'step by step',
  'Віршів на слайд': 'Verses per slide',
  '0 = увесь уривок на одному слайді; більше — розбивка на сторінки':
    '0 = the whole passage on one slide; more splits it into pages',
  'Прогресивне розкриття': 'Progressive reveal',
  'Уривок з’являється по одному віршу на кожен крок клікера (накопичення)':
    'The passage appears one verse per clicker step, building up',
  Прожектор: 'Spotlight',
  'Приглушувати показані вірші, яскравий лише поточний':
    'Dim the verses already shown; only the current one stays bright',
  Плейсхолдери: 'Placeholders',
  'Нерозкриті вірші видно ледь помітно (інакше — невидимі, місце збережено)':
    'Verses not revealed yet show faintly (otherwise they are invisible, their space kept)',
  Виділення: 'Highlighting',
  'слова Ісуса кольором': "Jesus' words in color",
  'без виділення слів Ісуса': "Jesus' words not highlighted",
  'Слова Ісуса кольором': "Jesus' words in color",
  'Колір слів Ісуса': "Color of Jesus' words",
  'Колір виділеного слова (Стронг)': "Highlighted word color (Strong's)",
  'Текст Стронга на показі': "Strong's text on screen",
  Лема: 'Lemma',
  Повністю: 'Full entry',
  'Гарячі клавіші': 'Hotkeys',
  'клавіші дій оператора': "the operator's keys",
  Застосунок: 'App',
  'дані в браузері': 'data in the browser',
  'дані з сервера': 'data from the server',
  'прев’ю праворуч': 'preview on the right',
  'прев’ю внизу': 'preview at the bottom',
  'Мова інтерфейсу': 'Interface language',
  'Джерело даних налаштовується в головному вікні керування.':
    'The data source is set in the main control window.',
  'Розташування панелі прев’ю': 'Preview panel position',
  'Унизу центру': 'Bottom of the center',
  'Бібліотека модулів': 'Module library',
  'Перебудувати з папок modules/ і songs/ після додавання перекладу чи пісні.':
    'Rebuild from the modules/ and songs/ folders after adding a translation or a song.',
  'Пересканувати модулі': 'Rescan modules',
  // presets (web/src/components/PresetsSection.tsx)
  'Пресет збережено: {name}': 'Preset saved: {name}',
  'Пресет застосовано: {name}': 'Preset applied: {name}',
  'Не вдалося прочитати файл пресету': "Couldn't read the preset file",
  'Не вдалося завантажити пресет': "Couldn't load the preset",
  'Назва пресету': 'Preset name',
  Зберегти: 'Save',
  'Імпортувати пресет із файлу': 'Import a preset from a file',
  'Імпорт пресету': 'Import preset',
  'Експортувати у файл': 'Export to a file',
  'Експорт {name}': 'Export {name}',
  'Видалити {name}': 'Delete {name}',
  Вбудовані: 'Built-in',
  // slide layout templates (web/src/presenterBus.ts, TemplateEditor.tsx)
  'Класичний (за замовчуванням)': 'Classic (default)',
  'По центру з рискою': 'Centered with a rule',
  'Нижня третина': 'Lower third',
  Мінімал: 'Minimal',
  Цитата: 'Quote',
  Посилання: 'Reference',
  Підпис: 'Subline',
  Риска: 'Rule',
  Шаблон: 'Template',
  'Положення й розміри у % від слайда. Зміни зберігаються одразу.':
    'Position and size in % of the slide. Changes are saved at once.',
  Показувати: 'Show',
  Ширина: 'Width',
  Товщина: 'Thickness',
  Висота: 'Height',
  'Вирівнювання: {object}': 'Alignment: {object}',
  'По центру': 'Centered',
  'Класичний показ: текст по центру. Оберіть інший шаблон, щоб самостійно розставити цитату, риску, підпис і посилання.':
    'Classic look: the text centered. Pick another template to place the quote, the rule, the subline, and the reference yourself.',
  // hotkeys (web/src/hotkeys.ts, HotkeysSettings.tsx)
  Далі: 'Next',
  'Наступний вірш або сторінка': 'Next verse or page',
  Назад: 'Back',
  'Попередній вірш або сторінка': 'Previous verse or page',
  'На екран': 'To screen',
  'Показати поточний вибір': 'Show the current selection',
  'Сховати текст': 'Hide text',
  'Текст згасає, фон лишається; ще раз — той самий слайд назад':
    'The text fades, the background stays; again — the same slide comes back',
  'Чорний екран': 'Black screen',
  'Одразу все чорне, навіть фон; ще раз — усе назад':
    'All black at once, even the background; again — everything comes back',
  Очистити: 'Clear',
  'Прибрати слайд з екрана': 'Take the slide off the screen',
  'Пошук (поточний)': 'Search (current)',
  'Пошук у поточному модулі': 'Search the current module',
  'Пошук (усі)': 'Search (all)',
  'Пошук в усіх модулях': 'Search all modules',
  'Палітра команд': 'Command palette',
  'Швидкий пошук дій, книг і пісень': 'Quick search for actions, books, and songs',
  'На Mac F-клавіші натискають разом із Fn, тому типово працюють і поєднання з ⌘: ⌘↩ — на екран, ⌘F — пошук у перекладі, ⇧⌘F — пошук скрізь, ⌘K — палітра команд.':
    'On a Mac, F-keys need Fn, so ⌘ chords work by default too: ⌘↩ — to screen, ⌘F — search the translation, ⇧⌘F — search everywhere, ⌘K — command palette.',
  'Конфлікт із «{actions}» — спрацюють разом': 'Conflicts with “{actions}” — they fire together',
  'Натисніть клавіші… (Esc — скасувати)': 'Press the keys… (Esc — cancel)',
  Змінити: 'Change',
  'Змінити клавішу: {action}': 'Change the key: {action}',
  Типова: 'Default',
  'Типова клавіша: {action}': 'Default key: {action}',
  'Скинути всі клавіші': 'Reset all keys',
  // «Запуск за адресою» (web/src/components/StandbySection.tsx)
  'Адреса чекає, застосунок зупинено': 'The address is waiting; the app is stopped',
  'Застосунок запускається…': 'The app is starting…',
  'Застосунок працює': 'The app is running',
  'Застосунок зупиняється…': 'The app is stopping…',
  'Запуск за адресою': 'Start on open',
  'Стан недоступний: {error}': 'Status unavailable: {error}',
  'Завантаження…': 'Loading…',
  'Нова адреса не відповідає: {url}': 'The new address does not answer: {url}',
  'Перезапуск на новій адресі {url}': 'Restarting at the new address {url}',
  'Нова адреса: {url}': 'New address: {url}',
  'Перезапуск на порту {port}… сторінка перейде туди сама':
    'Restarting on port {port}… this page will follow',
  'Вимикається — щойно застосунок перестануть використовувати':
    'Switching off — as soon as the app is no longer in use',
  'очікувач {mb} МБ': 'waiter {mb} MB',
  'Очікувач не працює — запуститься разом з комп’ютером':
    "The waiter isn't running — it starts with the computer",
  'Невеликий процес тримає адресу й запускає застосунок, щойно її відкрити (і з телефона теж). Без роботи {minutes} хв застосунок зупиняється, а адреса чекає далі. Стартує разом з комп’ютером.':
    'A small process keeps the address and starts the app as soon as it is opened (from a phone too). After {minutes} min without use the app stops, and the address keeps waiting. Starts with the computer.',
  'Автозапуск не підтримується на цій системі.':
    'Starting with the computer is not supported on this system.',
  'Запустити зараз': 'Start now',
  Порт: 'Port',
  'Змінити порт на {port}?': 'Change the port to {port}?',
  'Потрібен перезапуск: очікувач і застосунок перезапустяться на новій адресі, а ця сторінка перейде туди сама.':
    'A restart is needed: the waiter and the app restart at the new address, and this page follows.',
  'Потрібен перезапуск: очікувач перезапуститься на новій адресі.':
    'A restart is needed: the waiter restarts at the new address.',
  'Застосунок відкриватиметься за новою адресою; перезапуск не потрібен.':
    'The app will open at the new address; no restart needed.',
  'Закладки й історію браузер зберігає окремо для кожної адреси — за новою вони почнуться з нуля. Налаштування вигляду й послідовність перейдуть самі (вони в папці data/).':
    'The browser keeps bookmarks and history per address — at the new one they start empty. Appearance settings and the running order move by themselves (they are in the data/ folder).',
  Скасувати: 'Cancel',
  'Так, перезапустити': 'Yes, restart',
  // desktop shortcut (web/src/components/ShortcutSection.tsx)
  'Ярлик створено: {file}': 'Shortcut created: {file}',
  'Ярлик не створено: {error}': 'Shortcut not created: {error}',
  'Ярлик на робочому столі': 'Desktop shortcut',
  'Запускає застосунок і відкриває вікно керування окремим вікном — без вкладок і адресного рядка: у браузері, вибраному вище, якщо він на основі Chromium, а з «Браузер системи» — у Chrome чи Edge.':
    'Starts the app and opens the control window as its own window — no tabs, no address bar: in the browser chosen above if it is built on Chromium; with “System browser”, in Chrome or Edge.',
  'Створити ярлик': 'Create shortcut',
  // «Відкривати вікно керування в…» (web/src/components/BrowserSection.tsx, web/src/lib/launchBrowser.ts)
  'Відкривати вікно керування в…': 'Open the control window in…',
  'Так його відкривають файл запуску й ярлик — з наступного запуску.':
    'The start file and the shortcut open it there — from the next start.',
  'Браузер системи': 'System browser',
  '{browser} (не знайдено)': '{browser} (not found)',
  'Окремим вікном': 'As a separate window',
  'Без вкладок і адресного рядка.': 'No tabs, no address bar.',
  'Окремим вікном відкривають браузери на основі Chromium: Chrome, Edge, Brave, Arc, Vivaldi. Виберіть один із них угорі.':
    'Browsers built on Chromium open it as a separate window: Chrome, Edge, Brave, Arc, Vivaldi. Choose one of them above.',
  '{browser} на цьому комп’ютері не знайдено — файл запуску відкриє вікно керування, як із «Браузер системи».':
    '{browser} was not found on this computer — the start file will open the control window as with “System browser”.',
  'У {browser} вікно керування відкривається звичайним вікном.':
    'In {browser} the control window opens as a regular window.',
  'Версія: {version}': 'Version: {version}',
  // «Відкрити в … зараз» (web/src/components/BrowserSection.tsx, server/src/handover.ts)
  'Відкрити в {browser} зараз': 'Open in {browser} now',
  'Відкриваю вікно керування в {browser}…': 'Opening the control window in {browser}…',
  'Вікна показу цього браузера лишаться тут — відкрийте показ знову в {browser}.':
    "This browser's presentation windows stay here — open the presentation again in {browser}.",
  'Перейти в {browser}': 'Switch to {browser}',
  'Спершу виберіть браузер у «Відкривати вікно керування в…».':
    'First choose the browser in “Open the control window in…”.',
  '{browser} на цьому комп’ютері більше немає — виберіть інший браузер.':
    '{browser} is no longer on this computer — choose another browser.',
  'Неправильна адреса вікна керування': 'Wrong address of the control window',
  'Не вдалося відкрити {browser}: {error}': "Couldn't open {browser}: {error}",
  'Не вдалося відкрити {browser}.': "Couldn't open {browser}.",
  // «Вимкнути повністю» (web/src/components/ShutdownSection.tsx)
  'менше 1 МБ': 'under 1 MB',
  '≈ {mb} МБ': '≈ {mb} MB',
  'Не вдалося вимкнути: {error}': "Couldn't switch off: {error}",
  'Застосунок вимкнено': 'The app is switched off',
  'Цю вкладку можна закрити.': 'You can close this tab.',
  'Вимкнути повністю': 'Switch off completely',
  'Зупиняє застосунок і очікувача, вимикає «Запуск за адресою» разом з комп’ютером, закриває вікна виводу. Після цього нічого не працює у фоні.':
    'Stops the app and the waiter, turns off “Start on open” with the computer, and closes the output windows. Nothing runs in the background afterwards.',
  'Вимкнути повністю…': 'Switch off completely…',
  'Вимкнути застосунок?': 'Switch off the app?',
  'Показ зупиниться: пульти й телефони глядачів відключаться, вікна виводу закриються.':
    "The show stops: remotes and viewers' phones disconnect, and the output windows close.",
  'Також стерти дані браузера для {host}': "Also erase the browser's data for {host}",
  'Копії налаштувань і послідовності в цьому браузері та кеш бібліотеки. Самі налаштування лишаються в папці застосунку (data/).':
    "This browser's copies of the settings and the running order, and the library cache. The settings themselves stay in the app folder (data/).",
  Вимкнути: 'Switch off',
  // data source and the browser library (DataSourceSection.tsx, lib/engine/*)
  '{n} МБ': '{n} MB',
  '{n} сегм.|{n} сегм.|{n} сегм.': '{n} segment|{n} segments',
  'З кешу': 'From the cache',
  Завантаження: 'Downloading',
  Збирання: 'Merging',
  Готово: 'Done',
  'Бібліотека в браузері готова': 'The library in the browser is ready',
  'Не вдалося: {error}': 'Failed: {error}',
  'Підходять модулі MyBible (.SQLite3) і сегменти (.vodb / .vodb.gz)':
    'MyBible modules (.SQLite3) and segments (.vodb / .vodb.gz) work here',
  Перетворення: 'Converting',
  'Не вдалося додати файл: {error}': "Couldn't add the file: {error}",
  'Запуск: {engine}': 'Starting: {engine}',
  '{engine}: {segments} за {s} с': '{engine}: {segments} in {s} s',
  'Рушій: {engine}': 'Engine: {engine}',
  'Кеш сегментів очищено': 'Segment cache cleared',
  Переклади: 'Translations',
  Словники: 'Dictionaries',
  'Посилання й коментарі': 'Cross-references and commentaries',
  Пісні: 'Songs',
  'Джерело даних': 'Data source',
  Сервер: 'Server',
  'У браузері': 'In the browser',
  'Уся бібліотека з сервера. «У браузері» — вибрані переклади працюють прямо тут (база в WebAssembly), без запитів до сервера.':
    'The whole library from the server. “In the browser” — the chosen translations work right here (a database in WebAssembly), without requests to the server.',
  'У браузері: {segments}, {size} у пам’яті{version}.':
    'In the browser: {segments}, {size} in memory{version}.',
  'Рушій бази': 'Database engine',
  'Порівняти рушії бази на тих самих запитах (нове вікно)':
    'Compare the database engines on the same queries (new window)',
  'Порівняти рушії бази': 'Compare database engines',
  'Сервер недоступний — список сегментів з кешу браузера; працюють лише збережені сегменти.':
    "The server can't be reached — the segment list is from the browser's cache; only saved segments work.",
  'Сегменти на сервері не зібрано (npm run build:segments). Можна додати модулі MyBible чи сегменти файлами — нижче.':
    'The server has no segments built (npm run build:segments). You can add MyBible modules or segments as files below.',
  завантажено: 'loaded',
  'Перетягнуті файли': 'Dropped files',
  'Кеш браузера:': 'Browser cache:',
  'Очистити кеш': 'Clear the cache',
  'Кеш браузера недоступний (сторінка відкрита не через localhost/HTTPS) — сегменти щоразу завантажуються з сервера.':
    "The browser cache isn't available (the page isn't opened through localhost/HTTPS) — segments download from the server every time.",
  'Перетягніть сюди модулі MyBible (.SQLite3) — Біблії, словники, коментарі, посилання — або сегменти .vodb':
    'Drop MyBible modules (.SQLite3) here — Bibles, dictionaries, commentaries, cross-references — or .vodb segments',
  'Вибрати файли…': 'Choose files…',
  'Файл «{name}» більше не в кеші браузера — перетягніть його ще раз':
    "The file “{name}” is no longer in the browser's cache — drop it here again",
  'Сегмента {key} немає в маніфесті (бібліотеку перезібрано?)':
    'The segment {key} is not in the manifest (was the library rebuilt?)',
  '{items}, {ms} мс': '{items}, {ms} ms',
  '{n} вірш|{n} вірші|{n} віршів': '{n} verse|{n} verses',
  '{n} стаття|{n} статті|{n} статей': '{n} entry|{n} entries',
  '{n} коментар|{n} коментарі|{n} коментарів': '{n} note|{n} notes',
  '{n} посилання|{n} посилання|{n} посилань': '{n} cross-reference|{n} cross-references',
  '{n} пісня|{n} пісні|{n} пісень': '{n} song|{n} songs',
  Біблія: 'Bible',
  словник: 'dictionary',
  коментарі: 'commentaries',
  'перехресні посилання': 'cross-references',
  '{abbr} — {kind}, {items} (перетворено за {s} с)':
    '{abbr} — {kind}, {items} (converted in {s} s)',
  'Сегмент {file} пошкоджено при завантаженні (контрольна сума не збігається)':
    'The segment {file} was damaged in download (the checksum does not match)',
  'Помилка рушія бази': 'Database engine error',
  'Рушій бази зупинено': 'The database engine stopped',
  'Це не файл бази SQLite (очікується модуль MyBible .SQLite3 або сегмент .vodb / .vodb.gz)':
    'This is not an SQLite database file (expected a MyBible .SQLite3 module or a .vodb / .vodb.gz segment)',
  'Це не сегмент бібліотеки — модулі MyBible спершу перетворюються (convert)':
    'This is not a library segment — MyBible modules are converted first (convert)',
  // the control window (web/src/pages/Control.tsx)
  'Сервера немає — бібліотека працюватиме в браузері. Виберіть переклади в «Джерело даних».':
    'No server — the library will run in the browser. Choose translations under “Data source”.',
  'Показом керує інше вікно керування — натисніть «Взяти керування», щоб вести звідси':
    'Another control window runs the show — click “Take control” to run it from here',
  '«{query}» не знайдено. Спробуйте посилання, як-от «Ів 3:16», або слово з тексту':
    '“{query}” not found. Try a reference such as “John 3:16”, or a word from the text',
  'Не вдалося перейти: {error}': "Couldn't go there: {error}",
  'На екрані зі Стронгом: {ref}': "On screen with Strong's: {ref}",
  'На екрані: {ref}': 'On screen: {ref}',
  'Текст на екрані': 'Text on screen',
  'Уривок недоступний — переклад змінився. Оновіть елемент показу.':
    'The passage is unavailable — the translation changed. Update the running order item.',
  Уривок: 'Passage',
  'Додано у показ: {item}': 'Added to the running order: {item}',
  Пісня: 'Song',
  'Текст додано у показ': 'Text added to the running order',
  // «Зображення» (1.5.0)
  Зображення: 'Images',
  'Зображення додано у показ': 'Image added to the running order',
  Вписати: 'Fit',
  Заповнити: 'Fill',
  'Як зображення займає слайд': 'How the image takes the slide',
  'Додати…': 'Add…',
  'Додаю {n} з {of}…': 'Adding {n} of {of}…',
  'Не вдалося додати:': "Couldn't add:",
  'Видалити «{name}»?': 'Delete “{name}”?',
  'Воно зараз на екрані: застосунок прибере його з екрана.':
    'It is on screen now: the app takes it off the screen.',
  'Воно є в послідовності показу: {n} пункт.|Воно є в послідовності показу: {n} пункти.|Воно є в послідовності показу: {n} пунктів.':
    'It is in the running order: {n} item.|It is in the running order: {n} items.',
  'Воно є в програмах: {names}.': 'It is in the programs: {names}.',
  'Ці пункти лишаться з позначкою «Зображення видалено».':
    'Those items stay, marked “Image deleted”.',
  'Зображення видалено: {name}': 'Image deleted: {name}',
  Видалити: 'Delete',
  'Додано {n} зображення|Додано {n} зображення|Додано {n} зображень':
    'Added {n} image|Added {n} images',
  'Зображень ще немає. Натисніть «Додати…» і виберіть файли PNG, JPEG, WebP чи GIF.':
    'No images yet. Click “Add…” and choose PNG, JPEG, WebP, or GIF files.',
  'Показати «{name}»': 'Show “{name}”',
  'Додати в послідовність показу': 'Add to the running order',
  'Додати «{name}» в послідовність показу': 'Add “{name}” to the running order',
  'Видалити зображення': 'Delete the image',
  'Видалити «{name}»': 'Delete “{name}”',
  'Це не зображення PNG, JPEG, WebP чи GIF': 'This is not a PNG, JPEG, WebP, or GIF image',
  'Зображення завелике — до 40 МБ': 'The image is too large — up to 40 MB',
  'Зображення не знайдено — відкрийте список ще раз': 'Image not found — open the list again',
  'Зображення вже не повернути': 'The image can no longer be brought back',
  // Albums (1.8.12)
  'Папку не знайдено': 'Folder not found',
  'Альбом не знайдено — відкрийте список ще раз': 'Album not found — open the list again',
  'Виберіть папку на цьому комп’ютері': 'Choose a folder on this computer',
  'Фото вже немає в папці': 'The photo is no longer in the folder',
  'Фото «{name}» уже немає в папці — його перейменували чи видалили. Альбом прочитано знову.':
    'The photo “{name}” is no longer in the folder — it was renamed or deleted. The album has been read again.',
  'Фото в папці змінилося — відкрийте альбом ще раз':
    'The photo in the folder has changed — open the album again',
  'Мала копія має бути JPEG до 4 МБ': 'A small copy must be a JPEG of up to 4 MB',
  // Video (1.8.12-beta.3)
  'Відео не знайдено — відкрийте список ще раз': 'Video not found — open the list again',
  'Файлу відео вже немає': 'The video file is no longer there',
  'Файл відео змінився — відкрийте список ще раз':
    'The video file has changed — open the list again',
  'Файл не знайдено': 'File not found',
  'Це не відео MP4, MOV, WebM чи MKV, яке відтворює браузер':
    'This is not an MP4, MOV, WebM, or MKV video the browser plays',
  'Виберіть файл на цьому комп’ютері': 'Choose a file on this computer',
  Відео: 'Videos',
  'Відео на екрані': 'Video on screen',
  // One search (1.8.12-beta.4)
  'Пошук або посилання': 'Search or a reference',
  'Пошук: Ів 3:16, любов ({key})': 'Search: John 3:16, love ({key})',
  'Знайдено для «{query}»': 'Found for “{query}”',
  'У поточному перекладі нічого — знайдено в інших.':
    'Nothing in the current translation — found in others.',
  'також: {list}': 'also: {list}',
  'До поля пошуку': 'To the search field',
  'Курсор у полі пошуку вгорі — клавіша, якої браузер не забирає':
    "The cursor in the search field at the top — a key the browser doesn't take",
  'спершу в усіх': 'all first',
  'спершу в поточному': 'current first',
  'без повторів': 'no repeats',
  'курсор у пошук': 'cursor to search',
  'Одне поле вгорі: посилання — перехід, слова — результати під ним. Якщо в поточному перекладі нічого, застосунок шукає в інших.':
    'One field at the top: a reference goes there, words show results under it. When the current translation has nothing, the app searches the others.',
  'Де шукати слова спершу': 'Where to search words first',
  'У поточному перекладі (F3)': 'In the current translation (F3)',
  'В усіх перекладах бібліотеки (F4)': 'In every translation of the library (F4)',
  'Той самий вірш з різних перекладів — одним рядком':
    'The same verse from different translations — one row',
  'Курсор у пошук, коли повертаєтеся до вікна керування':
    'The cursor to search when you come back to the control window',
  'Поки поле порожнє, стрілки й PageUp/PageDown далі гортають вірші.':
    'While the field is empty, the arrows and PageUp/PageDown still step the verses.',
  'Браузер не може відтворити це відео. Збережіть його як MP4 (H.264) і додайте знову.':
    "The browser can't play this video. Save it as MP4 (H.264) and add it again.",
  'відео: ще {time}': 'video: {time} left',
  'Відео додано: {name}': 'Video added: {name}',
  'Тут немає ні папок, ні відео.': 'There are no folders or videos in here.',
  'Додати відео «{name}»': 'Add the video “{name}”',
  'Натисніть відео, щоб додати його.': 'Click a video to add it.',
  'У цій папці немає відео MP4, MOV, WebM чи MKV.':
    'This folder has no MP4, MOV, WebM, or MKV videos.',
  '{n} відео браузер не відтворить (AVI, WMV…) — збережіть його як MP4.|{n} відео браузер не відтворить (AVI, WMV…) — збережіть їх як MP4.|{n} відео браузер не відтворить (AVI, WMV…) — збережіть їх як MP4.':
    "{n} video the browser won't play (AVI, WMV…) — save it as MP4.|{n} videos the browser won't play (AVI, WMV…) — save them as MP4.",
  'Відео прибрано: {name}': 'Video removed: {name}',
  'Файл не знайдено: {name}': 'File not found: {name}',
  'Файл не знайдено: {path}': 'File not found: {path}',
  'Файл з іншого комп’ютера: {name}': 'A file from another computer: {name}',
  'Файл з іншого комп’ютера: {path}': 'A file from another computer: {path}',
  'Немає доступу до файлу: {name}': 'No access to the file: {name}',
  'після кінця — далі': 'after the end: next',
  'після кінця — чорний екран': 'after the end: black screen',
  'на телефонах — напис': 'phones: words',
  'на телефонах — кадр': 'phones: a frame',
  'Відео грає у вікні показу без звуку; звук іде з вікна керування.':
    'A video plays in the presentation window without sound; the sound comes from the control window.',
  'Після кінця відео': 'After a video ends',
  'Далі: наступний пункт послідовності чи наступне відео':
    'Next: the next item of the running order or the next video',
  'Телефони глядачів під час відео': "Viewers' phones during a video",
  'Кадр з відео': 'A frame of the video',
  'Напис «Відео на екрані»': 'The words “Video on screen”',
  'Відео з цього комп’ютера — без копій. Звук іде з цього вікна.':
    'Videos from this computer — no copies. The sound comes from this window.',
  'Оновити список відео': 'Refresh the video list',
  'Додати відео…': 'Add a video…',
  'Відео ще немає. Натисніть «Додати відео…» і виберіть файл MP4, MOV, WebM чи MKV.':
    'No videos yet. Click “Add a video…” and choose an MP4, MOV, WebM, or MKV file.',
  'Прибрати відео': 'Remove the video',
  'Прибрати відео «{name}»': 'Remove the video “{name}”',
  'Прибрати відео «{name}»?': 'Remove the video “{name}”?',
  'Файл лишиться на місці; додати його можна знову.':
    'The file stays where it is; you can add it again.',
  'Пункти послідовності показу й програм з ним лишаться з позначкою «Відео прибрано».':
    'Its items in the running order and programs stay, marked “Video removed”.',
  'Де відео зараз': 'Where the video is now',
  Повторювати: 'Repeat',
  'Гучність відео в цьому вікні': 'Video volume in this window',
  'Натисніть будь-де в цьому вікні, щоб увімкнути звук відео: браузер дає звук лише після кліку.':
    'Click anywhere in this window to turn the video sound on: the browser allows sound only after a click.',
  'Альбом ще завантажується': 'The album is still loading',
  'В альбомі немає фото': 'The album has no photos',
  'Це останнє фото': 'This is the last photo',
  'Це перше фото': 'This is the first photo',
  'Альбом прибрано: {name}': 'Album removed: {name}',
  'Папку не знайдено: {name}': 'Folder not found: {name}',
  'Папку не знайдено: {path}': 'Folder not found: {path}',
  'Папка з іншого комп’ютера: {path}': 'A folder from another computer: {path}',
  'Папка з іншого комп’ютера: {name}': 'A folder from another computer: {name}',
  'Немає доступу до папки: {name}': 'No access to the folder: {name}',
  'Немає доступу до папки: {path}': 'No access to the folder: {path}',
  // the system won't open a folder or a file (Mac check of 1.9.0, web/src/lib/denied.ts)
  'macOS не дає відкрити цю папку.': "macOS doesn't let the app open this folder.",
  'macOS не дає відкрити цей файл.': "macOS doesn't let the app open this file.",
  'Дозвольте доступ: Системні параметри → Приватність і безпека → Файли та папки (або «Повний доступ до диска») — для Термінала чи програми, що запускає VerseOrchestrator.':
    'Allow access: System Settings → Privacy & Security → Files & Folders (or Full Disk Access) — for Terminal or the app that starts VerseOrchestrator.',
  'Система не дає відкрити цю папку — перевірте права доступу.':
    "The system doesn't let the app open this folder — check its permissions.",
  'Система не дає відкрити цей файл — перевірте права доступу.':
    "The system doesn't let the app open this file — check its permissions.",
  'Потім натисніть «Оновити».': 'Then click “Refresh”.',
  'Або виберіть іншу папку.': 'Or choose another folder.',
  Альбоми: 'Albums',
  'Фото з папок на цьому комп’ютері — без копій: нові фото в папці з’являються самі.':
    'Photos from folders on this computer — no copies: new photos in a folder show up by themselves.',
  'Додати папку…': 'Add a folder…',
  'Альбомів ще немає. Натисніть «Додати папку…» і виберіть папку з фото.':
    'No albums yet. Click “Add a folder…” and choose a folder of photos.',
  'Відкрити альбом «{name}»': 'Open the album “{name}”',
  '{n} фото|{n} фото|{n} фото': '{n} photo|{n} photos',
  'Прибрати альбом': 'Remove the album',
  'Прибрати альбом «{name}»': 'Remove the album “{name}”',
  'Прибрати альбом «{name}»?': 'Remove the album “{name}”?',
  'Папка й фото лишаться на місці; додати її можна знову.':
    'The folder and the photos stay where they are; you can add it again.',
  'Пункти послідовності показу й програм з ним лишаться з позначкою «Альбом прибрано».':
    'Its items in the running order and programs stay, marked “Album removed”.',
  'Альбом додано: {name}': 'Album added: {name}',
  'Домашня папка ({name})': 'Home folder ({name})',
  Угору: 'Up',
  'Виберіть папку нижче або вставте шлях до неї': 'Choose a folder below or paste its path',
  'Шлях до папки': 'Folder path',
  'Тут немає вкладених папок.': 'There are no folders in here.',
  'У цій папці {n} фото|У цій папці {n} фото|У цій папці {n} фото':
    'This folder has {n} photo|This folder has {n} photos',
  'У цій папці немає фото — відкрийте папку, де вони лежать.':
    'This folder has no photos — open the folder they are in.',
  '{n} фото HEIC не покажуться — браузери їх не відкривають.|{n} фото HEIC не покажуться — браузери їх не відкривають.|{n} фото HEIC не покажуться — браузери їх не відкривають.':
    "{n} HEIC photo won't show — browsers can't open them.|{n} HEIC photos won't show — browsers can't open them.",
  'Додати цю папку': 'Add this folder',
  'До альбомів': 'Back to albums',
  Альбом: 'Album',
  'Попереднє фото (←)': 'Previous photo (←)',
  'Попереднє фото': 'Previous photo',
  'Наступне фото (→)': 'Next photo (→)',
  'Наступне фото': 'Next photo',
  'Міняти кожні': 'Change every',
  'Міняти фото кожні … секунд': 'Change the photo every … seconds',
  с: 's',
  Пуск: 'Start',
  'Оновити: фото, додані в папку': 'Refresh: photos added to the folder',
  'Оновити альбом': 'Refresh the album',
  'Папку «{path}» не знайдено. Під’єднайте диск чи флешку й натисніть «Оновити».':
    'Folder “{path}” not found. Connect the drive or the flash drive and click “Refresh”.',
  'Папку «{path}» додано на іншому комп’ютері — тут її немає. Відкрийте альбом там або додайте папку цього комп’ютера.':
    "The folder “{path}” was added on another computer and isn't here. Open the album there, or add a folder of this computer.",
  'У папці немає фото JPEG, PNG, WebP, GIF, AVIF чи BMP. Додайте їх туди й натисніть «Оновити».':
    'The folder has no JPEG, PNG, WebP, GIF, AVIF, or BMP photos. Add some there and click “Refresh”.',
  'Показано перші 5 000 фото.': 'The first 5,000 photos are shown.',
  // «Резервна копія» (1.5.0)
  'Резервна копія': 'Backup',
  'Один файл .zip: вигляд слайдів, пресети, клавіші, закладки й історія, послідовність показу й програми, пісні та зображення. Модулі, бібліотека й пульти в нього не входять.':
    "One .zip file: the slide look, presets, hotkeys, bookmarks and history, the running order and programs, songs, and images. Modules, the library, and remotes aren't in it.",
  'Зберегти копію': 'Save a backup',
  'Копію збережено: {name}': 'Backup saved: {name}',
  'Відновити з копії…': 'Restore from a backup…',
  'Відновити з копії': 'Restore from a backup',
  'Копія від {when}, версії {app}:': 'A backup of {when}, version {app}:',
  'вигляд, клавіші, закладки й історія': 'the look, hotkeys, bookmarks, and history',
  '{n} програма|{n} програми|{n} програм': '{n} program|{n} programs',
  '{n} пункт у послідовності|{n} пункти в послідовності|{n} пунктів у послідовності':
    '{n} item in the running order|{n} items in the running order',
  'пісні: {bundles}': 'songs: {bundles}',
  'пісень немає': 'no songs',
  '{n} зображення|{n} зображення|{n} зображень': '{n} image|{n} images',
  'Вони замінять поточні. Поточні збережуться окремо — їх можна буде повернути тут само.':
    'They replace the current ones. The current ones are kept apart — you can bring them back right here.',
  Відновити: 'Restore',
  'Відновлено. Вікно перезавантажується…': 'Restored. The window reloads…',
  'Відновлено {at} з копії від {when}.': 'Restored on {at} from a backup of {when}.',
  'Повернути як було': 'Go back to how it was',
  'Повернуто як було. Вікно перезавантажується…': 'Back to how it was. The window reloads…',
  'Це не резервна копія VerseOrchestrator або файл пошкоджено':
    'This is not a VerseOrchestrator backup, or the file is damaged',
  'Спершу виберіть файл копії ще раз': 'Choose the backup file again first',
  'Повертати вже нічого': 'There is nothing to go back to',
  'Повернеться стан до відновлення. Те, що змінено після нього, буде замінено, але збережеться окремо в папці data/backups/.':
    'The state before the restore comes back. What was changed after it is replaced, but kept apart in the data/backups/ folder.',
  'Налаштування й програми замінено з резервної копії.':
    'Settings and programs were replaced from a backup.',
  'Копія завелика: понад 1 ГБ. Приберіть частину зображень і збережіть ще раз.':
    'The backup is too large: over 1 GB. Remove some images and save again.',
  'Зачекайте, доки збережеться чи відновиться резервна копія, і спробуйте ще раз':
    'Wait until the backup is saved or restored, then try again',
  'Не вдалося відновити: {error}. Закрийте програми, що тримають файли в data/, і спробуйте ще раз.':
    "Couldn't restore: {error}. Close the programs that hold files in data/ and try again.",
  'Не вдалося повернути: {error}. Закрийте програми, що тримають файли в data/, і спробуйте ще раз.':
    "Couldn't go back: {error}. Close the programs that hold files in data/ and try again.",
  '«{query}» — не місце в книзі. Введіть вірш або розділ:вірш, як-от 3:16':
    '“{query}” is not a place in the book. Type a verse, or chapter:verse, like 3:16',
  'Спершу виберіть книгу': 'Choose a book first',
  '{book}: розділу {n} немає': '{book}: there is no chapter {n}',
  '{place}: вірша {n} немає': '{place}: there is no verse {n}',
  'Enter — перейти · {show} — на екран · Esc — скасувати':
    'Enter — go · {show} — to screen · Esc — cancel',
  'Текст ще не завантажився — натисніть «На екран» ще раз':
    'The text hasn’t loaded yet — press “To screen” again',
  'Спершу виберіть розділ': 'Choose a chapter first',
  'У цьому розділі немає віршів': 'This chapter has no verses',
  'Це остання сторінка': 'This is the last page',
  'Це перша сторінка': 'This is the first page',
  'QR для глядачів': 'QR for viewers',
  'На екрані нічого ховати': 'Nothing on screen to hide',
  'Текст сховано — фон лишається': 'Text hidden — the background stays',
  'Текст знову на екрані': 'Text back on screen',
  'Чорний екран знято': 'Black screen off',
  'Показом керує інше вікно керування': 'Another control window runs the show',
  'На екрані не пісня — ховати нічого': 'No song on screen — nothing to hide',
  Пульт: 'Remote',
  'Цього елемента вже немає в послідовності': 'This item is no longer in the running order',
  'Нічого додати': 'Nothing to add',
  'Не вибрано вірш': 'No verse selected',
  'Уривок недоступний': 'The passage is unavailable',
  'Такої строфи немає': 'No such stanza',
  'Пульт «{remote}» додав у показ: {item}': 'Remote “{remote}” added to the running order: {item}',
  'У передпоказі нічого немає': 'Nothing in the preview',
  'Уже на екрані': 'Already on screen',
  'Пульт «{remote}»: {command}': 'Remote “{remote}”: {command}',
  'не виконано': 'not done',
  пульт: 'remote',
  'Запропоновано: «{remote}»': 'Suggested: “{remote}”',
  'не доставлено': 'not delivered',
  'Немає зв’язку з сервером': 'No connection to the server',
  'Вікно показу відкрито': 'Presentation window opened',
  'Не вдалося відкрити вікно (перевірте блокувальник)':
    "Couldn't open the window (check the pop-up blocker)",
  'Вікно сцени відкрито': 'Stage window opened',
  'Текст сховано': 'Text hidden',
  'На екрані': 'On screen',
  Порожньо: 'Empty',
  'Показати вибір': 'Show the selection',
  'Сховати / показати текст': 'Hide / show text',
  'Прибрати з екрана': 'Take off the screen',
  'Додати уривок у показ': 'Add the passage to the running order',
  'Послідовність показу': 'Running order',
  'Власний текст': 'Custom text',
  'Відкрити вікно показу': 'Open the presentation window',
  Сцена: 'Stage',
  'Глядачі (QR)': 'Viewers (QR)',
  'Пульт доповідача': 'Speaker remote',
  'Вікна виводу': 'Output windows',
  'Налаштування вигляду': 'Settings',
  'Наживо: вимкнути': 'Live: turn off',
  'Наживо: увімкнути': 'Live: turn on',
  'Світла тема': 'Light theme',
  'Темна тема': 'Dark theme',
  'Імпортовано записів: {n}': 'Entries imported: {n}',
  'Не вдалося прочитати файл закладок. Потрібен .json, збережений кнопкою «Експорт»':
    "Couldn't read the bookmarks file. It needs a .json saved with the “Export” button",
  Навігація: 'Navigation',
  Пошук: 'Search',
  'У поточному перекладі; {combo} — в усіх': 'In the current translation; {combo} — in all',
  Вікна: 'Windows',
  'Вихідне вікно для другого монітора чи проєктора':
    'The output window for a second monitor or a projector',
  'Вікно показу': 'Presentation window',
  'Монітор доповідача: зараз, далі, годинник': "The speaker's monitor: now, next, clock",
  'Вікна виводу: відкрито {n}': 'Output windows: {n} open',
  'Екрани, відкриті вікна показу й сцени, розкладка':
    'Screens, open presentation and stage windows, layout',
  'Глядачі: трансляція увімкнена, на зв’язку {n}': 'Viewers: broadcasting, {n} connected',
  Глядачі: 'Viewers',
  'QR, щоб глядачі стежили за текстом з телефона':
    'A QR code so viewers can follow the text on their phones',
  'Телефон-пульт за QR: гортати показ без доступу до налаштувань':
    'A phone as a remote by QR code: step through the show without access to the settings',
  'Вихід на екран': 'Output to screen',
  'Увімкнено: екран одразу повторює вибір. Вимкнено: лише прев’ю, показ кнопкою «На екран»':
    'On: the screen follows the selection at once. Off: the preview only; show with “To screen”',
  Наживо: 'Live',
  'Показати текст': 'Show text',
  'Повернути той самий слайд': 'Bring the same slide back',
  'Зняти чорний екран': 'Turn off black screen',
  'Повернути те, що було': 'Bring back what was there',
  'Шрифт, кольори, шаблон слайда, пресети, клавіші': 'Font, colors, slide template, presets, keys',
  'Панель показу': 'Preview panel',
  Ще: 'More',
  'Кнопки, які не вмістилися у вікні': "Buttons that don't fit in the window",
  '(відкрито)': '(open)',
  'Ширина бічної панелі': 'Side panel width',
  'Фільтр книг…': 'Filter books…',
  'Позначте переклад угорі, щоб побачити його книги': 'Check a translation above to see its books',
  'Немає книг, що збігаються з «{filter}»': 'No books match “{filter}”',
  'У цьому перекладі немає книг': 'This translation has no books',
  'Висота історії': 'History height',
  Історія: 'History',
  Збережене: 'Saved',
  Експорт: 'Export',
  Імпорт: 'Import',
  'Тут з’являтимуться місця, які ви відкривали': 'Places you open will appear here',
  'Збережіть вірш кнопкою-закладкою над прев’ю':
    'Save a verse with the bookmark button above the preview',
  'Показом керує інше вікно керування. Тут можна готувати наступне — на екран іде лише звідти.':
    'Another control window runs the show. You can prepare what comes next here — only that window puts it on screen.',
  'Взяти керування': 'Take control',
  'Застосунок вимкнено: пульти й телефони глядачів відключено, вікна виводу закрито.':
    "The app is switched off: remotes and viewers' phones are disconnected, and the output windows are closed.",
  'Немає зв’язку із сервером застосунку: пульти й телефони глядачів зараз не чують цього вікна, вікна виводу працюють далі. Перевірте, чи запущено застосунок, — зв’язок відновиться сам.':
    "No connection to the app's server: remotes and viewers' phones can't hear this window now; the output windows keep working. Check that the app is running — the connection comes back by itself.",
  'Пульти й телефони глядачів слухають вікно керування в іншому браузері. Звідси показ іде лише на вікна виводу цього браузера.':
    "Remotes and viewers' phones listen to the control window in another browser. From here the show reaches only this browser's output windows.",
  'Слухати тут': 'Listen here',
  'Вікно керування перейшло в {browser}. Звідси показ іде лише на вікна виводу цього браузера.':
    "The control window moved to {browser}. From here the show reaches only this browser's output windows.",
  'Оберіть книгу': 'Choose a book',
  'Що зараз на екрані показу': "What's on the presentation screen now",
  'Попередня сторінка': 'Previous page',
  'Сторінка довгого уривка (← → або PageUp/PageDown)':
    'Page of a long passage (← → or PageUp/PageDown)',
  'Наступна сторінка': 'Next page',
  Розділи: 'Chapters',
  'Оберіть книгу ліворуч — відкриється її перший розділ.':
    'Choose a book on the left — its first chapter opens.',
  'Оберіть розділ угорі.': 'Choose a chapter above.',
  'У цьому розділі немає віршів у головному перекладі.':
    'This chapter has no verses in the main translation.',
  'Ширина правої панелі': 'Right panel width',
  'Висота панелі показу': 'Preview panel height',
  'Програму оновлено: {name}': 'Program updated: {name}',
  'Програму збережено: {name}': 'Program saved: {name}',
  'Відкрито програму: {name}': 'Program opened: {name}',
  // control window parts (ResizeHandle, FloatingPanel, RefList, TranslationPicker, lib/*, api.ts)
  '{handle}: тягніть; подвійний клік скидає': '{handle}: drag; double-click resets',
  Закрити: 'Close',
  'Змінити розмір панелі (стрілки; подвійний клік — типовий розмір)':
    'Resize the panel (arrow keys; double-click — default size)',
  'Змінити розмір': 'Resize',
  Прибрати: 'Remove',
  'Фільтр перекладів…': 'Filter translations…',
  'Головний переклад': 'Main translation',
  'Зробити головним': 'Make it the main one',
  'Нічого не знайдено': 'Nothing found',
  'Вікно керування ще не готове': 'The control window is not ready yet',
  'Не вдалося': 'Failed',
  'розділ {n}': 'chapter {n}',
  'Кінець розділу. Натисніть «Далі» ще раз — {place}':
    'End of the chapter. Press “Next” again — {place}',
  'Початок розділу. Натисніть «Назад» ще раз — {place}':
    'Start of the chapter. Press “Back” again — {place}',
  'Кінець пункту. Натисніть «Далі» ще раз — {item}': 'End of the item. Press “Next” again — {item}',
  'Початок пункту. Натисніть «Назад» ще раз — {item}':
    'Start of the item. Press “Back” again — {item}',
  'Це останній вірш перекладу': 'This is the translation’s last verse',
  'Кінець книги. Натисніть «Далі» ще раз — {place}':
    'End of the book. Press “Next” again — {place}',
  'Початок книги. Натисніть «Назад» ще раз — {place}':
    'Start of the book. Press “Back” again — {place}',
  'Це перший вірш перекладу': 'This is the translation’s first verse',
  'Це фото HEIC (так знімає iPhone), і браузер його не відкриває: збережіть його як JPEG і додайте ще раз':
    'This is a HEIC photo (iPhones take them), and the browser can’t open it: save it as JPEG and add it again',
  'Не вдалося прочитати зображення': "Couldn't read the image",
  'сервер недоступний. Перевірте вікно, де запущено застосунок (start.cmd, start.sh або npm run dev)':
    "the server can't be reached. Check the window where the app runs (start.cmd, start.sh, or npm run dev)",
  'сервер відповів помилкою {status}': 'the server answered with error {status}',
  'сервер недоступний. Перевірте, чи запущено застосунок (start.cmd / start.command / ./start.sh)':
    "the server can't be reached. Check that the app is running (start.cmd / start.command / ./start.sh)",
  'Сегментів немає ні на сервері, ні поруч із застосунком':
    'No segments on the server or next to the app',
  'Пісню не знайдено': 'Song not found',
  'Вибір віршів': 'Choosing verses',
  Послідовність: 'Running order',
  'У послідовність': 'To the running order',
  Імпортований: 'Imported',
  // search (web/src/components/SearchPanel.tsx)
  'Пошук: «любов», «Ів 3:16», «"світло життя"», «-темрява», «G2424»':
    'Search: love, John 3:16, "light of life", -darkness, G2424',
  'Поточний (F3)': 'Current (F3)',
  'Усі (F4)': 'All (F4)',
  'Закрити пошук': 'Close search',
  'Можливо:': 'Did you mean:',
  // songs (web/src/components/SongsPanel.tsx)
  'Пісня ще завантажується': 'The song is still loading',
  'Кінець пісні': 'End of the song',
  'Це остання строфа': 'This is the last stanza',
  'Це перша строфа': 'This is the first stanza',
  'Назад до пошуку': 'Back to search',
  'Додати у показ': 'Add to the running order',
  'Точний показ': 'As in the file',
  'Простий текст': 'Plain text',
  Заголовок: 'Title',
  'Куплет {n}': 'Stanza {n}',
  'Введіть назву': 'Type a name',
  'Бандл із такою назвою вже є': 'A bundle with this name already exists',
  'Бандл «{bundle}» повернуто': 'The bundle “{bundle}” is back',
  'Цей бандл наповнює папка «{folder}»: поки там лежать файли .pptx, він з’явиться знову під час наступного запуску.':
    'The “{folder}” folder fills this bundle: while it holds .pptx files, the bundle comes back at the next start.',
  'Нова назва бандла': 'The bundle’s new name',
  Перейменувати: 'Rename',
  'Перейменувати бандл «{bundle}»': 'Rename the bundle “{bundle}”',
  'Видалити бандл': 'Delete the bundle',
  'Видалити бандл «{bundle}»': 'Delete the bundle “{bundle}”',
  'Бандли пісень': 'Song bundles',
  'Перейменування не змінює пісень: послідовності показу знаходять їх і далі. Видалений бандл можна повернути, доки відкритий цей список.':
    'Renaming doesn’t change the songs: running orders still find them. A deleted bundle can be brought back while this list is open.',
  'Бандлів ще немає. Щоб додати пісні з файлів .pptx, відкрийте «Імпорт пісень».':
    'No bundles yet. To add songs from .pptx files, open “Import songs”.',
  'Бандли пісень: перейменувати, видалити': 'Song bundles: rename, delete',
  'Імпорт скасовано': 'Import undone',
  'Назва бандла — від 1 до 100 символів': 'A bundle’s name is 1 to 100 characters',
  'Бандл «{bundle}» уже є — виберіть іншу назву':
    'The bundle “{bundle}” already exists — choose another name',
  'Бандл не знайдено — відкрийте список ще раз': 'Bundle not found — open the list again',
  'Бандл уже не повернути': 'The bundle can no longer be brought back',
  'Імпорт уже не скасувати': 'The import can no longer be undone',
  'Повернуто версію {to} замість {from} ({when}).':
    'Went back to version {to} from {from} ({when}).',
  'Повернути версію {to} не вдалося.': "Couldn't go back to version {to}.",
  'Попередня версія {version} лишилася в папці застосунку.':
    'The previous version, {version}, is kept in the app’s folder.',
  'Повернути версію {version}': 'Go back to version {version}',
  'Застосунок перезапуститься з версією {version}: це займе до хвилини. Версія {current} лишиться поруч — до неї можна повернутися тут само.':
    'The app restarts as version {version}: it takes up to a minute. Version {current} stays next to it — you can come back to it right here.',
  'Застосунок перезапуститься з версією {version}: це займе до хвилини. Версія {version} ще не вміє повертати версії: щоб знову перейти на {current}, оновіться в «Оновлення» — потрібен інтернет.':
    'The app restarts as version {version}: it takes up to a minute. Version {version} can’t go back to another version yet: to switch to {current} again, update in “Updates” — this needs the internet.',
  'Зачекайте, доки оновлення розпакується': 'Wait until the update is unpacked',
  'Завантаження оновлення зупиниться.': 'The update download stops.',
  'Застосунок уже перезапускається': 'The app is already restarting',
  'Попередньої версії немає': 'There is no previous version',
  'Попередня версія не запустилася — працює та, що була':
    "The previous version didn't start — the one before it runs",
  Заставка: 'Cover',
  логотип: 'logo',
  текст: 'text',
  'порожня — лише фон': 'empty — the background only',
  'Між елементами показу: логотип і рядок тексту на фоні слайда. Клавіша {key} чи кнопка «Заставка» вгорі показує її; ще раз — повертає те, що було.':
    'Between the items of a show: a logo and a line of text on the slide’s background. The {key} key or the “Cover” button at the top shows it; again — brings back what was there.',
  'Текст заставки': 'Cover text',
  'Наприклад, назва зібрання': 'For example, the gathering’s name',
  Логотип: 'Logo',
  'Прибрати логотип': 'Remove the logo',
  'Логотип і текст між елементами; ще раз — те, що було':
    'A logo and text between items; again — what was there',
  'Заставка поки порожня — лише фон. Додайте логотип чи текст: Налаштування вигляду → Заставка':
    'The cover is empty for now — the background only. Add a logo or text: Settings → Cover',
  'Прибрати заставку': 'Remove the cover',
  // «Відлік» (1.5.0)
  Відлік: 'Countdown',
  'Починаємо за': 'Starting in',
  'Цей час уже минув': 'This time has already passed',
  'Відлік: {time}': 'Countdown: {time}',
  '«Заставка» з часом до початку: «Починаємо за 5:00»':
    'The cover with the time to the start: “Starting in 5:00”',
  'Відлік на екрані': 'Countdown on screen',
  '−1 хв': '−1 min',
  '+1 хв': '+1 min',
  'Лишити заставку без часу': 'Keep the cover without the time',
  'Прибрати відлік': 'Remove the countdown',
  'Після нуля': 'After zero',
  'У мінус': 'Overtime',
  'Стоп на 0:00': 'Stop at 0:00',
  'Прибрати час': 'Hide time',
  'Час вийшов: іде перевищення.': 'Time is up: counting overtime.',
  'Відлік дійшов до нуля: далі йде перевищення.':
    'The countdown reached zero: now counting overtime.',
  'Відлік дійшов до 0:00: час лишається на екрані.':
    'The countdown reached 0:00: the time stays on screen.',
  'Відлік скінчився: заставка лишається на екрані.':
    'The countdown has ended: the cover stays on screen.',
  Скільки: 'How long',
  '{n} хв': '{n} min',
  'до…': 'until…',
  'До котрої години': 'Until what time',
  'Напис біля часу': 'Words with the time',
  'Показати: {caption} {time}': 'Show: {caption} {time}',
  'Показати відлік': 'Show the countdown',
  'Логотип і текст над часом — із розділу «Заставка» в налаштуваннях вигляду.':
    'The logo and text over the time come from the “Cover” section of the settings.',
  // 1.8.1: any length, a pause, a key of its own
  Тривалість: 'Length',
  'Хвилини або хв:сс': 'Minutes or min:sec',
  'Від 0:01 до 12:00:00, наприклад 7 або 7:30': 'From 0:01 to 12:00:00, for example 7 or 7:30',
  Пауза: 'Pause',
  Продовжити: 'Resume',
  'На паузі: час на екрані стоїть.': 'Paused: the time on screen stands still.',
  'Відлік: {time}, пауза': 'Countdown: {time}, paused',
  'Відлік: пауза / далі': 'Countdown: pause / resume',
  'Відлік на екрані — пауза або далі; без нього — новий, на час, вибраний у «Відлік»':
    'Pauses or resumes the countdown on screen; with none, starts one of the length last chosen in Countdown',
  'Відлік: пауза': 'Countdown paused',
  'Відлік іде далі': 'Countdown resumed',
  // 1.8.2: the time's colours (Налаштування вигляду → Відлік)
  'попередження за {n} хв': 'a warning {n} min before',
  'колір після нуля': 'a color past zero',
  'звичайний вигляд': 'the usual look',
  // 1.8.3: the time's look
  'свій вигляд часу': 'a custom time look',
  'Розмір часу': 'Time size',
  Менший: 'Smaller',
  Звичайний: 'Normal',
  Більший: 'Larger',
  Найбільший: 'Largest',
  'Шрифт часу': 'Time font',
  'Як у тексті': 'As the text',
  Моноширинний: 'Monospaced',
  'Як писати час': 'Time format',
  '5 хв, секунди — в останню хвилину': '5 min, seconds in the last minute',
  Напис: 'Words',
  'Над часом': 'Above the time',
  'Під часом': 'Below the time',
  'Без напису': 'No words',
  // 1.8.7: the viewers' countdown in a corner
  'Де показати': 'Where to show',
  'На заставці': 'On the cover',
  'У кутку': 'In a corner',
  'Відлік у кутку': 'Countdown in a corner',
  'Відлік у кутку скінчився.': 'The countdown in the corner has ended.',
  'Показати в кутку: {time}': 'Show in a corner: {time}',
  'У кутку — лише час, поверх того, що на екрані; кут — у налаштуваннях вигляду.':
    'In a corner: the time alone, over what is on screen; the corner is in the appearance settings.',
  'Кут для відліку': 'Countdown corner',
  'Коли відлік показують у кутку, поверх слайда':
    'When the countdown is shown in a corner, over the slide',
  'Угорі праворуч': 'Top right',
  'Угорі ліворуч': 'Top left',
  'Унизу праворуч': 'Bottom right',
  'Унизу ліворуч': 'Bottom left',
  'Розмір у кутку': 'Size in the corner',
  // 1.8.5: the last seconds aloud
  'Звук останніх 5 секунд': 'Sound for the last 5 seconds',
  звук: 'sound',
  '5, 4, 3, 2, 1 — короткий звук, на нулі — довший; грає вікно керування':
    '5, 4, 3, 2, 1 — a short tone, at zero a longer one; the control window plays it',
  // 1.8.4: a speaker's timer on «Сцена»
  'Таймер доповідача': 'Speaker timer',
  'Таймер доповідача: {time}': 'Speaker timer: {time}',
  'Таймер доповідача: {time}, пауза': 'Speaker timer: {time}, paused',
  'Час для доповідача — у вікні «Сцена» і на пульті-телефоні':
    'Time for the speaker — in the Stage window and on their phone remote',
  'Таймер на «Сцені»': 'Timer on Stage',
  'На паузі: час на «Сцені» стоїть.': 'Paused: the time on Stage stands still.',
  'Прибрати таймер': 'Remove the timer',
  'Час бачить лише доповідач — у вікні «Сцена» і на пульті-телефоні; глядачі його не бачать.':
    'Only the speaker sees the time — in the Stage window and on their phone remote; the audience doesn’t.',
  'Запустити на «Сцені»: {time}': 'Start on Stage: {time}',
  'Запустити на «Сцені»': 'Start on Stage',
  'Тут — те, що бачать глядачі. Таймер доповідача має свій розділ нижче.':
    'This is what the viewers see. The speaker timer has a section of its own below.',
  'Час, який бачить лише доповідач — у вікні «Сцена» і на пульті-телефоні. Глядачів ці налаштування не стосуються.':
    'The time only the speaker sees — in the Stage window and on their phone remote. These settings don’t touch the viewers.',
  'Час відліку на екрані, у «Сцені» й на телефонах змінює колір перед кінцем і після нуля.':
    'The countdown time on screen, in Stage, and on the phones changes color before the end and past zero.',
  Попередження: 'Warning',
  'Без попередження': 'No warning',
  'За {n} хв до кінця': '{n} min before the end',
  'Колір попередження': 'Warning color',
  'Інший колір після нуля': 'Another color past zero',
  'Колір після нуля': 'Color past zero',
  // 1.4.1: the logo and the settings' storage (SettingsPanel, lib/settingsSaveNotice.ts)
  'PNG, JPEG або WebP; для чіткого показу — від 1600 пікселів по довшому боці.':
    'PNG, JPEG, or WebP; for a sharp picture, 1600 pixels or more on the longer side.',
  'Виберіть файл PNG, JPEG або WebP. Фото HEIC з iPhone спершу збережіть як JPEG':
    "Choose a PNG, JPEG, or WebP file. Save an iPhone's HEIC photo as JPEG first",
  'Не вдалося зберегти налаштування: у сховищі браузера бракує місця. Виберіть менше зображення або приберіть фон чи логотип (Налаштування вигляду)':
    "Couldn't save the settings: the browser's storage is full. Choose a smaller image or remove the background or the logo (Settings)",
  Приспів: 'Chorus',
  'Приспів {n}': 'Chorus {n}',
  'До приспіву': 'To the chorus',
  'У відкритій пісні: найближчий приспів — одразу на екран':
    'In the open song: the nearest chorus, straight on screen',
  'У цій пісні немає приспіву': 'This song has no chorus',
  'Далі в пісні приспіву немає': 'No chorus further on in this song',
  Кінець: 'End',
  'Порожній слайд: текст сховано, фон лишається':
    'An empty slide: the text hidden, the background stays',
  'Пісня: номер або назва': 'Song: number or title',
  'Бандл пісень': 'Song bundle',
  'Усі бандли': 'All bundles',
  'Імпорт пісень з файлів .pptx': 'Import songs from .pptx files',
  'Імпорт пісень': 'Import songs',
  'Пісень ще немає. Щоб додати їх з файлів .pptx, натисніть «Імпорт пісень» праворуч від пошуку.':
    'No songs yet. To add them from .pptx files, click “Import songs” to the right of the search.',
  // song import (web/src/components/SongImport.tsx)
  'Файлів .pptx тут немає — виберіть інші файли або папку':
    'No .pptx files here — choose other files or another folder',
  'Імпортовано в «{bundle}»: нових {added}, оновлено {updated}':
    'Imported into “{bundle}”: {added} new, {updated} updated',
  'Не вдалося імпортувати: {error}': "Couldn't import: {error}",
  Звідки: 'From',
  'Файли .pptx…': '.pptx files…',
  'Папка…': 'Folder…',
  'Читаю файли: {done} з {total}': 'Reading files: {done} of {total}',
  'Знайдено {n} пісню.|Знайдено {n} пісні.|Знайдено {n} пісень.':
    'Found {n} song.|Found {n} songs.',
  'Пісень у цих файлах немає.': 'No songs in these files.',
  'Пропущено (не прочиталися або без тексту): {files}':
    'Skipped (unreadable or without text): {files}',
  'і ще {n}': 'and {n} more',
  Куди: 'To',
  'Новий бандл…': 'New bundle…',
  'Виберіть бандл': 'Choose a bundle',
  'Назва нового бандла': 'New bundle name',
  'Наприклад, Молодіжні': 'For example, Youth',
  'Бандл «{bundle}» уже є — виберіть його в списку «Куди»':
    'The bundle “{bundle}” already exists — choose it in the “To” list',
  'Пісня з такою самою назвою файлу, що вже є в бандлі, замінюється новою.':
    'A song whose file name is already in the bundle is replaced by the new one.',
  'Джерело даних — «у браузері»: пісні з’являться тут після перезбирання сегментів (npm run build:segments). З джерелом «Сервер» вони видні одразу.':
    'The data source is “In the browser”: the songs appear here after the segments are rebuilt (npm run build:segments). With the “Server” source they show at once.',
  'Імпортувати {n} пісню|Імпортувати {n} пісні|Імпортувати {n} пісень':
    'Import {n} song|Import {n} songs',
  Імпортувати: 'Import',
  // custom text (web/src/components/TextPanel.tsx)
  'Текст на екран': 'Text to screen',
  'Заголовок (необов’язково)': 'Title (optional)',
  'Текст слайда — оголошення, примітка, довільний текст…':
    'Slide text — an announcement, a note, any text…',
  'У показ': 'To the running order',
  Нещодавні: 'Recent',
  'Прибрати зі списку': 'Remove from the list',
  // running order (web/src/components/PlaylistPanel.tsx)
  'Видалити програму {name}': 'Delete the program {name}',
  'Видалено: {name}': 'Deleted: {name}',
  'Попередній елемент показу': 'Previous running order item',
  'Програми (зберегти / відкрити)': 'Programs (save / open)',
  Програми: 'Programs',
  'Очистити показ': 'Clear the running order',
  'Назва програми': 'Program name',
  'Відкрито: {name}': 'Opened: {name}',
  'Повернути список, який був до цієї програми': 'Bring back the list from before this program',
  'Показ очищено: {n} елемент.|Показ очищено: {n} елементи.|Показ очищено: {n} елементів.':
    'Running order cleared: {n} item.|Running order cleared: {n} items.',
  'Порожньо. Додавайте уривки, пісні й текст кнопкою «+ у показ».':
    'Empty. Add passages, songs, and text with the “+ to the running order” button.',
  Перетягнути: 'Drag',
  Вгору: 'Up',
  Вниз: 'Down',
  // the aside: preview, Strong, context (StudyPanels, StrongView, StudyContext, ConcordancePanel)
  'Прибрати зі збереженого': 'Remove from saved',
  'Запропонувати пульту «{remote}»': 'Suggest to the remote “{remote}”',
  'Запропонувати пульту': 'Suggest to a remote',
  'пульт «{remote}»': 'remote “{remote}”',
  'Прев’ю': 'Preview',
  'оберіть вірші': 'choose verses',
  'На екран: передпоказ пульта «{remote}»': 'To screen: the preview of the remote “{remote}”',
  'Перейти сюди у своєму виборі': 'Go there in your own selection',
  'Перейти до передпоказу пульта «{remote}»': 'Go to the preview of the remote “{remote}”',
  'Сховати до наступного вибору на пульті': 'Hide until the next choice on the remote',
  'Сховати передпоказ пульта': "Hide the remote's preview",
  Стронг: "Strong's",
  Контекст: 'Context',
  Вигляд: 'Appearance',
  'Відкріпити прев’ю': 'Unpin the preview',
  'Закріпити прев’ю знизу': 'Pin the preview at the bottom',
  'Закріпити прев’ю': 'Pin the preview',
  'Оберіть вірші у списку.': 'Choose verses in the list.',
  'Номери Стронга': "Strong's numbers",
  'Контекст вірша': 'Verse context',
  'Оберіть вірш у списку.': 'Choose a verse in the list.',
  'Стронг {n}': "Strong's {n}",
  'Без номерів Стронга — доступний лише словник по слову.':
    "No Strong's numbers — only the dictionary by word is available.",
  'На екран зі Стронгом': "To screen with Strong's",
  'Немає статті для {n}. Додайте словник Стронга в папку modules/ і натисніть «Пересканувати модулі» (Налаштування вигляду → Застосунок).':
    "No entry for {n}. Add a Strong's dictionary to the modules/ folder and click “Rescan modules” (Settings → App).",
  'У словниках нічого не знайдено для цього слова.':
    'Nothing found in the dictionaries for this word.',
  'Де ще вживається · Стронг {n}': "Where else it is used · Strong's {n}",
  'Перехресні посилання': 'Cross-references',
  'Немає перехресних посилань. Додайте модуль {module} у папку modules/ і натисніть «Пересканувати модулі» (Налаштування вигляду → Застосунок).':
    'No cross-references. Add a {module} module to the modules/ folder and click “Rescan modules” (Settings → App).',
  Коментарі: 'Commentaries',
  'Немає коментарів для цього вірша.': 'No commentaries for this verse.',
  'Цей переклад': 'This translation',
  Усі: 'All',
  'Показано перші {shown} із {total}.': 'Showing the first {shown} of {total}.',
  'Немає входжень.': 'No occurrences.',
  // command palette (web/src/components/CommandPalette.tsx)
  Перейти: 'Go to',
  'Перейти: {query}': 'Go to: {query}',
  Дії: 'Actions',
  Книги: 'Books',
  'Команда, книга, пісня або посилання…': 'A command, a book, a song, or a reference…',
  '↑↓ — вибір · Enter — виконати · Esc — закрити': '↑↓ — choose · Enter — run · Esc — close',
  '{n} результат|{n} результати|{n} результатів': '{n} result|{n} results',
  // output windows (OutputsPanel, Presenter, Stage, lib/screens, lib/outputs)
  'Відкрите з іншого вікна керування: на весь екран його переведе F або клік у самому вікні':
    'Opened from another control window: F or a click in the window itself makes it full screen',
  'Вікно не озвалося — можливо, браузер його заблокував: дозвольте спливні вікна для цього сайту':
    "The window didn't answer — the browser may have blocked it: allow pop-ups for this site",
  '{window}: вкладка, а не окреме вікно': '{window}: a tab, not a window of its own',
  'Браузер відкрив його вкладкою цього вікна, тож на інший екран його не перенести. Перетягніть вкладку за межі вікна браузера — вона стане окремим вікном. У LibreWolf і Firefox можна відкривати такі вікна окремо завжди: about:config → browser.link.open_newwindow.restriction = 2.':
    "The browser opened it as a tab of this window, so it can't go to another screen. Drag the tab out of the browser window — it becomes a window of its own. In LibreWolf and Firefox you can always get such windows separately: about:config → browser.link.open_newwindow.restriction = 2.",
  'Браузер заблокував вікно — дозвольте спливні вікна для цього сайту':
    'The browser blocked the window — allow pop-ups for this site',
  'Цей браузер не передає жест іншому вікну — натисніть F у самому вікні':
    "This browser doesn't pass the gesture to another window — press F in the window itself",
  '{window}: не вдалося перейти на весь екран': "{window}: couldn't go full screen",
  'Браузер не дозволив. Натисніть F у самому вікні або клацніть у ньому.':
    'The browser refused. Press F in the window itself, or click in it.',
  '{window}: уже не на весь екран': '{window}: no longer full screen',
  'Браузер так робить, коли у вікні керування відкрито вибір файлу. Клацніть будь-де у вікні керування — і «{window}» знову стане на весь екран. Або натисніть F у самому «{window}».':
    'The browser does this while a file chooser is open in the control window. Click anywhere in the control window and “{window}” goes full screen again. Or press F in “{window}” itself.',
  'Браузер так робить, коли у вікні керування відкрито вибір файлу. Натисніть F у самому «{window}» або клацніть у ньому.':
    'The browser does this while a file chooser is open in the control window. Press F in “{window}” itself, or click in it.',
  '{window} не закрилося — браузер не дозволяє закрити його звідси. Закрийте вручну':
    "{window} didn't close — the browser won't let it be closed from here. Close it by hand",
  'Розкладку збережено: {n} вікно|Розкладку збережено: {n} вікна|Розкладку збережено: {n} вікон':
    'Layout saved: {n} window|Layout saved: {n} windows',
  'Відкрито вікон: {n}': 'Windows opened: {n}',
  'Відкрито {ok} з {total}: частину заблокував браузер або екрана немає — дозвольте спливні вікна й повторіть':
    'Opened {ok} of {total}: the browser blocked some, or a screen is missing — allow pop-ups and try again',
  Екрани: 'Screens',
  'Браузер покаже всі екрани й відкриватиме вікна на потрібному, якщо дозволите.':
    'If you allow it, the browser shows all the screens and opens windows on the one you choose.',
  'Показати екрани': 'Show screens',
  'Доступ до екранів заборонено — дозвольте «Керування вікнами» в налаштуваннях сайту (значок ліворуч від адреси).':
    'Access to the screens is denied — allow “Window management” in the site settings (the icon left of the address).',
  'Цей браузер не повідомляє про екрани: вікна відкриваються там, де їх поставить браузер. Chrome і Edge уміють відкривати на вибраному екрані.':
    "This browser doesn't tell about screens: windows open wherever the browser puts them. Chrome and Edge can open them on a chosen screen.",
  основний: 'primary',
  'вікон: {n}': 'windows: {n}',
  Показ: 'Presentation',
  'Відкриті вікна': 'Open windows',
  'Вікон виводу не відкрито — відкрийте показ на потрібному екрані вище.':
    'No output windows open — open a presentation on the screen you need above.',
  'екран невідомий': 'screen unknown',
  'на весь екран': 'full screen',
  приховане: 'hidden',
  'Показати номер на цьому вікні': 'Show the number on this window',
  'Показати номер: {window}': 'Show the number: {window}',
  'Вийти з повного екрана': 'Exit full screen',
  'На весь екран (або F у вікні)': 'Full screen (or F in the window)',
  'На весь екран': 'Full screen',
  'Перейти до вікна': 'Go to the window',
  'Перейти до вікна: {window}': 'Go to the window: {window}',
  'Інший екран не видно — дозвольте доступ до екранів':
    "The other screen isn't visible — allow access to the screens",
  'Перенести на інший екран': 'Move to another screen',
  'Перенести: {window}': 'Move: {window}',
  'Закрити вікно': 'Close the window',
  'Закрити: {window}': 'Close: {window}',
  'Кілька вікон показу': 'Several presentation windows',
  '«Вікно показу» відкриває ще одне, а не повертає вже відкрите':
    '“Presentation window” opens another one instead of bringing back the open one',
  'Відкривати на весь екран': 'Open in full screen',
  'З окремими процесами вікно стає на весь екран клавішею F або кліком у ньому самому':
    'With separate processes, a window goes full screen with the F key or a click in the window itself',
  'Нове вікно стає на весь екран з вашим наступним кліком у цьому вікні — по одному вікну на клік (Chrome, Edge); в інших браузерах — F у самому вікні':
    'A new window goes full screen with your next click in this window — one window per click (Chrome, Edge); in other browsers, F in the window itself',
  'Окремий процес для кожного вікна': 'A separate process for each window',
  'Збій одного вікна виводу не зачепить вікно керування й інші вікна (Chrome, Edge). Діє для нових вікон; на весь екран — F або клік у самому вікні':
    "A crash in one output window won't touch the control window or the other windows (Chrome, Edge). Applies to new windows; full screen — F or a click in the window itself",
  'Зберегти розкладку': 'Save the layout',
  'Відкрити розкладку': 'Open the layout',
  'Перемкнути повний екран': 'Toggle full screen',
  'Клік або «F» — на весь екран · ← → гортають слайди':
    'Click or “F” — full screen · ← → step through slides',
  'Основний екран': 'Primary screen',
  'Екран {n}': 'Screen {n}',
  'Цей екран': 'This screen',
  // viewers' phones (web/src/pages/Follow.tsx)
  'Показ завершено: застосунок вимкнено.': 'The show is over: the app is switched off.',
  'Немає зв’язку з показом. Перепідключаюся…': 'No connection to the show. Reconnecting…',
  'Трансляцію призупинено': 'Broadcast paused',
  'Текст з’явиться тут, щойно оператор її ввімкне. Сторінку можна не закривати.':
    'The text appears here as soon as the operator turns it on. You can leave this page open.',
  'Налаштування тексту': 'Text settings',
  Розмір: 'Size',
  'Менший текст': 'Smaller text',
  'Більший текст': 'Larger text',
  Жирніше: 'Bolder',
  'Легше читати': 'Easier reading',
  '«Легше читати» — шрифт Andika, ширші проміжки, текст ліворуч (зручніше при дислексії). Зберігається лише на цьому телефоні.':
    '“Easier reading” — the Andika font, wider spacing, text on the left (easier with dyslexia). Saved on this phone only.',
  Скинути: 'Reset',
  // the speaker's remote (web/src/pages/Remote.tsx)
  'Оператор відкликав цей пульт.': 'The operator revoked this remote.',
  'Команду не виконано': 'The command was not done',
  'Немає зв’язку — надішлю, щойно підключуся':
    "No connection — I'll send it as soon as I'm connected",
  'Немає відповіді. Команду, можливо, не виконано.':
    'No answer. The command may not have been done.',
  'Розділ ще завантажується': 'The chapter is still loading',
  'Це останній вірш розділу': 'This is the last verse of the chapter',
  'Це перший вірш розділу': 'This is the first verse of the chapter',
  'Не вдалося відкрити розділ — перевірте зв’язок':
    "Couldn't open the chapter — check the connection",
  'строфа {n}/{total}': 'stanza {n}/{total}',
  'Пульт недоступний': 'The remote is unavailable',
  'Відскануйте QR у вікні керування: Пульт доповідача → Створити пульт.':
    'Scan the QR code in the control window: Speaker remote → Create a remote.',
  'Підключення…': 'Connecting…',
  '· застосунок вимкнено': '· the app is switched off',
  '· немає зв’язку, перепідключаюся': '· no connection, reconnecting',
  'відповідь {ms} мс': 'reply {ms} ms',
  'зараз: {item}': 'now: {item}',
  '{n} елем.|{n} елем.|{n} елем.': '{n} item|{n} items',
  'Далі: {item}': 'Next: {item}',
  'Список…': 'List…',
  'Наступне на екран': 'Next to screen',
  'Наступне в передпоказ': 'Next to preview',
  'Пропозиція оператора': "The operator's suggestion",
  'Оператор пропонує': 'The operator suggests',
  'Відхилити пропозицію': 'Dismiss the suggestion',
  'У передпоказ': 'To preview',
  'Ваш передпоказ': 'Your preview',
  'на екрані': 'on screen',
  'Скинути: гортати разом з оператором': 'Reset: step along with the operator',
  'Вибрати…': 'Choose…',
  'Вибрати вірш або пісню…': 'Choose a verse or a song…',
  'Вибрати пісню…': 'Choose a song…',
  'Вибрати вірш…': 'Choose a verse…',
  Передпоказ: 'Preview',
  'уже на екрані': 'already on screen',
  порожньо: 'empty',
  'Зняти чорне': 'Black off',
  // the speaker's remote on the operator's side (RemotePanel, RemotePicker, RemotePlaylist)
  'Не вдалося змінити налаштування: {error}': "Couldn't change the setting: {error}",
  'Не вдалося змінити дозволи: {error}': "Couldn't change the permissions: {error}",
  'Не вдалося перевипустити код: {error}': "Couldn't reissue the code: {error}",
  'Не вдалося створити пульт: {error}': "Couldn't create the remote: {error}",
  'Пульт «{remote}» відкликано': 'Remote “{remote}” revoked',
  'Не вдалося відкликати: {error}': "Couldn't revoke: {error}",
  'Новий код для «{remote}»': 'A new code for “{remote}”',
  'Пульт «{remote}» готовий': 'Remote “{remote}” is ready',
  'Телефон зі старим кодом уже відключено.': 'The phone with the old code is already disconnected.',
  'Доповідач сканує цей QR своїм телефоном (та сама мережа Wi-Fi). Код показується лише зараз; загубили — перевипустіть.':
    'The speaker scans this QR code with their phone (the same Wi-Fi network). The code shows only now; if it is lost, reissue it.',
  'Дайте доповідачу телефон-пульт: він зможе гортати показ, але не бачитиме налаштувань.':
    'Give the speaker a phone as a remote: they can step through the show but see no settings.',
  Назва: 'Name',
  'Наприклад, «Доповідач»': 'For example, “Speaker”',
  'Що дозволено': 'Allowed',
  'Створити пульт': 'Create a remote',
  Пульти: 'Remotes',
  'Поки немає.': 'None yet.',
  'на зв’язку': 'connected',
  'не на зв’язку': 'not connected',
  'ще не підключався': 'not connected yet',
  Перевипустити: 'Reissue',
  Ні: 'No',
  'Що дозволено цьому пульту': 'What this remote may do',
  'Дозволи: {remote}': 'Permissions: {remote}',
  'Що дозволено «{remote}»': 'What “{remote}” may do',
  'Телефон отримає зміни одразу, без нового QR.':
    'The phone gets the changes at once, without a new QR code.',
  'Перевипустити код: новий QR, старий телефон втратить керування':
    'Reissue the code: a new QR code; the old phone loses control',
  'Перевипустити код {remote}': 'Reissue the code of {remote}',
  'Відкликати: телефон одразу втратить керування': 'Revoke: the phone loses control at once',
  'Відкликати {remote}': 'Revoke {remote}',
  'Пам’ятати пульти після перезапуску сервера': 'Remember remotes after a server restart',
  'Зберігаються в data/secrets.json (лише хеш коду, не сам код).':
    "Kept in data/secrets.json (only the code's hash, not the code).",
  'Перезапуск сервера відкличе всі пульти.': 'A server restart revokes all remotes.',
  Книга: 'Book',
  'Вибір вірша або пісні': 'Choosing a verse or a song',
  'Що вибрати': 'What to choose',
  'Номер або слова пісні…': 'A song number or words…',
  'Бібліотека недоступна з цього телефона.': "The library isn't reachable from this phone.",
  '+ У послідовність': '+ To the running order',
  Т: 'T',
  зараз: 'now',
  // viewers on the operator side (FollowPanel, PhoneLink, QrCard)
  'Трансляція на телефони глядачів': "Broadcast to viewers' phones",
  'Поточний слайд дзеркалиться на сервер; глядачі читають за QR нижче.':
    'The current slide is mirrored to the server; viewers read it through the QR code below.',
  'Поки ніхто не підключився': 'Nobody has connected yet',
  'На зв’язку: {n} телефон|На зв’язку: {n} телефони|На зв’язку: {n} телефонів':
    'Connected: {n} phone|Connected: {n} phones',
  'Відскануйте або відкрийте на телефоні (та сама мережа Wi-Fi):':
    'Scan or open on a phone (the same Wi-Fi network):',
  'Прибрати QR з екрана': 'Take the QR code off the screen',
  'QR на екран': 'QR code to screen',
  'QR у кутку екрана': 'A QR code in the corner of the screen',
  'Маленький QR на кожному слайді, щоб підключитися могли й ті, хто прийшов пізніше':
    'A small QR code on every slide, so that those who come later can connect too',
  'Вигляд QR на екрані': 'QR code style on screen',
  Класичний: 'Classic',
  Округлий: 'Rounded',
  Крапки: 'Dots',
  'Увімкніть, щоб показати QR-код. Працює в межах локальної мережі.':
    'Turn it on to show the QR code. Works within the local network.',
  Скопійовано: 'Copied',
  Копіювати: 'Copy',
  'Телефон має бути в тій самій мережі Wi-Fi. Якщо не відкривається, відкрийте керування за IP-адресою комп’ютера ({ip}).':
    "The phone must be on the same Wi-Fi network. If it doesn't open, open the control window by the computer's IP address ({ip}).",
  'Не знайдено мережевої адреси. Підключіть комп’ютер до Wi-Fi чи LAN, щоб телефон міг приєднатися.':
    'No network address found. Connect the computer to Wi-Fi or LAN so that a phone can join.',
  'Читайте з телефона': 'Read on your phone',
  'Відскануйте камерою телефона — та сама мережа Wi-Fi':
    "Scan with your phone's camera — the same Wi-Fi network",
  'Текст на телефоні': 'The text on your phone',
  // the server: API errors (server/src/index.ts, songs.ts, autostart.ts)
  'Керування доступне лише з цього комп’ютера': 'Control is available only from this computer',
  'Очікую { key, value, at }': 'Expected { key, value, at }',
  'Пульт не знайдено': 'Remote not found',
  'Сегменти ще не зібрано. Запустіть: npm run build:segments':
    'The segments are not built yet. Run: npm run build:segments',
  'Порт — ціле число від 1024 до 65535, крім 5173 і 8787':
    'The port is a whole number from 1024 to 65535, except 5173 and 8787',
  'Порт {port} уже зайнятий іншою програмою — виберіть інший':
    'Port {port} is already taken by another program — choose another one',
  'Порт {port} зайнятий іншою програмою — змініть порт':
    'Port {port} is taken by another program — change the port',
  'Бібліотека саме перебудовується — спробуйте за хвилину':
    'The library is being rebuilt — try again in a minute',
  'Бандл не знайдено — відкрийте імпорт ще раз': 'Bundle not found — open the import again',
  'Бандл «{bundle}» уже є — виберіть його в списку':
    'The bundle “{bundle}” already exists — choose it in the list',
  'Перебудова вже триває': 'A rebuild is already running',
  'Не вдалося запустити збірку: {error}': "Couldn't start the build: {error}",
  'Збірка завершилась з кодом {code}': 'The build ended with code {code}',
  'Імпорт пісень: незрозумілий вигляд слайда': 'Song import: a slide style that makes no sense',
  'Імпорт пісень: вкажіть бандл або назву нового': 'Song import: name a bundle or a new one',
  'Імпорт пісень: немає пісень': 'Song import: no songs',
  'Імпорт пісень: забагато пісень за раз (до 5000)':
    'Song import: too many songs at once (up to 5000)',
  'Імпорт пісень: пісня без назви файлу': 'Song import: a song without a file name',
  'Імпорт пісень: у «{song}» незрозуміла назва':
    'Song import: “{song}” has a title that makes no sense',
  'Імпорт пісень: у «{song}» незрозумілий номер':
    'Song import: “{song}” has a number that makes no sense',
  'Імпорт пісень: у «{song}» незрозумілі слайди':
    'Song import: “{song}” has slides that make no sense',
  'Імпорт пісень: у «{song}» незрозумілий текст слайда':
    'Song import: “{song}” has slide text that makes no sense',
  'Автозапуск не підтримується на цій системі':
    'Starting with the computer is not supported on this system',
  'Бандл не знайдено': 'Bundle not found',
  // the hub: what a remote is told (server/src/live.ts)
  'Код цього пульта перевипущено. Відскануйте новий QR у вікні керування.':
    "This remote's code was reissued. Scan the new QR code in the control window.",
  'Пульт не знайдено або його відкликано': 'The remote was not found or was revoked',
  'Немає доступу': 'No access',
  'Ця дія пульту не дозволена': 'This remote may not do that',
  'Неправильний уривок': 'An invalid passage',
  'Неправильна строфа': 'An invalid stanza',
  'Неправильний елемент': 'An invalid item',
  'Вибір віршів пульту не дозволено': 'This remote may not choose verses',
  'Пісні пульту не дозволено': 'This remote may not use songs',
  'Послідовність пульту не дозволено': 'This remote may not use the running order',
  'Забагато натискань': 'Too many presses',
  'Вікно керування не відкрите': 'The control window is not open',
  'Вікно керування не відповіло': "The control window didn't answer",
  'Нічого не вибрано': 'Nothing chosen',
  'Цьому пульту не дозволено вірші': 'This remote may not use verses',
  'Цьому пульту не дозволено пісні': 'This remote may not use songs',
  'Пульт не на зв’язку': 'The remote is not connected',
  // MyBible modules (shared/src/library/mybible.ts)
  'Це не модуль MyBible, який можна імпортувати (Біблія, словник, коментарі чи перехресні посилання)':
    'This is not a MyBible module that can be imported (a Bible, a dictionary, commentaries, or cross-references)',
  'У модулі немає книг або віршів': 'The module has no books or verses',
  'Забагато віршів у модулі ({n})': 'Too many verses in the module ({n})',
  'Словник порожній': 'The dictionary is empty',
  // a remote without a name (web/src/components/RemotePanel.tsx)
  'Пульт {n}': 'Remote {n}',
  // the launcher console (server/src/launcher.ts)
  'Порт — ціле число від 1024 до 65535, наприклад: --port 4748':
    'The port is a whole number from 1024 to 65535, for example: --port 4748',
  '{s} с': '{s} s',
  'Відкрийте в браузері: {url}': 'Open in a browser: {url}',
  перевірка: 'check',
  вимкнення: 'switching off',
  'Застосунок на :{port} не зупинився. Закрийте вікно, де його запущено.':
    "The app on :{port} didn't stop. Close the window it runs in.",
  'Застосунок зупинено (працював на :{port})': 'The app stopped (it ran on :{port})',
  'На :{port} застосунок не працював': 'The app was not running on :{port}',
  'Автозапуск разом з комп’ютером прибрано': 'Starting with the computer removed',
  'Автозапуску не було': 'Starting with the computer was not set up',
  'Поза папкою застосунку лишилися тільки дані браузера для {url}: копії\nналаштувань і кеш бібліотеки (самі налаштування — у data/). Щоб стерти й їх, запустіть застосунок і в\nНалаштування вигляду → Застосунок виберіть «Вимкнути повністю» з позначкою «стерти\nдані браузера» — або видаліть дані цього сайту в налаштуваннях браузера. Після цього\nпапку застосунку можна просто видалити.':
    "Outside the app folder only the browser's data for {url} is left: copies of the\nsettings and the library cache (the settings themselves are in data/). To erase them too, start the app and\nin Settings → App choose “Switch off completely” with “Also erase the browser's\ndata” checked — or delete this site's data in the browser settings. After that\nyou can simply delete the app folder.",
  'Ярлик на робочому столі: {file}': 'Desktop shortcut: {file}',
  'Він запускає застосунок і відкриває вікно керування окремим вікном — у браузері на основі Chromium, вибраному в Налаштування вигляду → Застосунок, або в Chrome чи Edge.':
    'It starts the app and opens the control window as its own window — in the Chromium-based browser chosen in Settings → App, or in Chrome or Edge.',
  '{browser} на цьому комп’ютері не знайдено — відкриваю браузер системи (Налаштування вигляду → Застосунок).':
    '{browser} was not found on this computer — opening the system browser (Settings → App).',
  '{browser} на цьому комп’ютері не знайдено — відкриваю окремим вікном у Chrome або Edge (Налаштування вигляду → Застосунок).':
    '{browser} was not found on this computer — opening a separate window in Chrome or Edge (Settings → App).',
  'Застосунок уже працює: {url}': 'The app is already running: {url}',
  'Працює інша збірка: {label}. Щоб запустити цю, вимкніть застосунок («Вимкнути повністю…» або --off) і запустіть знову.':
    'Another build is running: {label}. To run this one, switch the app off (“Switch off completely…” or --off) and start it again.',
  'Працює інша копія застосунку: {folder}. Вікно керування відкриється в ній — з її даними й налаштуваннями (і браузером, вибраним у ній). Щоб працювала ця копія, вимкніть ту («Вимкнути повністю…» або --off) і запустіть цей файл знову.':
    'Another copy of the app is running: {folder}. The control window opens in it — with its data and settings (and the browser chosen there). To run this copy, switch that one off (“Switch off completely…” or --off) and start this file again.',
  'Залежності на місці': 'Dependencies in place',
  'Залежності: не встановлено (npm ci)': 'Dependencies: not installed (npm ci)',
  'Залежності: встановлено для іншої системи (npm ci)':
    'Dependencies: installed for another system (npm ci)',
  'Встановлюю залежності (npm ci; перший раз — кілька хвилин, потрібен інтернет)':
    'Installing dependencies (npm ci; the first time takes a few minutes and needs the internet)',
  'Залежності встановлено для іншої системи — перевстановлюю (npm ci)':
    'Dependencies were installed for another system — reinstalling (npm ci)',
  'Не вдалося встановити залежності. Перевірте інтернет і запустіть ще раз.':
    "Couldn't install the dependencies. Check the internet and start again.",
  'Залежності встановлено за {time}': 'Dependencies installed in {time}',
  'Модуль SQLite зібрано для іншої версії Node — перебудовую':
    'The SQLite module was built for another Node version — rebuilding',
  'Модуль SQLite працює': 'The SQLite module works',
  'Модуль SQLite не завантажується: {error}': "The SQLite module doesn't load: {error}",
  'невідома помилка': 'unknown error',
  'Спробуйте: npm ci': 'Try: npm ci',
  'Бібліотека на місці': 'Library in place',
  'Бібліотеку буде зібрано з {modules}': 'The library will be built from {modules}',
  'Збираю бібліотеку з модулів MyBible ({modules}; кілька хвилин)':
    'Building the library from MyBible modules ({modules}; a few minutes)',
  'Бібліотеку зібрано за {time}': 'Library built in {time}',
  'Бібліотеку не вдалося зібрати — застосунок запуститься без неї (див. вище).':
    "Couldn't build the library — the app starts without it (see above).",
  'Бібліотеки сервера немає: тексти читатиме браузер (Налаштування вигляду →\n  Застосунок → Джерело даних → «у браузері»); телефони й пульт їх не побачать.':
    "No server library: the browser will read the texts (Settings →\n  App → Data source → “In the browser”); phones and remotes won't see them.",
  'Бібліотеки немає: покладіть модулі MyBible (*.SQLite3) у папку modules/ і\n  запустіть ще раз. Застосунок запуститься, але без текстів.':
    'No library: put MyBible modules (*.SQLite3) into the modules/ folder and\n  start again. The app starts, but without texts.',
  'Інтерфейс зібрано': 'Interface built',
  'Інтерфейс буде зібрано (npm run build --workspace @vo/web)':
    'The interface will be built (npm run build --workspace @vo/web)',
  'Збираю інтерфейс (до хвилини)': 'Building the interface (up to a minute)',
  'Інтерфейс не зібрано (див. вище). Спробуйте: npm ci, тоді запустіть ще раз.':
    'The interface was not built (see above). Try: npm ci, then start again.',
  'Інтерфейс зібрано за {time}': 'Interface built in {time}',
  'Порт {port} зайнятий іншою програмою. Запустіть з іншим: --port 4748':
    'Port {port} is taken by another program. Start with another one: --port 4748',
  '(або змініть його в data/settings.json → standby → port).':
    '(or change it in data/settings.json → standby → port).',
  'Порт {port} вільний. Перевірку завершено за {time}.':
    'Port {port} is free. Check finished in {time}.',
  'Застосунок вимкнено («Вимкнути повністю»). Щоб запустити знову, запустіть цей файл.':
    'The app is switched off (“Switch off completely”). To start it again, run this file.',
  '«Запуск за адресою» вимкнено в налаштуваннях — застосунок зупинено.':
    '“Start on open” was turned off in the settings — the app stopped.',
  'Не вдалося перейти на новий порт: {error}': "Couldn't move to the new port: {error}",
  'Застосунок працює ({time}). Вікно керування: {url}':
    'The app is running ({time}). Control window: {url}',
  'Телефони в тій самій мережі Wi-Fi: {url}': 'Phones on the same Wi-Fi network: {url}',
  'Мережі не видно: телефони під’єднаються, коли комп’ютер буде в мережі.':
    'No network in sight: phones can connect once the computer is on a network.',
  'Зупинити: Ctrl+C або закрийте це вікно.': 'To stop: Ctrl+C or close this window.',
  'Застосунок не запустився: {error}': "The app didn't start: {error}",
  'Зупиняю…': 'Stopping…',
  'Потрібен Node.js 22.18 або новіший (зараз {version}): https://nodejs.org':
    'Node.js 22.18 or newer is needed (this is {version}): https://nodejs.org',
  // the waiter (server/src/standby.ts)
  'Запуск…': 'Starting…',
  'VerseOrchestrator запускається…': 'VerseOrchestrator is starting…',
  'Застосунок не відповідає': "The app doesn't answer",
  Хвилинку: 'Just a moment',
  '{command}: код {code}': '{command}: code {code}',
  'Перший запуск після оновлення: готую інтерфейс (до хвилини)…':
    'The first start after an update: preparing the interface (up to a minute)…',
  'Запускаю сервер…': 'Starting the server…',
  'сервер не запустився за 60 с': "the server didn't start within 60 s",
  'сервер завершився з кодом {code}': 'the server ended with code {code}',
  // the portable build (server/src/portable.ts)
  'немає {file} — потрібен Node.js з npm': 'no {file} — Node.js with npm is needed',
  'немає npm поруч із {node} — потрібен Node.js з npm':
    'no npm next to {node} — Node.js with npm is needed',
  '{node} — Node.js, що залежить від бібліотек поруч (так його встановлює Homebrew): у копії він не запуститься. Запустіть npm run portable з Node.js з nodejs.org (або встановленим через fnm чи nvm).':
    '{node} is a Node.js that depends on libraries next to it (Homebrew installs it that way): it won’t start in a copy. Run npm run portable with Node.js from nodejs.org (or installed with fnm or nvm).',
  'двічі клацніть start.cmd': 'double-click start.cmd',
  'двічі клацніть start.command': 'double-click start.command',
  'виконайте ./start.sh у терміналі': 'run ./start.sh in a terminal',
  'VerseOrchestrator {version} — портативна копія для {system} ({arch})':
    'VerseOrchestrator {version} — a portable copy for {system} ({arch})',
  'Node.js та інтернет не потрібні: усе потрібне — у цій папці.':
    'No Node.js or internet needed: everything is in this folder.',
  'Запуск: {launcher}. Вікно керування відкриється в браузері, адресу для\nтелефонів видно у вікні запуску.':
    'To start: {launcher}. The control window opens in a browser; the address for\nphones shows in the start window.',
  'Зупинити: закрийте вікно запуску. Вимкнути все й прибрати автозапуск: {off}.':
    'To stop: close the start window. To switch everything off and remove the autostart: {off}.',
  'Тексти: бібліотеку вже додано.': 'Texts: the library is already included.',
  'Тексти: покладіть модулі MyBible (*.SQLite3) у папку modules/ — застосунок збере\nбібліотеку сам (кілька хвилин).':
    'Texts: put MyBible modules (*.SQLite3) into the modules/ folder — the app builds\nthe library itself (a few minutes).',
  'Невідомий параметр «{arg}». Можна: --with-library, --release':
    'Unknown option “{arg}”. Options: --with-library, --release',
  'Портативна копія {name}': 'Portable copy {name}',
  'Файли проєкту: {n}': 'Project files: {n}',
  'Збираю інтерфейс': 'Building the interface',
  'Встановлюю залежності для роботи (без засобів розробки)':
    'Installing the runtime dependencies (no development tools)',
  'Не вдалося встановити залежності (потрібен інтернет або кеш npm).':
    "Couldn't install the dependencies (the internet or the npm cache is needed).",
  'Модуль SQLite не завантажується в копії.': "The SQLite module doesn't load in the copy.",
  'Бібліотеки немає ({file}). Зберіть її: npm run build:library':
    'No library ({file}). Build it: npm run build:library',
  'Бібліотеку додано': 'Library added',
  'Налаштування вигляду й послідовність': 'Appearance settings and the running order',
  'ЯК ЗАПУСТИТИ.txt': 'HOW TO START.txt',
  'Готово за {time}: {folder} ({mb} МБ)': 'Done in {time}: {folder} ({mb} MB)',
  'Скопіюйте цю папку на інший комп’ютер з такою самою системою — і запускайте.':
    'Copy this folder to another computer with the same system — and start it there.',
  // measurements: /bench (Bench.tsx, BenchPeer.tsx, lib/bench/*)
  '{n} мс': '{n} ms',
  Вимірювання: 'Measurements',
  'Бази даних': 'Databases',
  'Синхронізація вікон': 'Window sync',
  'Список сегментів недоступний: {error}': 'The segment list is unavailable: {error}',
  'CSV скопійовано': 'CSV copied',
  'Ті самі сегменти й ті самі запити на кожному рушії: сервер (SQLite через HTTP), SQLite у браузері й PostgreSQL у браузері (PGlite). Браузерні рушії запускаються начисто, по черзі, у власних воркерах — бібліотека застосунку не змінюється.':
    "The same segments and the same queries on every engine: the server (SQLite over HTTP), SQLite in the browser, and PostgreSQL in the browser (PGlite). The browser engines start clean, one by one, in their own workers — the app's library is not changed.",
  Сегменти: 'Segments',
  Рушії: 'Engines',
  'сервер не запущено': 'the server is not running',
  'Повторів кожного запиту': 'Repeats of each query',
  Запустити: 'Run',
  'Кожен запит: перший (холодний) прохід, розігрів, далі {n} замірів — медіана й p95. PostgreSQL завантажується довше: кілька секунд на переклад.':
    'Each query: a first (cold) pass, a warm-up, then {n} measurements — the median and p95. PostgreSQL loads longer: a few seconds per translation.',
  '{n} повторів · {cores} ядер · v{app}': '{n} repeats · {cores} cores · v{app}',
  'Копіювати CSV': 'Copy CSV',
  'Помилка: {error}': 'Error: {error}',
  'Рушій і дані': 'Engine and data',
  'Запуск рушія': 'Engine start',
  'воркер, WebAssembly, ініціалізація бази': 'worker, WebAssembly, database initialization',
  'Завантаження сегментів': 'Loading segments',
  'розпаковка, злиття, повнотекстовий індекс': 'unpacking, merging, full-text index',
  'Розмір бази': 'Database size',
  'сервер — файл усієї бібліотеки': 'the server — the file of the whole library',
  'Пам’ять WebAssembly': 'WebAssembly memory',
  'Файли рушія': 'Engine files',
  'завантажені воркером (.wasm, .data)': 'loaded by the worker (.wasm, .data)',
  'Знімок бази: збереження': 'Database snapshot: saving',
  'уся база одним образом': 'the whole database as one image',
  'Знімок бази: відкриття': 'Database snapshot: opening',
  'новий рушій з образу + перший запит': 'a new engine from the image + the first query',
  'не застосовно': 'not applicable',
  'p95 {p95} · 1-й {first} · {count} рез.': 'p95 {p95} · 1st {first} · {count} res.',
  '= ті самі результати, що в SQLite у браузері · ≈ обидва дійшли до межі 300 і по-різному впорядкували (bm25 / ts_rank) · сервер відповідає через HTTP (JSON включно) і тримає всю бібліотеку.':
    '= the same results as SQLite in the browser · ≈ both reached the limit of 300 and ordered them differently (bm25 / ts_rank) · the server answers over HTTP (JSON included) and holds the whole library.',
  'Партнер тесту синхронізації — вікно закриється саме. Відповідей: {n}':
    'The sync test partner — this window closes by itself. Replies: {n}',
  '{n} КБ': '{n} KB',
  '{n} Б': '{n} B',
  'Відкриваю вікно-партнера…': 'Opening the partner window…',
  'Як швидко повідомлення доходить з вікна керування до іншого вікна застосунку (вікна показу, сцени) і назад — та скільки воно при цьому блокує саме вікно керування. Для сервера — шлях телефонів і пульта. Партнер — маленьке окреме вікно, як справжнє вікно показу (якщо спливні вікна заблоковані — прихований фрейм), або одразу фрейм у цій сторінці.':
    'How fast a message gets from the control window to another window of the app (a presentation or stage window) and back — and how long it blocks the control window meanwhile. For the server — the path of the phones and the remote. The partner is a small separate window, like a real presentation window (a hidden frame if pop-ups are blocked), or a frame in this page right away.',
  'Способи передачі': 'Transports',
  Дані: 'Data',
  Партнер: 'Partner',
  'Окреме вікно': 'Separate window',
  Фрейм: 'Frame',
  'Обмінів на кожен вимір': 'Exchanges per measurement',
  'Кожен обмін: дані туди, коротке підтвердження назад; час — на годиннику вікна керування. Далі серія зі 200 команд без очікування.':
    "Each exchange: the data there, a short acknowledgment back; the time is on the control window's clock. Then a burst of 200 commands without waiting.",
  'окреме вікно': 'a separate window',
  'прихований фрейм': 'a hidden frame',
  '{n} обмінів · v{app}': '{n} exchanges · v{app}',
  'Серія команд': 'Command burst',
  '200 без очікування': '200 without waiting',
  '{n} / с': '{n} / s',
  'втрачено {lost} з {sent}': 'lost {lost} of {sent}',
  'Час — повний обмін (дані туди + підтвердження назад), медіана; під ним p95 і «блокує» — скільки вікно керування стоїть усередині відправлення (серіалізація, запис у localStorage): стільки інтерфейс не реагує на кожен показ.':
    'Time — a full exchange (the data there + the acknowledgment back), the median; under it p95 and “blocks” — how long the control window stays inside the send (serialization, writing to localStorage): that long the interface does not respond at every show.',
  'p95 {p95} · блокує {median} (max {max})': 'p95 {p95} · blocks {median} (max {max})',
  'втрачено {n}': 'lost {n}',
  Читання: 'Reading',
  'Повнотекстовий пошук': 'Full-text search',
  'Стронг і довідка': "Strong's and reference",
  'Список перекладів': 'List of translations',
  'Розділ: Від Івана 3': 'Chapter: John 3',
  'Рідкісне слово «никодим»': 'A rare word “никодим”',
  'Слово «любов»': 'The word “любов”',
  'Часте слово «бог»': 'A frequent word “бог”',
  '«бог» у всіх вибраних перекладах': '“бог” in all chosen translations',
  'Фраза «"син чоловічий"»': 'The phrase “"син чоловічий"”',
  'З виключенням «любов -бог»': 'With an exclusion “любов -бог”',
  '«god loved» (англ.)': '“god loved” (English)',
  '«"son of man"» (англ.)': '“"son of man"” (English)',
  'Конкорданс G26': 'Concordance G26',
  'Пошук «H430»': 'Search “H430”',
  'Словник Стронга: 26': "Strong's dictionary: 26",
  'Перехресні посилання Ів 3:16': 'Cross-references John 3:16',
  'Сервер (SQLite)': 'Server (SQLite)',
  'SQLite у браузері': 'SQLite in the browser',
  'PostgreSQL у браузері': 'PostgreSQL in the browser',
  'ті самі результати': 'the same results',
  'обидва ≥ 300 результатів: інше ранжування, інші перші 300':
    'both ≥ 300 results: a different ranking, a different first 300',
  'інші результати': 'different results',
  метрика: 'metric',
  версія: 'version',
  'запуск (мс)': 'start (ms)',
  'завантаження сегментів (мс)': 'loading segments (ms)',
  'розмір бази (МБ)': 'database size (MB)',
  'WASM-пам’ять (МБ)': 'WASM memory (MB)',
  'знімок: збереження (мс)': 'snapshot: saving (ms)',
  'знімок: розмір (МБ)': 'snapshot: size (MB)',
  'знімок: відкриття (мс)': 'snapshot: opening (ms)',
  '{case}: медіана (мс)': '{case}: median (ms)',
  '{case}: p95 (мс)': '{case}: p95 (ms)',
  '{case}: результатів': '{case}: results',
  'localStorage + подія storage': 'localStorage + the storage event',
  'SharedWorker (ретранслятор)': 'SharedWorker (relay)',
  'WebSocket через сервер': 'WebSocket through the server',
  'Сервер не відповів': "The server didn't answer",
  'WebSocket не з’єднався': "The WebSocket didn't connect",
  'Сервер відмовив': 'The server refused',
  'Команда «далі»': 'The command “next”',
  Слайд: 'Slide',
  'Слайд з фоном': 'Slide with a background',
  'Сторінка-партнер не відповіла': "The partner page didn't answer",
  'понад ліміт кадру (256 КБ)': 'over the frame limit (256 KB)',
  '{transport}: серія': '{transport}: burst',
  'не вміщається в localStorage': "doesn't fit into localStorage",
  помилка: 'error',
  'транспорт,дані,байт,RTT медіана (мс),RTT p95 (мс),блокування відправника медіана (мс),блокування max (мс),втрачено,помилка':
    'transport,data,bytes,RTT median (ms),RTT p95 (ms),sender blocking median (ms),blocking max (ms),lost,error',
  '{transport},серія {sent} команд,,,,,,{lost},{perSec} за секунду':
    '{transport},burst of {sent} commands,,,,,,{lost},{perSec} per second',
  'Сегменти…': 'Segments…',
  '{engine}: бібліотека': '{engine}: library',
  'уся бібліотека: {n} переклад|уся бібліотека: {n} переклади|уся бібліотека: {n} перекладів':
    'the whole library: {n} translation|the whole library: {n} translations',
  '{engine}: запуск': '{engine}: start',
  '{engine}: знімок': '{engine}: snapshot',
  // 0.13.0 a slide or a page that fails to draw
  'Не вдалося показати сторінку': "Couldn't show this page",
  'Перезавантажте її. Причина: {error}': 'Reload it. Reason: {error}',
  Перезавантажити: 'Reload',
  '{window}: слайд не вдалося намалювати': "{window}: couldn't draw the slide",
  'Слайд не вдалося намалювати': "Couldn't draw the slide",
  'Там лишився попередній слайд або чорний екран. Причина: {error}':
    'It kept the previous slide, or went black. Reason: {error}',
  'У моніторах лишився попередній слайд. Причина: {error}':
    'The monitors kept the previous slide. Reason: {error}',
  // 0.13.0 a slide of unknown shape from another window
  'слайд із невідомою будовою — можливо, від вікна іншої версії застосунку':
    'a slide of unknown shape — maybe from a window of another app version',
  // 0.13.1 no library yet
  'Бібліотеки ще немає': 'No library yet',
  'У бібліотеці немає перекладів': 'The library has no translations',
  'У браузері ще немає перекладів': 'No translations in the browser yet',
  'Покладіть модулі MyBible (*.SQLite3) у папку modules/ поруч із застосунком і натисніть «Пересканувати модулі».':
    'Put MyBible modules (*.SQLite3) in the modules/ folder next to the app and click “Rescan modules”.',
  'Або відкрийте модуль прямо в браузері: додайте файл у «Джерело даних» (Налаштування вигляду → Застосунок) і виберіть «У браузері».':
    'Or open a module right in the browser: add the file under “Data source” (Settings → App) and choose “In the browser”.',
  'Додайте модуль MyBible чи сегмент у «Джерело даних» (Налаштування вигляду → Застосунок).':
    'Add a MyBible module or a segment under “Data source” (Settings → App).',
  'Джерело даних…': 'Data source…',
  'Перекладів ще немає': 'No translations yet',
  // 0.13.2 bring back a cleared slide
  'Повернути на екран': 'Bring back to the screen',
  'Скасувати «Очистити»: прибраний слайд — знову на екрані':
    'Undo “Clear”: the cleared slide is back on screen',
  'Екран очищено · {key} повертає': 'Screen cleared · {key} brings it back',
  Повернути: 'Bring back',
  'Немає чого повертати на екран': 'Nothing to bring back',
  'Знову на екрані': 'Back on screen',
  'Повернути прибраний слайд': 'Bring back the cleared slide',
  // 0.14.0 the release layout
  'Ваші дані — у папці data/: налаштування, бібліотека, пісні. Сам застосунок — у папці\napp/: нова версія замінює лише її, а data/ і modules/ лишаються.':
    'Your data is in the data/ folder: settings, the library, songs. The app itself is in the\napp/ folder: a new version replaces only that folder; data/ and modules/ stay.',
  'Зверху: {start}, modules/, data/; застосунок — у app/':
    'At the top: {start}, modules/, data/; the app is in app/',
  // 0.14.1 release copies
  'У реліз бібліотека не потрапляє: переклади мають власні ліцензії. Приберіть --with-library.':
    'A release never carries the library: the translations have their own licences. Drop --with-library.',
  // 1.0.0 update check
  'У вас остання версія': 'You have the latest version',
  'Перевіряю…': 'Checking…',
  'Доступна версія {version} (у вас {current}).':
    'Version {version} is available (you have {current}).',
  'Ще не перевіряли.': 'Not checked yet.',
  'У вас остання версія ({current}). Перевірено {when}.':
    'You have the latest version ({current}). Checked {when}.',
  Оновлення: 'Updates',
  'Що нового': 'What’s new',
  'Щоб оновити копію репозиторію, виконайте git pull і запустіть застосунок.':
    'To update a clone of the repository, run git pull and start the app.',
  // upd2 (1.6.0)
  'Код застосунку змінився: {from} → {to}.': "The app's code has changed: {from} → {to}.",
  Перезапустити: 'Restart',
  'Застосунок перебудує інтерфейс і запуститься знову у фоні — вікно запуску закриється. Сторінка оновиться сама.':
    'The app rebuilds its interface and starts again in the background — the start window closes. The page reloads by itself.',
  'Перезапускаю застосунок з новим кодом…': 'Restarting the app with the new code…',
  'Застосунок не відповідає після перезапуску. Запустіть його файлом запуску; що сталося — у data/standby.log.':
    "The app doesn't answer after the restart. Start it with the start file; what happened is in data/standby.log.",
  'Код застосунку змінився — див. «Застосунок» → «Оновлення»':
    "The app's code has changed — see “App” → “Updates”",
  // upd2 (1.6.1)
  'Копію відкрито не на гілці — отримайте оновлення вручну':
    'The copy is not on a branch — get the updates by hand',
  'Гілка {branch} не стежить за віддаленою — отримайте оновлення вручну':
    "The branch {branch} doesn't track a remote one — get the updates by hand",
  'Git саме зливає чи перебазовує — завершіть це вручну':
    'Git is in the middle of a merge or rebase — finish it by hand',
  'Є незбережені зміни у файлах — отримайте оновлення вручну (git pull)':
    'There are uncommitted changes in the files — get the updates by hand (git pull)',
  'Гілка {branch} розійшлася з {upstream} — злийте зміни вручну':
    'The branch {branch} has diverged from {upstream} — merge the changes by hand',
  'Не вдалося отримати зміни з віддаленого репозиторію':
    "Couldn't fetch the changes from the remote repository",
  'Не вдалося отримати оновлення': "Couldn't get the updates",
  'Git не відповів вчасно — перевірте мережу й спробуйте ще раз':
    "Git didn't answer in time — check the network and try again",
  'Інша програма git саме працює з цією копією — спробуйте за хвилину':
    'Another git program is working with this copy — try again in a minute',
  'Нові файли з віддаленої гілки збігаються з вашими неврахованими — приберіть їх або отримайте оновлення вручну':
    'New files from the remote branch clash with your untracked ones — move them away or get the updates by hand',
  'Нових релізів немає ({current}). Перевірено {when}.':
    'No new releases ({current}). Checked {when}.',
  // upd2 (1.6.2)
  Версія: 'Version',
  '{version} · встановлена': '{version} · installed',
  '{version} · найновіша': '{version} · newest',
  'Інша версія…': 'Another version…',
  'Завантажити версію {version} ({mb} МБ)': 'Download version {version} ({mb} MB)',
  'Перезапустити з версією {version}': 'Restart with version {version}',
  'Ви вибрали версію {current}; поточний реліз — {version}. Перевірено {when}.':
    'You chose version {current}; the current release is {version}. Checked {when}.',
  'Ви вибрали версію {current}; поточний реліз — {version}.':
    'You chose version {current}; the current release is {version}.',
  'Поточний реліз {version} ({mb} МБ)': 'Current release {version} ({mb} MB)',
  'Старіша версія не знає того, що з’явилося пізніше: частину налаштувань вона може скинути до типових. Перш ніж перейти, збережіть резервну копію.':
    'An older version doesn’t know what came later: it may reset some settings to their defaults. Save a backup before you switch.',
  'У версії {version} ще немає «Повернути версію»: з неї можна лише оновитися до найновішої версії, потрібен інтернет.':
    'Version {version} has no “Go back to version” yet: from it you can only update to the newest version, which needs the internet.',
  'Повернутися на {current} можна буде тут само.': 'You can come back to {current} right here.',
  'Такої версії немає серед релізів — натисніть «Перевірити зараз»':
    'There is no such version among the releases — click “Check now”',
  'Ця версія вже встановлена': 'This version is installed already',
  'Гілка {branch}: на {upstream} є {n} нова зміна|Гілка {branch}: на {upstream} є {n} нові зміни|Гілка {branch}: на {upstream} є {n} нових змін':
    'Branch {branch}: {upstream} has {n} new change|Branch {branch}: {upstream} has {n} new changes',
  'Гілка {branch}: нових змін на {upstream} немає.':
    'Branch {branch}: no new changes on {upstream}.',
  'Отримати оновлення': 'Get the updates',
  'Отримано {n} зміну|Отримано {n} зміни|Отримано {n} змін': 'Got {n} change|Got {n} changes',
  'Перезапустіть застосунок, щоб вони запрацювали.': 'Restart the app for them to take effect.',
  'Нових змін немає.': 'No new changes.',
  'Отримувати оновлення сам уміє лише застосунок з копії репозиторію, запущений файлом запуску':
    'Only an app run from a clone of the repository with the start file can get the updates itself',
  'Перезапускати сам уміє лише застосунок з копії репозиторію, запущений файлом запуску':
    'Only an app run from a clone of the repository with the start file can restart itself',
  'Застосунок перезапускається з новим кодом: він запуститься сам, у фоні.':
    'The app is restarting with the new code: it starts by itself, in the background.',
  'Перевірити зараз': 'Check now',
  'Перевіряти оновлення': 'Check for updates',
  Канал: 'Channel',
  'Канал оновлень': 'Update channel',
  Стабільний: 'Stable',
  Бета: 'Beta',
  'Бета-версії приносять нове раніше, але в них можуть бути вади. Повернутися можна будь-коли: перемкніть на «Стабільний» і виберіть стабільну версію в списку.':
    'Betas bring new things sooner but may have flaws. To go back at any time, switch to “Stable” and pick a stable version in the list.',
  'Лише стабільні версії: кожна збирає кілька перевірених бета-версій.':
    'Stable versions only: each one gathers several tested betas.',
  'Доступна версія {version} — див. «Застосунок» → «Оновлення»':
    'Version {version} is available — see “App” → “Updates”',
  'Не вдалося перевірити оновлення: немає зв’язку з GitHub':
    'Couldn’t check for updates: no connection to GitHub',
  // 1.0.0 installing updates
  'Оновлювати сам уміє лише застосунок з архіву релізу':
    'Only the app from a release archive can update itself',
  'Новішої версії немає': 'There is no newer version',
  'Оновлення ще не завантажено': 'The update hasn’t been downloaded yet',
  'Для цієї системи в релізі немає архіву': 'The release has no archive for this system',
  'Замало місця на диску: потрібно близько {mb} МБ': 'Not enough disk space: about {mb} MB needed',
  // Mac check of 1.10.1: data/ on another volume (VO_DATA_DIR) — the disk that is short
  'Замало місця на диску з папкою {path}: потрібно близько {mb} МБ':
    'Not enough space on the disk with the folder {path}: about {mb} MB needed',
  'Архів оновлення пошкоджено: контрольна сума не збігається':
    'The update archive is damaged: the checksum doesn’t match',
  'Не вдалося завантажити оновлення: немає зв’язку з GitHub':
    'Couldn’t download the update: no connection to GitHub',
  'Не вдалося розпакувати оновлення': 'Couldn’t unpack the update',
  'Архів оновлення має незнайому будову': 'The update archive has an unknown layout',
  'В архіві оновлення не та версія': 'The update archive holds a different version',
  'Не вдалося замінити папку app/ — працює попередня версія':
    'Couldn’t replace the app/ folder — the previous version is running',
  'Не вдалося замінити папку app/: її тримає інша програма — браузер, який відкрив застосунок, вікно Провідника чи термінал у цій папці. Закрийте її й спробуйте ще раз. Працює попередня версія':
    'Couldn’t replace the app/ folder: another program holds it — a browser the app opened, an Explorer window, or a terminal in that folder. Close it and try again. The previous version is running',
  'Нова версія не запустилася — повернуто попередню':
    'The new version didn’t start — the previous one is back',
  'Застосунок оновлюється: нова версія запуститься сама, у фоні.':
    'The app is updating: the new version starts by itself, in the background.',
  'Застосунок не відповідає після оновлення. Запустіть його знову файлом запуску; що сталося — у data/updates/swap.log.':
    'The app doesn’t answer after the update. Start it again with the start file; what happened is in data/updates/swap.log.',
  'Перезапускаю застосунок з версією {version}…': 'Restarting the app with version {version}…',
  'Сторінка оновиться сама, щойно застосунок відповість. Телефони під’єднаються знову.':
    'The page reloads by itself as soon as the app answers. Phones reconnect.',
  'Раз на 12 годин застосунок питає GitHub про нові версії. Завантажує й установлює лише тоді, коли ви натиснете кнопку.':
    'Every 12 hours the app asks GitHub about new versions. It downloads and installs only when you click the button.',
  'Оновлено з {from} до {to} ({when}).': 'Updated from {from} to {to} ({when}).',
  'Оновлення до {to} не вдалося.': 'The update to {to} failed.',
  'Подробиці — у data/updates/swap.log.': 'Details are in data/updates/swap.log.',
  'Для цієї системи в релізі немає архіву: завантажте застосунок зі сторінки релізу.':
    'The release has no archive for this system: download the app from the release page.',
  'Завантажую: {got} з {total} МБ': 'Downloading: {got} of {total} MB',
  'Перевіряю контрольну суму…': 'Checking the checksum…',
  'Розпаковую…': 'Unpacking…',
  'Версію {version} завантажено. Перезапустіть застосунок, щоб перейти на неї: це займе до хвилини.':
    'Version {version} is downloaded. Restart the app to switch to it: it takes up to a minute.',
  'Перезапустити й оновити': 'Restart and update',
  'Спершу закрийте вікна виводу — під час показу застосунок не перезапускається.':
    'Close the output windows first — the app doesn’t restart during a show.',
  'Спробувати ще раз': 'Try again',
  'Завантажити оновлення ({mb} МБ)': 'Download the update ({mb} MB)',
  // 1.1.0 preview-only steps
  'Прев’ю: далі': 'Preview: next',
  'Прев’ю: назад': 'Preview: back',
  'Наступний вірш лише в прев’ю — екран стоїть до «На екран»':
    'The next verse in the preview only — the screen stays until “To screen”',
  'Попередній вірш лише в прев’ю — екран стоїть до «На екран»':
    'The previous verse in the preview only — the screen stays until “To screen”',
  'Екран стоїть, прев’ю йде далі. Показати прев’ю — «На екран».':
    'The screen stays, the preview moves on. To show the preview, press “To screen”.',
  // 1.1.0 one control window
  керування: 'control',
  'Закрити це вікно': 'Close this window',
  'Браузер не дає закрити цю вкладку — закрийте її самі ({key}).':
    'The browser keeps this tab open — close it yourself ({key}).',
  'Вікно керування вже відкрите — перемикаю на нього.':
    'The control window is open already — switching to it.',
  'Вікно керування вже відкрите — знайдіть його серед вікон браузера.':
    'The control window is open already — find it among the browser’s windows.',
  'Щоб відкрити ще одне, запустіть з --new-window.':
    'To open another one, start with --new-window.',
  // the open control window brought forward on a Mac (AppleScript)
  'macOS не дозволяє Терміналу керувати {browser}. Щоб дозволити, відкрийте Системні параметри → Приватність і безпека → Автоматизація → Термінал і ввімкніть {browser}.':
    "macOS doesn't let Terminal control {browser}. To allow it, open System Settings → Privacy & Security → Automation → Terminal and turn on {browser}.",
  'macOS не дозволяє програмі, у якій відкрито вікно запуску, керувати {browser}. Щоб дозволити, відкрийте Системні параметри → Приватність і безпека → Автоматизація, знайдіть цю програму й увімкніть під нею {browser}.':
    "macOS doesn't let the app the start window runs in control {browser}. To allow it, open System Settings → Privacy & Security → Automation, find that app and turn on {browser} under it.",
  'Якщо macOS питає дозволу керувати браузером, дозвольте й запустіть ще раз.':
    'If macOS asks for permission to control the browser, allow it and start again.',
  // … in Firefox or a browser built on it (`activate`, no permission): that browser comes forward
  'Вікно керування відкрите у {browser} — показую {browser}.':
    'The control window is open in {browser} — showing {browser}.',
  '{browser} не дає файлу запуску вибрати своє вікно чи вкладку — для цього тримайте вікно керування в Chrome або Safari.':
    "{browser} doesn't let the start file pick its window or tab — for that, keep the control window in Chrome or Safari.",
  'Невідомий параметр «{arg}». Можна: --no-browser, --port N, --check, --off, --app, --shortcut, --new-window':
    'Unknown option “{arg}”. Available: --no-browser, --port N, --check, --off, --app, --shortcut, --new-window',
  // 1.1.0 help
  Довідка: 'Help',
  'Посібник користувача — відкривається на GitHub': 'The user guide — opens on GitHub',
  // 1.2.0 feedback
  Відгук: 'Feedback',
  'Помітили помилку чи маєте ідею? Форма відкривається на GitHub (потрібен акаунт), з версією, системою й мовою. Відгук видно всім — не пишіть особистих даних.':
    'Found a bug or have an idea? The form opens on GitHub (an account is needed), with the version, system, and language filled in. Feedback is public — don’t include personal data.',
  'Надіслати відгук': 'Send feedback',
  // 1.8.12-beta.6 «Порядок показу» (F1005-06)
  'Наступний елемент показу': 'Next running order item',
  'Наступний елемент послідовності показу — на екран':
    'The running order’s next item — to the screen',
  'Попередній елемент послідовності показу — на екран':
    'The running order’s previous item — to the screen',
  'Усі — далі / назад': 'All — next / back',
  'Усі чотири стрілки крокують показом': 'All four arrows step the show',
  '← → екран, ↑ ↓ прев’ю': '← → screen, ↑ ↓ preview',
  '↑ ↓ ведуть лише прев’ю, екран чекає «На екран»':
    '↑ ↓ move only the preview, the screen waits for “To screen”',
  '↑ ↓ вірші, ← → елементи': '↑ ↓ verses, ← → items',
  '← → — попередній / наступний елемент послідовності показу':
    '← → — the running order’s previous / next item',
  Стрілки: 'Arrows',
  Своя: 'Custom',
  'Клавіші кроків змінено вручну — виберіть схему, щоб повернути одну зі звичних':
    'The step keys were changed by hand — pick a scheme to go back to a usual one',
  'Попередній елемент · {keys}': 'Previous item · {keys}',
  'Наступний елемент · {keys}': 'Next item · {keys}',
  'Додати в показ': 'Add to the running order',
  'Додати в показ: {item}': 'Add to the running order: {item}',
  'Показ · {n}': 'Running order · {n}',
  'Послідовність показу порожня — додавайте елементи кнопкою «+ у показ»':
    'The running order is empty — add items with “+ to the running order”',
  'Це останній елемент показу': 'This is the last item of the running order',
  'Це перший елемент показу': 'This is the first item of the running order',
  // 1.8.12-beta.7 «Режими» (F1005-12, F1005-15)
  Режим: 'Mode',
  Медіа: 'Media',
  'Переклади, книги й вірші': 'Translations, books, and verses',
  'Список пісень ліворуч, пісня посередині': 'The song list on the left, the song in the middle',
  'Зображення, альбоми, відео й власний текст': 'Images, albums, videos, and custom text',
  'Виберіть пісню ліворуч — знайдіть її за номером чи назвою.':
    'Choose a song on the left — find it by number or title.',
  'Простий вигляд': 'Simple view',
  'простий вигляд': 'simple view',
  'Сцена, вікна виводу, глядачі, пульт, довідка й тема — у меню «Ще»; праворуч лише прев’ю':
    'Stage, output windows, viewers, remote, help, and theme go to the “More” menu; only the preview on the right',
  'Простий вигляд: вимкнути': 'Simple view: off',
  'Простий вигляд: увімкнути': 'Simple view: on',
  // 1.8.12-beta.8 the phones' theme (F1005-04)
  Тема: 'Theme',
  Світла: 'Light',
  Темна: 'Dark',
  'Як у телефоні': 'As on the phone',
  'Тема: {name}': 'Theme: {name}',
  // 1.8.12-beta.9 search on the remote (F1005-01) and the search field's place (A1007-01)
  'Книга, посилання чи слова…': 'Book, reference, or words…',
  'Шукаю…': 'Searching…',
  'Віршів не знайдено': 'No verses found',
  'Пошук не вдався — спробуйте ще раз': 'The search failed — try again',
  'У перекладах пульта нічого — знайдено в інших':
    'Nothing in the remote’s translations — found in others',
  Вірші: 'Verses',
  'Де поле пошуку': 'Where the search field is',
  'Угорі, після режимів': 'At the top, after the modes',
  'Угорі, посередині': 'At the top, in the middle',
  'Над віршами (у «Біблії»)': 'Above the verses (in “Bible”)',
  'Угорі, перед режимами': 'At the top, before the modes',
  // a control window on another computer (1.9.0-beta.10, server/src/live.ts, web/src/pages/Desk.tsx)
  'Неправильний відлік': 'Invalid countdown',
  'Відліку на екрані немає': 'There is no countdown on screen',
  'Керувати показом звідси — через пульт для комп’ютера':
    'Control the show from here with a computer remote',
  'Повне вікно керування працює лише на комп’ютері, де запущено застосунок. Попросіть оператора створити пульт для цього комп’ютера (Пульт доповідача → Комп’ютер) і вставте його посилання сюди.':
    'The full control window works only on the computer that runs the app. Ask the operator to create a remote for this computer (Speaker remote → Computer) and paste its link here.',
  'Посилання на пульт': 'Remote link',
  Відкрити: 'Open',
  'У цьому посиланні немає коду пульта. Скопіюйте його повністю.':
    'This link has no remote code in it. Copy the whole link.',
  'Лише читати текст разом із показом:': 'Only read the text along with the show:',
  'сторінка для глядачів': 'the viewers’ page',
  '{status} · відповідь за {ms} мс': '{status} · answered in {ms} ms',
  '«Далі» в оператора: {reference}': 'The operator’s “Next”: {reference}',
  '«Починаємо за 5:00» для глядачів: почати, пауза, прибрати':
    '“Starting in 5:00” for the viewers: start, pause, remove',
  'Ви показали це звідси: «Далі» веде далі тут': 'You showed this from here: “Next” goes on here',
  'Виберіть вірші — Enter чи «На екран» покаже їх.':
    'Choose verses — Enter or “To screen” shows them.',
  'Виберіть пісню ліворуч.': 'Choose a song on the left.',
  'Виберіть строфу — Enter чи «На екран» покаже її.':
    'Choose a stanza — Enter or “To screen” shows it.',
  'Вставити нове посилання': 'Paste a new link',
  Екран: 'Screen',
  Знайдене: 'Found',
  Монітори: 'Monitors',
  'Назва чи номер пісні…': 'Song title or number…',
  'Напишіть, як-от 5 чи 7:30': 'Type it like 5 or 7:30',
  'Наступні вірші того, що ви показали': 'The next verses of what you showed',
  'Не дозволено оператором': 'Not allowed by the operator',
  'Немає пісень за «{query}»': 'No songs for “{query}”',
  'Нічого не знайдено за «{query}»': 'Nothing found for “{query}”',
  'Оператор ще нічого не додав.': 'The operator hasn’t added anything yet.',
  'Показати прев’ю': 'Show the preview',
  'Попередні вірші того, що ви показали': 'The previous verses of what you showed',
  Почати: 'Start',
  'Почати відлік': 'Start the countdown',
  'Оператор пропонує: {ref}': 'The operator suggests: {ref}',
  'відкрити в «Пульті»': 'open in “Remote”',
  'далі: {item}': 'next: {item}',
  'далі: кінець послідовності': 'next: the end of the running order',
  'далі: рахує в мінус': 'next: counts past zero',
  'далі: час зникне': 'next: the time goes',
  'далі: зупиниться на 0:00': 'next: stops at 0:00',
  'Почати таймер': 'Start the timer',
  'Зупинити таймер': 'Stop the timer',
  'Неправильний таймер': 'Not a timer request',
  'Таймер доповідача не запущено': 'The speaker timer isn’t running',
  '5 чи 7:30': '5 or 7:30',
  'Пошук: посилання чи слова': 'Search: a reference or words',
  'Пісень у бібліотеці ще немає': 'There are no songs in the library yet',
  'Спершу виберіть, що показати': 'First choose what to show',
  'У ваших перекладах нічого — знайдено в інших': 'Nothing in your translations — found in others',
  'У посиланні немає коду пульта. Відкрийте посилання, яке дав оператор.':
    'The link has no remote code. Open the link the operator gave you.',
  'Хвилини: 5 чи 7:30': 'Minutes: 5 or 7:30',
  'Цей пульт не працює': 'This remote doesn’t work',
  'Як «Далі» оператора': 'As the operator’s “Next”',
  'Як «Назад» оператора': 'As the operator’s “Back”',
  'Як збережено': 'As saved',
  'Інший комп’ютер має бути в тій самій мережі. Якщо не відкривається, відкрийте керування за IP-адресою цього комп’ютера ({ip}).':
    'The other computer must be on the same network. If it doesn’t open, open the control window by this computer’s IP address ({ip}).',
  'Відкликати: комп’ютер одразу втратить керування': 'Revoke: the computer loses control at once',
  'Відкрийте це посилання в браузері іншого комп’ютера (та сама мережа): там буде вікно керування з дозволеним вище. Посилання показується лише зараз; загубили — перевипустіть.':
    'Open this link in a browser on the other computer (the same network): it gets a control window with what you allowed above. The link is shown only now; if it’s lost, reissue it.',
  'Вікно керування на іншому комп’ютері мережі: пошук, вірші, переклади й те, що ви дозволите. Налаштувань і вікон виводу там немає.':
    'A control window on another computer of the network: search, verses, translations, and what you allow. It has no settings and no output windows.',
  'Для чого пульт': 'What the remote is for',
  'Комп’ютер': 'Computer',
  'Комп’ютер зі старим посиланням уже відключено.':
    'The computer with the old link is already disconnected.',
  'Комп’ютер отримає зміни одразу, без нового посилання.':
    'The computer gets the changes at once, without a new link.',
  'Перевипустити посилання: нове посилання, старий комп’ютер втратить керування':
    'Reissue the link: a new link, the old computer loses control',
  'Створити посилання': 'Create a link',
  'Не знайдено мережевої адреси. Підключіть комп’ютер до Wi-Fi чи LAN, щоб інший комп’ютер міг приєднатися.':
    'No network address found. Connect the computer to Wi-Fi or LAN so the other computer can join.',
  'Це посилання пульта для телефона. Попросіть оператора створити пульт для комп’ютера (Пульт доповідача → Комп’ютер).':
    'This is a phone remote’s link. Ask the operator to create a computer remote (Speaker remote → Computer).',
  Телефон: 'Phone',
  'Щоб показувати звідти свої вірші, позначте «На екран» і «Вибір віршів».':
    'To show its own verses from there, tick “To screen” and “Choosing verses”.',
  'застосунок вимкнено': 'the app is switched off',
  'підключаюся…': 'connecting…',
  // «Сцена» (1.9.0-beta.11, web/src/pages/Stage.tsx, StageMessageTool, SettingsPanel)
  'Enter — показати, Shift+Enter — новий рядок. Глядачі його не бачать.':
    'Enter shows it, Shift+Enter starts a new line. The viewers don’t see it.',
  'Вигляд «Сцени»': 'The stage window’s look',
  'Вікно для доповідача: що зараз на екрані, що далі, годинник, таймер і ваші повідомлення. Глядачі його не бачать.':
    'The speaker’s window: what is on screen now, what comes next, the clock, the timer, and your messages. Viewers don’t see it.',
  'Годинник із секундами': 'Clock with seconds',
  'Нічого немає': 'Nothing',
  'На екрані нічого немає': 'Nothing on screen',
  'Де ми: «вірш 16 з 36», «строфа 3 з 5»': 'Where we are: “verse 16 of 36”, “stanza 3 of 5”',
  Зараз: 'Now',
  'Зараз: «{text}»': 'Now: “{text}”',
  Мініатюри: 'Slides',
  'Наприклад, «Лишилося 5 хвилин»': 'For example, “5 minutes left”',
  'Повідомлення на сцену': 'Message to the stage',
  'Повідомлення на сцені: «{text}»': 'Message on the stage: “{text}”',
  'Показати на «Сцені»': 'Show on the stage',
  'Показувати «Далі»': 'Show “Next”',
  'Послідовність показу внизу': 'The running order at the bottom',
  'Розмір тексту': 'Text size',
  'Розмір тексту на «Сцені»': 'Text size on the stage',
  'Рядок для доповідача — у вікні «Сцена» і на пульті-телефоні':
    'A line for the speaker — in the Stage window and on their phone remote',
  'Слайди такі, як на екрані: з фоном і кольорами.':
    'The slides as the screen shows them: with the background and colours.',
  'Слова слайда великим простим шрифтом — читаються здалеку.':
    'The slide’s words in a large plain font — readable from afar.',
  Таймер: 'Timer',
  'Текст для доповідача': 'Text for the speaker',
  'Тема «Сцени»': 'The stage window’s theme',
  'без «Далі»': 'without “Next”',
  'вірш {n} з {total}': 'verse {n} of {total}',
  'вірші {from}–{to} з {total}': 'verses {from}–{to} of {total}',
  мініатюри: 'slides',
  пауза: 'paused',
  світла: 'light',
  'строфа {n} з {total}': 'stanza {n} of {total}',
  'фото {n} з {total}': 'photo {n} of {total}',
  // a step down that can update back (1.9.0, server/src/installer.ts FIRST_SWAP_SAFE)
  'З версій, старіших за 1.8.8, на Windows не вдається оновитися назад':
    'Versions older than 1.8.8 can’t update back on Windows',
  // 1.10.0-beta.4: «Цикл оголошень»
  'Змінити цикл': 'Edit the loop',
  'Змінювати кожні, с': 'Change every, s',
  'Розібрати цикл': 'Take the loop apart',
  'Цикл оголошень': 'Announcement loop',
  'Вибрано {n} слайд|Вибрано {n} слайди|Вибрано {n} слайдів': '{n} slide picked|{n} slides picked',
  'Зібрати в цикл': 'Gather into a loop',
  Згорнути: 'Fold',
  'Слайди циклу': 'The loop’s slides',
  'Вийняти з циклу': 'Take out of the loop',
  'цикли оголошень': 'announcement loops',
  'Цикл порожній': 'The loop is empty',
  // 1.10.0-beta.3: «Відлік» items in the running order
  'Змінити відлік': 'Edit the countdown',
  'Хвилини чи хв:сс — 5, 7:30, 1:05:00': 'Minutes or m:ss — 5, 7:30, 1:05:00',
  'Введіть, наприклад, 5 або 7:30': 'Type, for example, 5 or 7:30',
  'Наступний пункт': 'Next item',
  'пункти «Відлік»': 'countdown items',
  // 1.10.0-beta.2: «Заставка» items in the running order
  'Змінити заставку': 'Edit the cover',
  'Без зображення': 'No picture',
  'пункти «Заставка»': 'cover items',
  'Додайте зображення в «Медіа → Зображення»': 'Add pictures in “Media → Images”',
  // 1.10.0-beta.1: «Далі» past a running-order item's end
  'Після кінця пункту «Далі» відкриває наступний': '“Next” past an item’s end opens the next one',
  'Пункт послідовності показу: після його останнього вірша, строфи чи фото «Далі» відкриває наступний пункт, «Назад» на першому — попередній.':
    'A running-order item: after its last verse, stanza, or photo, “Next” opens the next item, and “Back” at its first opens the previous one.',
  // 1.9.3: a list file the server couldn't read a moment ago is not written over
  'Не вдалося прочитати {file}, тому його не перезаписано. Спробуйте ще раз.':
    'Couldn’t read {file}, so it wasn’t written over. Try again.',
  // 1.9.1: items of a newer version in the running order
  'Пункт новішої версії': 'An item of a newer version',
  'Пункт новішої версії: {name}': 'An item of a newer version: {name}',
  'Цей пункт додала новіша версія застосунку — оновіть застосунок, щоб показати його':
    'A newer version of the app added this item — update the app to show it',
  'Далі лише пункти новішої версії — оновіть застосунок, щоб показати їх':
    'Only items of a newer version come next — update the app to show them',
  'Перед ним лише пункти новішої версії — оновіть застосунок, щоб показати їх':
    'Only items of a newer version come before it — update the app to show them',
  'У послідовності лише пункти новішої версії — оновіть застосунок, щоб показати їх':
    'The running order holds only items of a newer version — update the app to show them',
  'пункти із зображеннями': 'image items',
  альбоми: 'album items',
  відео: 'video items',
  'пункти новішої версії': 'items of a newer version',
  'Увага: версія {version} не відкриє вікно керування, поки в послідовності показу чи в збережених програмах є {what}. Перш ніж перейти, приберіть їх; програму відкрийте, приберіть пункти й збережіть її знову.':
    'Note: version {version} won’t open the control window while the running order or a saved program holds {what}. Remove them before you switch; for a program, open it, remove the items, and save it again.',
  'Увага: версія {version} на Windows не зможе оновитися назад, поки відкритий браузер, який вона запустить. Коли знадобиться оновитися з неї, закрийте браузер повністю.':
    'Note: on Windows, version {version} can’t update back while a browser it started is open. Before you update from it, close the browser completely.',
  'Версії, старіші за 1.8.8, на Windows недоступні для вибору: з них не вдається оновитися назад, поки відкритий браузер, який вони запустили.':
    'Versions older than 1.8.8 can’t be picked on Windows: they can’t update back while a browser they started is open.',
};

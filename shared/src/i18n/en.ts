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
  'Конфлікт із «{actions}» — спрацюють разом': 'Conflicts with «{actions}» — they fire together',
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
  'Запускає застосунок і відкриває вікно керування окремим вікном — без вкладок і адресного рядка (Chrome або Edge).':
    'Starts the app and opens the control window as its own window — no tabs, no address bar (Chrome or Edge).',
  'Створити ярлик': 'Create shortcut',
  // «Вимкнути повністю» (web/src/components/ShutdownSection.tsx)
  'менше 1 МБ': 'under 1 MB',
  '≈ {mb} МБ': '≈ {mb} MB',
  'Не вдалося вимкнути: {error}': "Couldn't switch off: {error}",
  'Застосунок вимкнено': 'The app is switched off',
  'Цю вкладку можна закрити.': 'You can close this tab.',
  'Вимкнути повністю': 'Switch off completely',
  'Зупиняє застосунок і очікувача, вимикає «Запуск за адресою» разом з комп’ютером, закриває вікна виводу. Після цього нічого не працює у фоні.':
    'Stops the app and the waiter, turns off «Start on open» with the computer, and closes the output windows. Nothing runs in the background afterwards.',
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
    'The whole library from the server. «In the browser» — the chosen translations work right here (a database in WebAssembly), without requests to the server.',
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
    "The file «{name}» is no longer in the browser's cache — drop it here again",
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
};

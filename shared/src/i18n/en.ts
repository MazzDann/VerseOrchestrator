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
  'Перейти: Ів 3:16': 'Go to: John 3:16',
  'Перейти до посилання': 'Go to a reference',
  Джерела: 'Sources',
  'Пошук пісень з .pptx і показ куплетів': 'Find songs from .pptx files and show their stanzas',
  'Скласти й показати довільний текст': 'Write and show any text',
  'Черга уривків, пісень і текстів; збережені програми':
    'A queue of passages, songs, and texts; saved programs',
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
  'Оберіть книгу та розділ': 'Choose a book and a chapter',
  'Що зараз на екрані показу': "What's on the presentation screen now",
  'Попередня сторінка': 'Previous page',
  'Сторінка довгого уривка (← → або PageUp/PageDown)':
    'Page of a long passage (← → or PageUp/PageDown)',
  'Наступна сторінка': 'Next page',
  Розділи: 'Chapters',
  'Оберіть книгу ліворуч, потім розділ угорі.': 'Choose a book on the left, then a chapter above.',
  'Оберіть розділ угорі.': 'Choose a chapter above.',
  'У цьому розділі немає віршів у головному перекладі.':
    'This chapter has no verses in the main translation.',
  'Ширина правої панелі': 'Right panel width',
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
  'Це останній вірш книги': 'This is the last verse of the book',
  'Це перший вірш книги': 'This is the first verse of the book',
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
  'Попередній елемент': 'Previous item',
  'Попередній елемент показу': 'Previous running order item',
  'Наступний елемент': 'Next item',
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
  'Браузер заблокував вікно — дозвольте спливні вікна для цього сайту':
    'The browser blocked the window — allow pop-ups for this site',
  'Цей браузер не передає жест іншому вікну — натисніть F у самому вікні':
    "This browser doesn't pass the gesture to another window — press F in the window itself",
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
  'НА ЕКРАНІ': 'ON SCREEN',
  ЗАРАЗ: 'NOW',
  ДАЛІ: 'NEXT',
  '— кінець / немає наступного —': '— end / nothing next —',
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
  'Невідомий параметр «{arg}». Можна: --no-browser, --port N, --check, --off, --app, --shortcut':
    'Unknown option “{arg}”. Options: --no-browser, --port N, --check, --off, --app, --shortcut',
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
  'Він запускає застосунок і відкриває вікно керування окремим вікном (Chrome або Edge).':
    'It starts the app and opens the control window as its own window (Chrome or Edge).',
  'Застосунок уже працює: {url}': 'The app is already running: {url}',
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
  'Перевірити зараз': 'Check now',
  'Перевіряти оновлення': 'Check for updates',
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
  'Архів оновлення пошкоджено: контрольна сума не збігається':
    'The update archive is damaged: the checksum doesn’t match',
  'Не вдалося завантажити оновлення: немає зв’язку з GitHub':
    'Couldn’t download the update: no connection to GitHub',
  'Не вдалося розпакувати оновлення': 'Couldn’t unpack the update',
  'Архів оновлення має незнайому будову': 'The update archive has an unknown layout',
  'В архіві оновлення не та версія': 'The update archive holds a different version',
  'Не вдалося замінити папку app/ — працює попередня версія':
    'Couldn’t replace the app/ folder — the previous version is running',
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
};

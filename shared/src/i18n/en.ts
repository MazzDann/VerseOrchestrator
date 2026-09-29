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
};

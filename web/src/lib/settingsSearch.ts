import { create } from 'zustand';
import { N_ } from '@vo/shared';
import { HOTKEY_ACTIONS } from '../hotkeys';
import { tr } from '../i18n';

/** The settings panel's sections (SettingsPanel.tsx `Section value`). */
export type SettingsSectionId =
  | 'presets'
  | 'text'
  | 'motion'
  | 'cover'
  | 'countdown'
  | 'search'
  | 'video'
  | 'stageTimer'
  | 'stage'
  | 'background'
  | 'layout'
  | 'passages'
  | 'highlight'
  | 'hotkeys'
  | 'app';

/** The sections' titles, as the panel names them. */
export const SECTION_TITLES: Record<SettingsSectionId, string> = {
  presets: N_('Пресети'),
  text: N_('Текст'),
  motion: N_('Переходи й анімація'),
  cover: N_('Заставка'),
  countdown: N_('Відлік'),
  search: N_('Пошук'),
  video: N_('Відео'),
  stageTimer: N_('Таймер доповідача'),
  stage: N_('Сцена'),
  background: N_('Фон'),
  layout: N_('Розкладка слайда'),
  passages: N_('Довгі уривки'),
  highlight: N_('Виділення'),
  hotkeys: N_('Гарячі клавіші'),
  app: N_('Застосунок'),
};

/** One setting a search finds: its label (an interface key) and words people may type for it. */
export interface SettingEntry {
  section: SettingsSectionId;
  label: string;
  /** other words for it, in Ukrainian and English (not shown) */
  words?: string;
}

const e = (section: SettingsSectionId, label: string, words?: string): SettingEntry => ({
  section,
  label,
  words,
});

/**
 * Every setting by its label (1.13.0-beta.3, users' report F1010-11: «де той перемикач?»). A guard
 * test checks that every label of the panel is here, so a new setting is found from its first day.
 */
export const SETTINGS_INDEX: SettingEntry[] = [
  e('presets', N_('Пресети'), 'preset вигляд look theme тема'), // i18n-ignore: Ukrainian search words
  e('presets', N_('Скинути вигляд до типового'), 'reset default'),
  e('text', N_('Шрифт'), 'font шрифти'), // i18n-ignore: Ukrainian search words
  e('text', N_('Колір'), 'color колір тексту text color'), // i18n-ignore: Ukrainian search words
  e('text', N_('Вирівнювання'), 'align центр ліворуч праворуч'), // i18n-ignore: Ukrainian search words
  e('text', N_('Номери віршів на екрані'), 'verse numbers номери'), // i18n-ignore: Ukrainian search words
  e(
    'motion',
    N_('Перехід між слайдами'),
    'transition fade animation анімація без анімації наплив плавний швидкий', // i18n-ignore
  ),
  e('cover', N_('Текст заставки'), 'cover logo заставка'), // i18n-ignore: Ukrainian search words
  e('cover', N_('Логотип'), 'logo картинка зображення'), // i18n-ignore: Ukrainian search words
  e('cover', N_('Прибрати логотип')),
  e('countdown', N_('Звук останніх 5 секунд'), 'sound beep звук 54321'), // i18n-ignore: Ukrainian search words
  e('countdown', N_('Попередження'), 'warning'),
  e('countdown', N_('Колір попередження'), 'warning color'),
  e('countdown', N_('Інший колір після нуля'), 'overtime мінус'), // i18n-ignore: Ukrainian search words
  e('countdown', N_('Колір після нуля'), 'overtime color'),
  e('countdown', N_('Розмір часу'), 'size'),
  e('countdown', N_('Шрифт часу'), 'font'),
  e('countdown', N_('Як писати час'), 'format формат'), // i18n-ignore: Ukrainian search words
  e('countdown', N_('Кут для відліку'), 'corner кут'), // i18n-ignore: Ukrainian search words
  e('countdown', N_('Розмір у кутку'), 'corner size'),
  e('countdown', N_('Напис'), 'caption підпис'), // i18n-ignore: Ukrainian search words
  e('search', N_('Де шукати слова спершу'), 'search scope F3 F4'),
  e('search', N_('Де поле пошуку'), 'search field place'),
  e('search', N_('Той самий вірш з різних перекладів — одним рядком'), 'group rows'),
  e('search', N_('Курсор у пошук, коли повертаєтеся до вікна керування'), 'focus cursor'),
  e('video', N_('Після кінця відео'), 'video end'),
  e('video', N_('Телефони глядачів під час відео'), 'phones viewers'),
  e('stageTimer', N_('Попередження'), 'speaker timer warning'),
  e('stageTimer', N_('Колір попередження')),
  e('stageTimer', N_('Інший колір після нуля')),
  e('stageTimer', N_('Колір після нуля')),
  e('stageTimer', N_('Шрифт часу')),
  e('stageTimer', N_('Як писати час')),
  e('stage', N_('Вигляд «Сцени»'), 'stage words thumbnails'),
  e('stage', N_('Розмір тексту на «Сцені»'), 'stage text size'),
  e('stage', N_('Тема «Сцени»'), 'stage theme dark light'),
  e('stage', N_('Показувати «Далі»'), 'next'),
  e('stage', N_('Де ми: «вірш 16 з 36», «строфа 3 з 5»'), 'place'),
  e('stage', N_('Послідовність показу внизу'), 'running order'),
  e('stage', N_('Годинник із секундами'), 'clock seconds годинник'), // i18n-ignore: Ukrainian search words
  e('stage', N_('Вигляд')),
  e('stage', N_('Розмір тексту')),
  e('stage', N_('Тема')),
  e('background', N_('Колір фону'), 'background color'),
  e('background', N_('Фонове зображення'), 'background image picture'),
  e('background', N_('Прибрати фон')),
  e('layout', N_('Відступи від країв'), 'padding margins template layout шаблон макет'), // i18n-ignore: Ukrainian search words
  e('passages', N_('Віршів на слайд'), 'pages verses per slide сторінки'), // i18n-ignore: Ukrainian search words
  e('passages', N_('Прогресивне розкриття'), 'reveal progressive поступове'), // i18n-ignore: Ukrainian search words
  e('passages', N_('Прожектор'), 'spotlight'),
  e('passages', N_('Плейсхолдери'), 'placeholders'),
  e('highlight', N_('Слова Ісуса кольором'), 'red letter jesus червоні'), // i18n-ignore: Ukrainian search words
  e('highlight', N_('Колір слів Ісуса'), 'red letter color'),
  e('highlight', N_('Колір виділеного слова (Стронг)'), 'strong highlight'),
  e('highlight', N_('Текст Стронга на показі'), 'strong subline'),
  e('hotkeys', N_('Стрілки'), 'arrows keys клавіші'), // i18n-ignore: Ukrainian search words
  e('hotkeys', N_('Після кінця пункту «Далі» відкриває наступний'), 'running order next item'),
  e('hotkeys', N_('Кілька віршів — на екран після Enter'), 'several verses pick ctrl shift вибір'), // i18n-ignore: Ukrainian search words
  e('app', N_('Простий вигляд'), 'simple view'),
  e('app', N_('Мова інтерфейсу'), 'language english українська'), // i18n-ignore: Ukrainian search words
  e('app', N_('Розташування панелі прев’ю'), 'preview panel bottom'),
  e('app', N_('Бібліотека модулів'), 'library modules mybible rescan пересканувати'), // i18n-ignore: Ukrainian search words
  e('app', N_('Джерело даних'), 'data source browser server'),
  e('app', N_('Порівняти рушії бази'), 'engines benchmark'),
  e('app', N_('Оновлення'), 'update version release'),
  e('app', N_('Перевіряти оновлення'), 'update check'),
  e('app', N_('Канал оновлень'), 'channel beta stable'),
  e('app', N_('Версія'), 'version rollback'),
  e('app', N_('Резервна копія'), 'backup restore zip'),
  e('app', N_('Автоматичні копії'), 'backup auto daily'),
  e('app', N_('Робити копії автоматично')),
  e('app', N_('Відновити з копії'), 'restore'),
  e('app', N_('Інша копія'), 'other copy import'),
  e('app', N_('Перенести з іншої копії'), 'import copy'),
  e('app', N_('Запуск за адресою'), 'standby port address'),
  e('app', N_('Порт'), 'port'),
  e('app', N_('Відкривати вікно керування в…'), 'browser chrome edge firefox'),
  e('app', N_('Окремим вікном'), 'app window'),
  e('app', N_('Ярлик на робочому столі'), 'shortcut desktop'),
  e('app', N_('Вимкнути повністю'), 'shutdown quit'),
  e('app', N_('Відгук'), 'feedback'),
];

const fold = (s: string) =>
  s
    .toLocaleLowerCase()
    .replace(/[’ʼ']/g, '')
    .replace(/[«»"]/g, '')
    .replace(/й/g, 'и') // i18n-ignore: folding
    .replace(/ё/g, 'е'); // i18n-ignore: folding

/** Does `entry` answer the query (its words, any of its label's languages, its section's title)? */
const answers = (entry: SettingEntry, q: string) =>
  fold(
    `${tr(entry.label)} ${entry.label} ${entry.words ?? ''} ${tr(SECTION_TITLES[entry.section])}`,
  )
    .split(/\s+/)
    .join(' ')
    .includes(q);

/** The settings a query finds, the keys too («Гарячі клавіші»: each action by its name). */
export function findSettings(query: string): SettingEntry[] {
  const q = fold(query.trim()).replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const keys = HOTKEY_ACTIONS.map((a) => e('hotkeys', a.label, `${a.hint} ${tr(a.hint)}`));
  return [...SETTINGS_INDEX, ...keys].filter((x) => answers(x, q));
}

/** Whether a piece of the panel's text holds the query (the hits are marked in place). */
export function textHolds(text: string, query: string): boolean {
  const q = fold(query.trim()).replace(/\s+/g, ' ');
  return q.length >= 2 && fold(text).replace(/\s+/g, ' ').includes(q);
}

/**
 * The settings panel's search field, shared with Ctrl+K: a setting picked in the palette opens the
 * panel with its name typed (1.13.0-beta.3, the author's Q9b). Not kept between sessions.
 */
export const useSettingsFind = create<{ query: string; setQuery: (q: string) => void }>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}));

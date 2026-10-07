import { type MutableRefObject } from 'react';
import {
  IconScreenShare,
  IconDeviceTv,
  IconSquareOff,
  IconSun,
  IconHelp,
  IconMessageReport,
  IconSearch,
  IconMusic,
  IconLetterT,
  IconSquareFilled,
  IconHourglassHigh,
  IconAdjustments,
  IconList,
  IconPlaylistAdd,
  IconLayoutDashboard,
  IconQrcode,
  IconDeviceMobile,
  IconAppWindow,
} from '@tabler/icons-react';
import { type Appearance } from '../../settingsStore';
import { formatRemaining, savedLength } from '../../lib/countdown';
import { type SearchScope } from '../../components/SearchPanel';
import { type CommandItem } from '../../components/CommandPalette';
import { docsUrl } from '../../lib/docs';
import { openFeedback } from '../../lib/feedback';
import { tr, useLang } from '../../i18n';
import { openPresenter, openStage } from './outputWindows';

/** The command palette's lines (Ctrl+K): the operator's actions, built afresh each render. */
export function usePaletteCommands({
  sendAndNotify,
  hideToggle,
  blackToggle,
  appearance,
  countdownStartSaved,
  clearScreen,
  restoreRef,
  addCurrentPassage,
  showOrder,
  setSongsOpen,
  setTextOpen,
  openSearch,
  setFollowOpen,
  setRemoteOpen,
  setOutputsOpen,
  setSettingsOpen,
  liveFollow,
  setLiveFollow,
  colorScheme,
  toggleColorScheme,
}: {
  sendAndNotify: () => void;
  hideToggle: () => void;
  blackToggle: () => void;
  appearance: Appearance;
  countdownStartSaved: () => void;
  clearScreen: () => void;
  restoreRef: MutableRefObject<() => void>;
  addCurrentPassage: () => void;
  /** the running order under the monitors (1.8.12-beta.6 — a floating panel before) */
  showOrder: () => void;
  setSongsOpen: (open: boolean) => void;
  setTextOpen: (open: boolean) => void;
  openSearch: (scope?: SearchScope) => void;
  setFollowOpen: (open: boolean) => void;
  setRemoteOpen: (open: boolean) => void;
  setOutputsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  liveFollow: boolean;
  setLiveFollow: (v: boolean) => void;
  colorScheme: 'light' | 'dark';
  toggleColorScheme: () => void;
}): CommandItem[] {
  const lang = useLang();
  // Operator actions exposed in the command palette (Ctrl+K). Fresh closures each
  // render so they never go stale; the palette only reads this while open.
  const paletteCommands: CommandItem[] = [
    {
      id: 'project',
      label: tr('На екран'),
      hint: tr('Показати вибір'),
      keywords: 'project show project',
      icon: <IconDeviceTv size={16} />,
      run: sendAndNotify,
    },
    {
      id: 'blank',
      label: tr('Сховати / показати текст'),
      keywords: 'blank zatemnyty',
      icon: <IconSquareOff size={16} />,
      run: hideToggle,
    },
    {
      id: 'black',
      label: tr('Чорний екран'),
      keywords: 'black chornyi',
      icon: <IconSquareFilled size={16} />,
      run: blackToggle,
    },
    {
      id: 'countdown',
      label: tr('Відлік: {time}', {
        time: formatRemaining(savedLength(appearance.countdownMinutes)),
      }),
      keywords: 'countdown timer vidlik',
      icon: <IconHourglassHigh size={16} />,
      run: countdownStartSaved,
    },
    { id: 'clear', label: tr('Прибрати з екрана'), keywords: 'clear ochystyty', run: clearScreen },
    {
      id: 'restore',
      label: tr('Повернути прибраний слайд'),
      keywords: 'undo restore povernuty',
      run: () => restoreRef.current(),
    },
    {
      id: 'addPassage',
      label: tr('Додати уривок у показ'),
      keywords: 'playlist add',
      icon: <IconPlaylistAdd size={16} />,
      run: addCurrentPassage,
    },
    {
      id: 'playlist',
      label: tr('Послідовність показу'),
      keywords: 'playlist sequence',
      icon: <IconList size={16} />,
      run: showOrder,
    },
    {
      id: 'songs',
      label: tr('Пісні'),
      keywords: 'songs pisni',
      icon: <IconMusic size={16} />,
      run: () => setSongsOpen(true),
    },
    {
      id: 'text',
      label: tr('Власний текст'),
      keywords: 'text tekst',
      icon: <IconLetterT size={16} />,
      run: () => setTextOpen(true),
    },
    {
      id: 'search',
      label: tr('Пошук в усіх модулях'),
      keywords: 'search poshuk',
      icon: <IconSearch size={16} />,
      run: () => openSearch('all'),
    },
    {
      id: 'presenter',
      label: tr('Відкрити вікно показу'),
      keywords: 'presenter output',
      icon: <IconScreenShare size={16} />,
      run: () => void openPresenter(),
    },
    {
      id: 'stage',
      label: tr('Сцена'),
      keywords: 'stage monitor',
      icon: <IconLayoutDashboard size={16} />,
      run: () => void openStage(),
    },
    {
      id: 'follow',
      label: tr('Глядачі (QR)'),
      keywords: 'follow qr phones',
      icon: <IconQrcode size={16} />,
      run: () => setFollowOpen(true),
    },
    {
      id: 'remote',
      label: tr('Пульт доповідача'),
      keywords: 'remote speaker phone pult',
      icon: <IconDeviceMobile size={16} />,
      run: () => setRemoteOpen(true),
    },
    {
      id: 'outputs',
      label: tr('Вікна виводу'),
      keywords: 'windows screens monitors outputs vikna ekrany',
      icon: <IconAppWindow size={16} />,
      run: () => setOutputsOpen(true),
    },
    {
      id: 'settings',
      label: tr('Налаштування вигляду'),
      keywords: 'settings nalashtuvannia',
      icon: <IconAdjustments size={16} />,
      run: () => setSettingsOpen(true),
    },
    {
      id: 'liveFollow',
      label: liveFollow ? tr('Наживо: вимкнути') : tr('Наживо: увімкнути'),
      keywords: 'live follow',
      run: () => setLiveFollow(!liveFollow),
    },
    {
      id: 'feedback',
      label: tr('Надіслати відгук'),
      keywords: 'feedback bug issue idea report vidguk pomylka',
      icon: <IconMessageReport size={16} />,
      run: () => openFeedback(lang),
    },
    {
      id: 'docs',
      label: tr('Довідка'),
      keywords: 'help docs guide manual dovidka posibnyk',
      icon: <IconHelp size={16} />,
      run: () => window.open(docsUrl(lang), '_blank', 'noopener'),
    },
    {
      id: 'theme',
      label: colorScheme === 'dark' ? tr('Світла тема') : tr('Темна тема'),
      keywords: 'theme tema dark light',
      icon: <IconSun size={16} />,
      run: () => toggleColorScheme(),
    },
  ];
  return paletteCommands;
}

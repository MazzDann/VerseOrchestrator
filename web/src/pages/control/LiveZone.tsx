import { type MutableRefObject } from 'react';
import { Switch, Tooltip } from '@mantine/core';
import { IconDeviceTv, IconPhoto, IconSquareFilled, IconSquareOff } from '@tabler/icons-react';
import { type Slide, type SlideCountdown, type SlideLine } from '../../presenterBus';
import { type AfterZero, type CountdownPlace, type StageTimer } from '../../lib/countdown';
import { type HeaderFold } from '../../lib/headerFold';
import { type Keymap } from '../../hotkeys';
import { useSettings } from '../../settingsStore';
import { CountdownTool } from '../../components/CountdownTool';
import { StageTimerTool } from '../../components/StageTimerTool';
import { StageMessageTool } from '../../components/StageMessageTool';
import { ToolButton, ToolIcon, ToolZone } from '../../components/Toolbar';
import { tr, useLang } from '../../i18n';
import { standbyNotice } from './standby';

/** What the header's go-live zone needs from Control (`fold`, `keymap` and `divider` come from the header). */
export interface LiveZoneProps {
  liveFollow: boolean;
  setLiveFollow: (v: boolean) => void;
  slideLines: SlideLine[];
  isLeader: boolean;
  sendAndNotify: () => void;
  textHidden: boolean;
  hideToggle: () => void;
  blackOn: boolean;
  blackToggle: () => void;
  coverOn: boolean;
  coverToggle: () => void;
  viewersTimer: SlideCountdown | null | undefined;
  cornerOn: boolean;
  countdownStart: (countdown: SlideCountdown, place: CountdownPlace) => void;
  countdownShift: (minutes: number) => void;
  leaderRef: MutableRefObject<boolean>;
  countdownPause: () => void;
  countdownAfterZero: (afterZero: AfterZero) => void;
  countdownChange: (countdown: SlideCountdown | null, corner?: boolean) => void;
  takeCoverOff: () => void;
  setCountdownOpen: (open: boolean) => void;
  liveSlide: Slide;
  stageTimerStart: (ms: number, afterZero: AfterZero) => void;
  stageTimerPause: () => void;
  stageTimerShift: (minutes: number) => void;
  stageTimerAfterZero: (afterZero: AfterZero) => void;
  stageTimerSet: (timer: StageTimer | null) => void;
  setStageTimerOpen: (open: boolean) => void;
  stageMessageSet: (text: string | null) => void;
  setStageMessageOpen: (open: boolean) => void;
}

/**
 * «Вихід на екран» in the header: «Наживо», «На екран», «Сховати текст», «Чорний екран»,
 * «Заставка», «Відлік», «Таймер доповідача» and «Повідомлення на сцену». It never folds into «Ще».
 */
export function LiveZone({
  divider,
  fold,
  keymap,
  liveFollow,
  setLiveFollow,
  slideLines,
  isLeader,
  sendAndNotify,
  textHidden,
  hideToggle,
  blackOn,
  blackToggle,
  coverOn,
  coverToggle,
  viewersTimer,
  cornerOn,
  countdownStart,
  countdownShift,
  leaderRef,
  countdownPause,
  countdownAfterZero,
  countdownChange,
  takeCoverOff,
  setCountdownOpen,
  liveSlide,
  stageTimerStart,
  stageTimerPause,
  stageTimerShift,
  stageTimerAfterZero,
  stageTimerSet,
  setStageTimerOpen,
  stageMessageSet,
  setStageMessageOpen,
}: LiveZoneProps & { divider: boolean; fold: HeaderFold; keymap: Keymap }) {
  useLang();
  const pickBeforeEnter = useSettings((s) => s.pickBeforeEnter);
  return (
    <ToolZone label={tr('Вихід на екран')} divider={divider}>
      <Tooltip
        label={
          pickBeforeEnter
            ? tr(
                'Увімкнено: екран одразу повторює вибір, а вірші, додані з Ctrl чи Shift, — після Enter. Вимкнено: лише прев’ю, показ кнопкою «На екран»',
              )
            : tr(
                'Увімкнено: екран одразу повторює вибір. Вимкнено: лише прев’ю, показ кнопкою «На екран»',
              )
        }
        multiline
        w={240}
        withArrow
        openDelay={250}
      >
        <Switch
          size="sm"
          color="live"
          checked={liveFollow}
          onChange={(e) => setLiveFollow(e.currentTarget.checked)}
          label={fold.noGoTo ? undefined : tr('Наживо')}
          aria-label={tr('Наживо')}
          styles={{ label: { paddingInlineStart: 6, whiteSpace: 'nowrap' } }}
        />
      </Tooltip>
      <ToolButton
        label={tr('На екран')}
        hint={tr('Показати поточний вибір')}
        text={tr('На екран')}
        compact={fold.projectIconOnly}
        variant="filled"
        color="live"
        combo={keymap.project}
        icon={<IconDeviceTv size={18} stroke={1.5} />}
        disabled={slideLines.length === 0 || !isLeader}
        onClick={sendAndNotify}
      />
      <ToolButton
        label={textHidden ? tr('Показати текст') : tr('Сховати текст')}
        hint={
          textHidden
            ? tr('Повернути той самий слайд')
            : tr('Текст згасає, фон лишається; ще раз — той самий слайд назад')
        }
        text={textHidden ? tr('Показати текст') : tr('Сховати текст')}
        compact={fold.iconsOnly}
        variant={textHidden ? 'filled' : 'default'}
        active={textHidden}
        color={textHidden ? 'cue' : undefined}
        combo={keymap.blank}
        icon={<IconSquareOff size={18} stroke={1.5} />}
        disabled={!isLeader}
        onClick={hideToggle}
      />
      <ToolIcon
        label={blackOn ? tr('Зняти чорний екран') : tr('Чорний екран')}
        hint={
          blackOn
            ? tr('Повернути те, що було')
            : tr('Одразу все чорне, навіть фон; ще раз — усе назад')
        }
        combo={keymap.black}
        icon={<IconSquareFilled size={16} />}
        color="dark"
        active={blackOn}
        disabled={!isLeader}
        onClick={blackToggle}
      />
      <ToolIcon
        label={coverOn ? tr('Прибрати заставку') : tr('Заставка')}
        hint={
          coverOn
            ? tr('Повернути те, що було')
            : tr('Логотип і текст між елементами; ще раз — те, що було')
        }
        combo={keymap.cover}
        icon={<IconPhoto size={18} stroke={1.5} />}
        active={coverOn}
        disabled={!isLeader}
        onClick={coverToggle}
      />
      <CountdownTool
        running={viewersTimer ?? null}
        inCorner={cornerOn}
        disabled={!isLeader}
        combo={keymap.countdown}
        onStart={countdownStart}
        onShift={countdownShift}
        onPause={() => (leaderRef.current ? countdownPause() : standbyNotice())}
        onAfterZero={countdownAfterZero}
        onKeepCover={() => countdownChange(null, false)}
        onRemove={() =>
          !leaderRef.current
            ? standbyNotice()
            : cornerOn
              ? countdownChange(null, true)
              : takeCoverOff()
        }
        onOpenChange={setCountdownOpen}
      />
      <StageTimerTool
        running={liveSlide.stageTimer ?? null}
        disabled={!isLeader}
        onStart={stageTimerStart}
        onPause={stageTimerPause}
        onShift={stageTimerShift}
        onAfterZero={stageTimerAfterZero}
        onRemove={() => stageTimerSet(null)}
        onOpenChange={setStageTimerOpen}
      />
      <StageMessageTool
        message={liveSlide.stageMessage ?? null}
        disabled={!isLeader}
        onSend={stageMessageSet}
        onOpenChange={setStageMessageOpen}
      />
    </ToolZone>
  );
}

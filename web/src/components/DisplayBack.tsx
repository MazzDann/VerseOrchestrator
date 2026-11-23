import { useEffect, useRef } from 'react';
import { hasSecondScreen, onDesktopDisplayBack, outputAtStartOn } from '../lib/desktop';
import { useSettings } from '../settingsStore';

/**
 * A 2nd screen plugged back in, in the desktop app (1.24.0-beta.2, the author): the shell returned
 * the output windows the unplug moved; this control window (the one in charge) does the operator's
 * choice — leave the screen as it was, «Чорний екран», or empty it — and opens one when none was
 * there while «Відкривати вікно показу автоматично» is on. Rendered in Control, no effects there.
 */
export function DisplayBack({
  enabled,
  black,
  clear,
  isBlack,
  openOutput,
}: {
  enabled: boolean;
  black: () => void;
  clear: () => void;
  isBlack: () => boolean;
  openOutput: () => void;
}) {
  const latest = useRef({ enabled, black, clear, isBlack, openOutput });
  latest.current = { enabled, black, clear, isBlack, openOutput };
  useEffect(
    () =>
      onDesktopDisplayBack((returned) => {
        const k = latest.current;
        if (!k.enabled) return;
        const s = useSettings.getState();
        if (returned === 0) {
          if (outputAtStartOn(s.outputAtStart) && hasSecondScreen()) k.openOutput();
          return;
        }
        if (s.displayBack === 'black' && !k.isBlack()) k.black();
        else if (s.displayBack === 'clear') k.clear();
      }),
    [],
  );
  return null;
}

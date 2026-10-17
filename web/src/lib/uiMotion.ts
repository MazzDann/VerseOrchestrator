import { useEffect } from 'react';
import { useSettings } from '../settingsStore';

/**
 * «Анімації інтерфейсу» (1.18.3, users' F1017-04): the control window and the settings window mark
 * the page `data-vo-motion="off"` unless the operator turned them on — styles.css then drops the
 * transitions and rise-ins. Output windows never carry the mark: the slides keep their transition.
 */
export function useUiMotion(): void {
  const on = useSettings((s) => s.uiMotion);
  useEffect(() => {
    document.documentElement.dataset.voMotion = on ? 'on' : 'off';
    return () => {
      delete document.documentElement.dataset.voMotion;
    };
  }, [on]);
}

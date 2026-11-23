import { notifications } from '@mantine/notifications';
import { tr } from '../i18n';

/**
 * Is the «На екрані» monitor in sight in this window (1.25.0-beta.5 «Зручність»)? Its red frame says what is on
 * screen; a notice on every pick repeated it and, two at a time, covered the slides list (the vo-ux walk-through).
 */
export function screenInSight(): boolean {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  const el = document.querySelector('[data-screen-monitor]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/** «На екрані: …» — only when the monitor that shows it is out of sight (folded aside, a narrow window). */
export function noticeOnScreen(ref: string, autoClose = 1500): void {
  if (!ref || screenInSight()) return;
  notifications.show({ message: tr('На екрані: {ref}', { ref }), color: 'live', autoClose });
}

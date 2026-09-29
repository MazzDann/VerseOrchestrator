import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { tr } from '../i18n';
import { onSlideError } from './slideErrors';
import { currentOutputs, onOutputError, outputLabels } from './outputs';

const NOTICE_ID = 'slide-error';
/** the same failure again within this time (every retry of one broken slide) says nothing new */
const REPEAT_MS = 10_000;

/**
 * For the control window (0.13.0): a slide that failed to draw — in an output window or in
 * this window's own monitors — becomes one red notice with the reason. The window kept the
 * last slide that did draw, so the audience sees no break; the operator needs to know.
 */
export function useSlideErrorNotices(): void {
  useEffect(() => {
    let last = { message: '', at: 0 };
    const notify = (message: string, window?: string) => {
      const now = Date.now();
      if (message === last.message && now - last.at < REPEAT_MS) return;
      last = { message, at: now };
      notifications.hide(NOTICE_ID);
      notifications.show({
        id: NOTICE_ID,
        color: 'red',
        title: window
          ? tr('{window}: слайд не вдалося намалювати', { window })
          : tr('Слайд не вдалося намалювати'),
        // an output window keeps the last slide that drew, or goes black if even that fails
        message: window
          ? tr('Там лишився попередній слайд або чорний екран. Причина: {error}', {
              error: message,
            })
          : tr('У моніторах лишився попередній слайд. Причина: {error}', { error: message }),
      });
    };
    const offOwn = onSlideError((message) => notify(message));
    const offOutputs = onOutputError((id, message) =>
      notify(message, outputLabels(currentOutputs()).get(id) ?? tr('Вікно показу')),
    );
    return () => {
      offOwn();
      offOutputs();
    };
  }, []);
}

import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { tr } from '../i18n';
import { fullscreenOnNextClick } from '../openPresenter';
import { createChooserWatch } from './chooserWatch';
import { currentOutputs, onOutputRefused, outputLabels } from './outputs';

/**
 * For the control window (1.2.1): an output window the browser kept out of fullscreen —
 * asked from «Вікна виводу» or with «Відкривати на весь екран» — becomes one notice that
 * says what to do. Seen on a Mac: a presenter behind other windows answered «Permissions
 * check failed», and the operator waited for a fullscreen that never came.
 *
 * And (2026-10-10) one the browser took OUT of full screen while a file chooser was open here
 * (lib/chooserWatch.ts): the next click in this window puts it back, and a notice says so.
 */
export function useFullscreenRefusedNotices(): void {
  useEffect(() => {
    const offRefused = onOutputRefused((id) => {
      const window = outputLabels(currentOutputs()).get(id) ?? tr('Вікно показу');
      notifications.show({
        id: `fullscreen-refused-${id}`,
        color: 'orange',
        autoClose: 10_000,
        title: tr('{window}: не вдалося перейти на весь екран', { window }),
        message: tr('Браузер не дозволив. Натисніть F у самому вікні або клацніть у ньому.'),
      });
    });
    const watch = createChooserWatch({
      outputs: currentOutputs,
      dropped: (o) => {
        const window = outputLabels(currentOutputs()).get(o.id) ?? tr('Вікно показу');
        const lent = fullscreenOnNextClick(o);
        notifications.show({
          id: `fullscreen-dropped-${o.id}`,
          color: 'orange',
          autoClose: 15_000,
          title: tr('{window}: уже не на весь екран', { window }),
          message: lent
            ? tr(
                'Браузер так робить, коли у вікні керування відкрито вибір файлу. Клацніть будь-де у вікні керування — і «{window}» знову стане на весь екран. Або натисніть F у самому «{window}».',
                { window },
              )
            : tr(
                'Браузер так робить, коли у вікні керування відкрито вибір файлу. Натисніть F у самому «{window}» або клацніть у ньому.',
                { window },
              ),
        });
      },
    });
    // a click on a file input — the buttons that open choosers click their hidden input — opens
    // one, if the click still has its gesture (a lent one leaves none: no chooser then)
    const onClick = (e: Event) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'file') return;
      if (
        (navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive === false
      )
        return;
      watch.opening();
    };
    const onInput = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'file') watch.closed();
    };
    const onFocus = () => watch.closed();
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onInput, true);
    document.addEventListener('cancel', onInput, true);
    window.addEventListener('focus', onFocus);
    return () => {
      offRefused();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onInput, true);
      document.removeEventListener('cancel', onInput, true);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}

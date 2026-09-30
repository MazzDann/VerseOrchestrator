import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { tr } from '../i18n';
import { currentOutputs, onOutputRefused, outputLabels } from './outputs';

/**
 * For the control window (1.2.1): an output window the browser kept out of fullscreen —
 * asked from «Вікна виводу» or with «Відкривати на весь екран» — becomes one notice that
 * says what to do. Seen on a Mac: a presenter behind other windows answered «Permissions
 * check failed», and the operator waited for a fullscreen that never came.
 */
export function useFullscreenRefusedNotices(): void {
  useEffect(
    () =>
      onOutputRefused((id) => {
        const window = outputLabels(currentOutputs()).get(id) ?? tr('Вікно показу');
        notifications.show({
          id: `fullscreen-refused-${id}`,
          color: 'orange',
          autoClose: 10_000,
          title: tr('{window}: не вдалося перейти на весь екран', { window }),
          message: tr('Браузер не дозволив. Натисніть F у самому вікні або клацніть у ньому.'),
        });
      }),
    [],
  );
}

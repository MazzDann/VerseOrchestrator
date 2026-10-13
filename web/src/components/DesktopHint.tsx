import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../api';
import { tr, useLang } from '../i18n';
import { inDesktop } from '../lib/desktop';
import { useServer } from '../serverStore';

const SEEN = 'vo:desktop-hint';

/**
 * Once per browser (1.17.2): a release copy run in a browser hears that it can move to its own
 * window — «Налаштування вигляду → Застосунок → Окремий застосунок» (DesktopSection.tsx).
 */
export function DesktopHint() {
  useLang();
  const available = useServer((s) => s.available);
  useEffect(() => {
    if (available !== true || inDesktop()) return;
    try {
      if (localStorage.getItem(SEEN)) return;
    } catch {
      return;
    }
    let gone = false;
    void api
      .desktop()
      .then((s) => {
        if (gone || !s.release) return;
        localStorage.setItem(SEEN, '1');
        notifications.show({
          message: tr(
            'VerseOrchestrator тепер може працювати у власному вікні, без браузера: «Налаштування вигляду» → «Застосунок» → «Окремий застосунок».',
          ),
          autoClose: 15000,
        });
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [available]);
  return null;
}

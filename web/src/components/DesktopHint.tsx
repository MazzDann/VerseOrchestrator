import { useEffect } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAppWindow } from '@tabler/icons-react';
import { api } from '../api';
import { tr, useLang } from '../i18n';
import { inDesktop } from '../lib/desktop';
import { useServer } from '../serverStore';

const SEEN = 'vo:desktop-hint';
/** «Лишитися в браузері» pressed: the «Відкрити в застосунку» notice stops coming (1.21.1) */
const STAY = 'vo:desktop-hint-stay';
const NOTICE = 'vo-desktop-hint';

const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return 'unreadable'; // no storage — say nothing rather than every time
  }
};
const store = (key: string) => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private window — shown again next time */
  }
};

/**
 * A release copy run in a browser hears about its own window (1.18.0-beta.1). With the app installed
 * beside it (1.21.1, F1107) the notice comes at every start until «Лишитися в браузері»:
 * «Відкрити в застосунку» hands control over (the 1.18.1 handover — this tab then closes itself,
 * lib/desktop.ts leaveForDesktop). Not installed: once, where to install it — «Налаштування вигляду
 * → Застосунок → Окремий застосунок» (DesktopSection.tsx).
 */
export function DesktopHint() {
  useLang();
  const available = useServer((s) => s.available);
  useEffect(() => {
    if (available !== true || inDesktop()) return;
    let gone = false;
    void api
      .desktop()
      .then((s) => {
        if (gone || !s.release) return;
        if (!s.present) {
          if (stored(SEEN)) return;
          store(SEEN);
          notifications.show({
            message: tr(
              'VerseOrchestrator тепер може працювати у власному вікні, без браузера: «Налаштування вигляду» → «Застосунок» → «Окремий застосунок».',
            ),
            autoClose: 15000,
          });
          return;
        }
        if (stored(STAY)) return;
        notifications.show({
          id: NOTICE,
          autoClose: false,
          title: tr('У нас є застосунок'),
          message: (
            <Stack gap={6}>
              <Text size="sm">
                {tr(
                  'Він уже встановлений поруч: вікно показу саме стає на другий екран і на весь екран, звук іде без кліку.',
                )}
              </Text>
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<IconAppWindow size={14} />}
                  onClick={() => {
                    notifications.hide(NOTICE);
                    void api
                      .openDesktop()
                      .catch((e: Error) =>
                        notifications.show({ message: tr(e.message), color: 'red' }),
                      );
                  }}
                >
                  {tr('Відкрити в застосунку')}
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    store(STAY);
                    notifications.hide(NOTICE);
                  }}
                >
                  {tr('Лишитися в браузері')}
                </Button>
              </Group>
            </Stack>
          ),
        });
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [available]);
  return null;
}

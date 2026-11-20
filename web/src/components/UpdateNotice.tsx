import { useEffect, useRef } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { api, type UpdateState } from '../api';
import { useUpdateState, versionToNotice } from '../lib/updates';
import { tr, useLang } from '../i18n';

const NOTICE_ID = 'vo-update-notice';
/** a version said once per run of the control window (sessionStorage: this window, reloads too) */
const SEEN_KEY = 'vo:updateNoticed';
/** «під час запуску»: the server's first look may come a little after the page — not hours later */
const AT_START_MS = 5 * 60 * 1000;

const seenVersion = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const markSeen = (v: string) => {
  try {
    sessionStorage.setItem(SEEN_KEY, v);
  } catch {
    /* no storage: said again after a reload */
  }
};

/**
 * A new version said at the start (1.23.0-beta.5, the users' F1114-03: «Оновлюватись незручно,
 * потрібно аж у низ налаштувань лізти»; the author: only a notice at the start). One notice with
 * «Оновити»: it starts the download and opens «Налаштування вигляду» → «Застосунок» → «Оновлення»,
 * where the progress and «Перезапустити й оновити» are. Only the control window that leads, only
 * a copy from a release (a copy of the repository updates by git), not a version chosen on purpose.
 */
export function UpdateNotice({
  enabled,
  openUpdates,
}: {
  enabled: boolean;
  openUpdates: () => void;
}) {
  useLang();
  const state = useUpdateState();
  const queryClient = useQueryClient();
  const loadedAt = useRef(Date.now());
  const decided = useRef(false);
  const openRef = useRef(openUpdates);
  openRef.current = openUpdates;
  useEffect(() => {
    if (!enabled || decided.current || !state || state.checkedAt == null) return;
    if (Date.now() - loadedAt.current > AT_START_MS) {
      decided.current = true;
      return;
    }
    decided.current = true;
    const version = versionToNotice(state, seenVersion());
    if (!version) return;
    markSeen(version);
    const go = () => {
      notifications.hide(NOTICE_ID);
      // the state now, not when the notice came: a download may have started since (the review)
      const live = queryClient.getQueryData<UpdateState>(['update']);
      const phase = live?.installer?.phase ?? 'idle';
      if (phase === 'idle' || phase === 'error')
        api.downloadUpdate().then(
          (s) => queryClient.setQueryData(['update'], s),
          (e: unknown) => notifications.show({ message: (e as Error).message, color: 'red' }),
        );
      openRef.current();
    };
    notifications.show({
      id: NOTICE_ID,
      autoClose: false,
      title: tr('Є нова версія {version}', { version }),
      message: (
        <>
          <Text size="sm">{tr('Зараз у вас {version}.', { version: state.current })}</Text>
          <Group gap="xs" mt={6}>
            <Button size="xs" onClick={go}>
              {tr('Оновити')}
            </Button>
            <Button size="xs" variant="subtle" onClick={() => notifications.hide(NOTICE_ID)}>
              {tr('Пізніше')}
            </Button>
          </Group>
        </>
      ),
    });
  }, [enabled, state, queryClient]);
  return null;
}

import { useEffect } from 'react';
import { ScrollArea, Box, Title, Group, Text } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { ModulesFloating } from '../components/ModulesPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { tr, useLang } from '../i18n';
import { useUiMotion } from '../lib/uiMotion';
import { probeServer, useServer, versionHeading } from '../serverStore';
import { useSettingsSaveNotice } from '../lib/settingsSaveNotice';
import { SETTINGS_PANEL_KEY, SETTINGS_WINDOW_KEY, rememberPanelSize } from '../lib/panelBox';
import { useSettingsFind } from '../lib/settingsSearch';
import { SETTINGS_FIND_EVENT } from '../openPresenter';
import { inDesktop } from '../lib/desktop';
import { useFollowVersion } from '../lib/followVersion';

/**
 * Standalone settings window (`/settings`) — opened on a second monitor next to the
 * control window. Changes sync live to the control/presenter via a cross-window
 * `storage` listener that rehydrates the persisted settings store (see main.tsx).
 */
export function Settings() {
  const lang = useLang();
  useUiMotion();
  // the version in the header (2026-10-01): a git checkout by its label
  const devLabel = useServer((s) => s.devLabel);
  // a change the browser can't store says so here too (1.4.1)
  useSettingsSaveNotice();
  // the control window finds out whether the server is there; this window must ask itself —
  // «Оновлення» and the other server-backed sections wait for the answer
  useEffect(() => {
    if (useServer.getState().available === null) void probeServer();
  }, []);
  // The size the operator drags this window to is kept (1.4.6): as the settings panel's, whose
  // place and size the window opens with (openSettingsWindow). Only as the control window's
  // popup — the address typed into a browser tab would hand the panel the whole browser.
  useEffect(() => {
    if (!window.opener) return;
    const fromPanel = new URLSearchParams(location.search).get('from') === 'panel';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          rememberPanelSize(
            // opened from the panel: its size goes back there; opened by itself (1.24.1): its own
            fromPanel ? SETTINGS_PANEL_KEY : SETTINGS_WINDOW_KEY,
            window.innerWidth,
            window.innerHeight,
          ),
        400,
      );
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  // opened from the panel: at the section it was showing (openSettingsWindow `at`)
  // asked for a place (1.24.1): its element in sight, and words in the search
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const at = params.get('at');
    const anchor = params.get('anchor');
    const find = params.get('find');
    if (find) useSettingsFind.getState().setQuery(find);
    const t = setTimeout(
      () => {
        if (at)
          document
            .querySelector(`[data-settings-section="${CSS.escape(at)}"]`)
            ?.scrollIntoView({ block: 'start' });
        if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'center' });
      },
      anchor ? 400 : 50,
    );
    // words sent while the window is open (openSettingsWindow)
    const onFind = (e: Event) =>
      useSettingsFind.getState().setQuery((e as CustomEvent<string>).detail);
    window.addEventListener(SETTINGS_FIND_EVENT, onFind);
    return () => {
      clearTimeout(t);
      window.removeEventListener(SETTINGS_FIND_EVENT, onFind);
    };
  }, []);
  useFollowVersion(); // updated from here: this window too (1.25.3)
  const heading = versionHeading(devLabel, __APP_VERSION__);
  useEffect(() => {
    if (inDesktop()) document.title = `${tr('Налаштування вигляду')} — ${heading}`;
  }, [heading, lang]);
  return (
    <ScrollArea style={{ height: '100vh' }} type="auto">
      {/* 960: room for the sections on the left (1.24.0-beta.1, F1114-04); narrower windows as before */}
      <Box maw={960} mx="auto" px="md" py="lg">
        {/* the app's window says it in its title (1.25.2) */}
        {!inDesktop() && (
          <Group gap={8} mb="md" wrap="nowrap">
            <IconAdjustments size={22} style={{ flexShrink: 0 }} />
            <Title order={4} style={{ flexShrink: 0 }}>
              {tr('Налаштування вигляду')}
            </Title>
            <Text size="xs" c="dimmed" ml="auto" ta="right" style={{ minWidth: 0 }}>
              {versionHeading(devLabel, __APP_VERSION__)}
            </Text>
          </Group>
        )}
        <SettingsPanel />
      </Box>
      <ModulesFloating />
    </ScrollArea>
  );
}

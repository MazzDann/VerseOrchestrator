import { useState } from 'react';
import { Anchor, Button, Center, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconDeviceDesktop } from '@tabler/icons-react';
import { deskTokenOf } from '../lib/desk';
import { tr, useLang } from '../i18n';

/**
 * `/` opened from another computer of the network (1.9.0-beta.1, F1005-10): the control window
 * works only on the computer with the app (its settings, files and output windows live there).
 * This page says how to control the show from here — a desk link from the operator — and takes
 * one pasted in.
 */
export function OtherComputer() {
  useLang();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = () => {
    const token = deskTokenOf(link);
    if (!token) {
      setError(tr('У цьому посиланні немає коду пульта. Скопіюйте його повністю.'));
      return;
    }
    window.location.assign(`/desk#${encodeURIComponent(token)}`);
  };
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder radius="md" p="lg" maw={520} w="100%">
        <Stack gap="sm">
          <Group gap="xs" wrap="nowrap">
            <IconDeviceDesktop size={18} aria-hidden />
            <Title order={4} fw={600}>
              {tr('Керувати показом звідси — через пульт для комп’ютера')}
            </Title>
          </Group>
          <Text size="sm">
            {tr(
              'Повне вікно керування працює лише на комп’ютері, де запущено застосунок. Попросіть оператора створити пульт для цього комп’ютера (Пульт доповідача → Комп’ютер) і вставте його посилання сюди.',
            )}
          </Text>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              open();
            }}
          >
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <TextInput
                size="sm"
                style={{ flex: 1, minWidth: 0 }}
                aria-label={tr('Посилання на пульт')}
                placeholder="http://…/desk#…"
                value={link}
                error={error}
                onChange={(e) => {
                  setLink(e.currentTarget.value);
                  setError(null);
                }}
              />
              <Button size="sm" type="submit" disabled={!link.trim()}>
                {tr('Відкрити')}
              </Button>
            </Group>
          </form>
          <Text size="xs" c="dimmed">
            {tr('Лише читати текст разом із показом:')}{' '}
            <Anchor href="/follow" size="xs">
              {tr('сторінка для глядачів')}
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}

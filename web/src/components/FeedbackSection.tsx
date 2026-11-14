import { useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileZip, IconMessageReport } from '@tabler/icons-react';
import { tr, useLang } from '../i18n';
import { openFeedback } from '../lib/feedback';
import { saveDiagnostics } from '../lib/diagnostics';
import { useServer } from '../serverStore';

/**
 * «Відгук» (1.2.0): a bug, an idea, or a question — through the feedback form on GitHub. And
 * «Зберегти діагностику» (1.22.0-beta.5, users' F1107-05): a .zip to attach to it — the version,
 * the system, the log's end, this session's notices, the output windows; none of your texts.
 */
export function FeedbackSection() {
  const lang = useLang();
  const serverAvailable = useServer((s) => s.available);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveDiagnostics();
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Text size="sm" fw={500} mb={2}>
        {tr('Відгук')}
      </Text>
      <Text size="xs" c="dimmed" mb={8}>
        {tr(
          'Помітили помилку чи маєте ідею? Форма відкривається на GitHub (потрібен акаунт), з версією, системою й мовою. Відгук видно всім — не пишіть особистих даних.',
        )}
      </Text>
      <Group gap="xs">
        <Button
          variant="default"
          size="xs"
          leftSection={<IconMessageReport size={14} />}
          onClick={() => openFeedback(lang)}
        >
          {tr('Надіслати відгук')}
        </Button>
        {serverAvailable === true && (
          <Button
            variant="default"
            size="xs"
            leftSection={<IconFileZip size={14} />}
            loading={busy}
            onClick={() => void save()}
          >
            {tr('Зберегти діагностику')}
          </Button>
        )}
      </Group>
      {serverAvailable === true && (
        <Text size="xs" c="dimmed" mt={6}>
          {tr(
            'Діагностика — файл .zip, який можна додати до відгуку: версія, система, кінець журналу, сповіщення цього сеансу, вікна виводу. Ваших текстів і зображень у ньому немає; у журналі є шляхи до папок цього комп’ютера.',
          )}
        </Text>
      )}
    </div>
  );
}

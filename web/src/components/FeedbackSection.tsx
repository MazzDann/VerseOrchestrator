import { Button, Text } from '@mantine/core';
import { IconMessageReport } from '@tabler/icons-react';
import { tr, useLang } from '../i18n';
import { openFeedback } from '../lib/feedback';

/** «Відгук» (1.2.0): a bug, an idea, or a question — through the feedback form on GitHub. */
export function FeedbackSection() {
  const lang = useLang();
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
      <Button
        variant="default"
        size="xs"
        leftSection={<IconMessageReport size={14} />}
        onClick={() => openFeedback(lang)}
      >
        {tr('Надіслати відгук')}
      </Button>
    </div>
  );
}

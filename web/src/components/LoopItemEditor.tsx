import { useState } from 'react';
import { ActionIcon, Button, Group, NumberInput, Popover, Stack, Tooltip } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type SeqLoop, usePlaylist } from '../playlistStore';
import { tr, useLang } from '../i18n';
import { keepEnter } from '../lib/editorKeys';

/** A «Цикл оголошень» item's interval, and taking it apart (1.10.0-beta.4). */
export function LoopItemEditor({
  item,
  opened,
  onOpenChange,
}: {
  item: SeqLoop;
  opened: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useLang();
  const [every, setEvery] = useState<number | string>(item.every);
  const save = () => {
    const n = Math.min(600, Math.max(3, Math.round(Number(every) || item.every)));
    usePlaylist.getState().updateItem(item.id, { every: n });
    onOpenChange(false);
  };
  return (
    <Popover
      opened={opened}
      onChange={onOpenChange}
      position="left-start"
      withArrow
      shadow="md"
      trapFocus
      onOpen={() => setEvery(item.every)}
    >
      <Popover.Target>
        <Tooltip label={tr('Змінити цикл')}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(!opened);
            }}
            aria-label={tr('Змінити цикл')}
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown w={260} onClick={(e) => e.stopPropagation()} onKeyDown={keepEnter}>
        <Stack gap="xs">
          <NumberInput
            size="xs"
            label={tr('Змінювати кожні, с')}
            min={3}
            max={600}
            value={every}
            onChange={setEvery}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            data-autofocus
          />
          <Group justify="space-between" gap="xs">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                usePlaylist.getState().scatterLoop(item.id);
                onOpenChange(false);
              }}
            >
              {tr('Розібрати цикл')}
            </Button>
            <Button size="xs" onClick={save}>
              {tr('Готово')}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

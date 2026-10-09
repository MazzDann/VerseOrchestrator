import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Popover,
  Select,
  Stack,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { type SeqCountdown, usePlaylist } from '../playlistStore';
import { parseDuration } from '../lib/countdown';
import { countdownLabel, isItemZero, lengthText } from '../lib/countdownItem';
import { tr, useLang } from '../i18n';
import { keepEnter } from '../lib/editorKeys';

/**
 * A «Відлік» item's own length, words and zero (1.10.0-beta.3, the author's call: chosen per item;
 * «Наступний пункт» — at zero the running order goes on by itself).
 */
export function CountdownItemEditor({
  item,
  opened,
  onOpenChange,
}: {
  item: SeqCountdown;
  opened: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useLang();
  const [length, setLength] = useState(lengthText(item.seconds));
  const [caption, setCaption] = useState(item.caption);
  const [atZero, setAtZero] = useState<SeqCountdown['atZero']>(item.atZero);
  const ms = parseDuration(length);
  const save = () => {
    if (ms == null) return;
    const seconds = Math.round(ms / 1000);
    usePlaylist.getState().updateItem(item.id, {
      seconds,
      caption,
      atZero,
      label: countdownLabel(seconds, caption),
    });
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
      onOpen={() => {
        setLength(lengthText(item.seconds));
        setCaption(item.caption);
        setAtZero(item.atZero);
      }}
    >
      <Popover.Target>
        <Tooltip label={tr('Змінити відлік')}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(!opened);
            }}
            aria-label={tr('Змінити відлік')}
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown w={280} onClick={(e) => e.stopPropagation()} onKeyDown={keepEnter}>
        <Stack gap="xs">
          <TextInput
            size="xs"
            label={tr('Тривалість')}
            description={tr('Хвилини чи хв:сс — 5, 7:30, 1:05:00')}
            value={length}
            onChange={(e) => setLength(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            error={ms == null ? tr('Введіть, наприклад, 5 або 7:30') : undefined}
            data-autofocus
          />
          <TextInput
            size="xs"
            label={tr('Напис')}
            placeholder={tr('Починаємо за')}
            value={caption}
            onChange={(e) => setCaption(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <Select
            size="xs"
            label={tr('Після нуля')}
            data={[
              { value: 'next', label: tr('Наступний пункт') },
              { value: 'overtime', label: tr('У мінус') },
              { value: 'stop', label: tr('Стоп на 0:00') },
              { value: 'hide', label: tr('Прибрати час') },
            ]}
            value={atZero}
            onChange={(v) => isItemZero(v) && setAtZero(v)}
            allowDeselect={false}
            // in the editor's own box (1.10.3, the Mac's round): portaled out, a click on an option was
            // «outside» the Popover — it closed the editor and the pick was lost
            comboboxProps={{ withinPortal: false }}
          />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => onOpenChange(false)}>
              {tr('Скасувати')}
            </Button>
            <Button size="xs" onClick={save} disabled={ms == null}>
              {tr('Готово')}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

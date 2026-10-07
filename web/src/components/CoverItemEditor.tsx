import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ActionIcon,
  Button,
  Group,
  Popover,
  Select,
  Stack,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { api } from '../api';
import { type SeqCover, usePlaylist } from '../playlistStore';
import { useServer } from '../serverStore';
import { tr, useLang } from '../i18n';
import { coverLabel } from '../lib/coverItem';

/**
 * A «Заставка» item's own text and picture (1.10.0-beta.2, the author's call: each item its own):
 * the picture is one of «Зображення» by its address — never a data URL in the running order (it
 * rides the ui-state copy and Safari's 5 MB). Without the server: text only.
 */
export function CoverItemEditor({
  item,
  opened,
  onOpenChange,
}: {
  item: SeqCover;
  opened: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const [text, setText] = useState(item.text);
  const [imageId, setImageId] = useState<string>(item.image?.imageId ?? '');
  const images = useQuery({
    queryKey: ['images'],
    queryFn: api.images,
    enabled: opened && serverAvailable !== false,
  });
  const save = () => {
    const img = images.data?.find((i) => i.id === imageId);
    usePlaylist.getState().updateItem(item.id, {
      text,
      label: coverLabel(text),
      image: img
        ? { imageId: img.id, src: img.src }
        : imageId && item.image?.imageId === imageId
          ? item.image
          : null,
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
        setText(item.text);
        setImageId(item.image?.imageId ?? '');
      }}
    >
      <Popover.Target>
        <Tooltip label={tr('Змінити заставку')}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(!opened);
            }}
            aria-label={tr('Змінити заставку')}
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown w={300} onClick={(e) => e.stopPropagation()}>
        <Stack gap="xs">
          <Textarea
            size="xs"
            label={tr('Текст заставки')}
            autosize
            minRows={2}
            maxRows={6}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            data-autofocus
          />
          {serverAvailable !== false && (
            <Select
              size="xs"
              label={tr('Зображення')}
              data={[
                { value: '', label: tr('Без зображення') },
                ...(images.data ?? []).map((i) => ({ value: i.id, label: i.name })),
              ]}
              value={imageId}
              onChange={(v) => setImageId(v ?? '')}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              nothingFoundMessage={tr('Додайте зображення в «Медіа → Зображення»')}
            />
          )}
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => onOpenChange(false)}>
              {tr('Скасувати')}
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

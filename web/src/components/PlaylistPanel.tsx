import {
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Box,
  Badge,
  ThemeIcon,
} from '@mantine/core';
import {
  IconBook,
  IconMusic,
  IconLetterT,
  IconChevronUp,
  IconChevronDown,
  IconTrash,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconClearAll,
} from '@tabler/icons-react';
import { type SeqItem } from '../playlistStore';

interface Props {
  items: SeqItem[];
  currentId: string | null;
  onActivate: (item: SeqItem) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onClear: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const KIND_ICON = {
  passage: IconBook,
  song: IconMusic,
  text: IconLetterT,
} as const;

const KIND_COLOR = { passage: 'blue', song: 'grape', text: 'teal' } as const;

/**
 * The running order: ordered list of passages / songs / free texts. Click a row
 * to project it; reorder / remove inline; step through with Prev/Next. Rendered
 * inside a `FloatingPanel`.
 */
export function PlaylistPanel({
  items,
  currentId,
  onActivate,
  onRemove,
  onMove,
  onClear,
  onNext,
  onPrev,
}: Props) {
  return (
    <Stack gap="xs" p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Попередній елемент">
            <ActionIcon
              variant="default"
              onClick={onPrev}
              disabled={items.length === 0}
              aria-label="Попередній елемент показу"
            >
              <IconPlayerTrackPrev size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Наступний елемент">
            <Button
              variant="light"
              color="green"
              size="xs"
              leftSection={<IconPlayerTrackNext size={16} />}
              onClick={onNext}
              disabled={items.length === 0}
            >
              Далі
            </Button>
          </Tooltip>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Badge variant="light" color="gray">
            {items.length}
          </Badge>
          <Tooltip label="Очистити показ">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={onClear}
              disabled={items.length === 0}
              aria-label="Очистити показ"
            >
              <IconClearAll size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          Порожньо. Додавайте уривки, пісні й текст кнопкою «+ у показ».
        </Text>
      ) : (
        <Stack gap={4}>
          {items.map((it, i) => {
            const Icon = KIND_ICON[it.kind];
            const active = it.id === currentId;
            return (
              <Box
                key={it.id}
                className="vo-verse-item"
                role="button"
                tabIndex={0}
                data-selected={active ? 'true' : undefined}
                onClick={() => onActivate(it)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivate(it);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <ThemeIcon size="sm" variant="light" color={KIND_COLOR[it.kind]}>
                  <Icon size={14} />
                </ThemeIcon>
                <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                  {it.label}
                </Text>
                <Group gap={0} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(it.id, -1);
                    }}
                    aria-label="Вгору"
                  >
                    <IconChevronUp size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    disabled={i === items.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(it.id, 1);
                    }}
                    aria-label="Вниз"
                  >
                    <IconChevronDown size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(it.id);
                    }}
                    aria-label="Прибрати"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

import { useMemo, useState } from 'react';
import {
  Box,
  Group,
  Text,
  Collapse,
  Checkbox,
  ScrollArea,
  Stack,
  Badge,
  UnstyledButton,
  TextInput,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { type Translation } from '../api';

interface Props {
  translations: Translation[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Promote a checked translation to primary (first — drives navigation + top slide line). */
  onMakePrimary?: (id: number) => void;
  max?: number;
}

/**
 * Inline, grouped-by-language checklist for picking the active translation(s).
 * Inline (Collapse, not a Popover/Modal) because Mantine overlays don't render
 * their content reliably in this app. The first checked id is the primary.
 */
export function TranslationPicker({
  translations,
  selectedIds,
  onChange,
  onMakePrimary,
  max = 5,
}: Props) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, Translation[]>();
    for (const t of translations) {
      if (q && !t.abbr.toLowerCase().includes(q) && !(t.title ?? '').toLowerCase().includes(q))
        continue;
      const key = t.language || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()];
  }, [translations, filter]);

  const atMax = selectedIds.length >= max;
  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else if (!atMax) onChange([...selectedIds, id]);
  };

  return (
    <Box>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        aria-label="Переклади"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
        }}
      >
        <Group gap={6} wrap="nowrap">
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="sm" fw={600}>
            Переклади
          </Text>
        </Group>
        <Badge size="sm" variant={selectedIds.length ? 'filled' : 'light'} color="brand">
          {selectedIds.length}/{max}
        </Badge>
      </UnstyledButton>

      <Collapse in={open}>
        <Box px={8} pb={6}>
          <TextInput
            size="xs"
            mb={6}
            placeholder="Фільтр перекладів…"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            leftSection={<IconSearch size={13} />}
          />
          <ScrollArea.Autosize mah={210}>
            <Stack gap={2}>
              {groups.map(([lang, items]) => (
                <div key={lang}>
                  <Text size="10px" c="dimmed" fw={700} tt="uppercase" mt={6} mb={2}>
                    {lang}
                  </Text>
                  {items.map((t) => {
                    const checked = selectedIds.includes(t.id);
                    const isPrimary = checked && selectedIds[0] === t.id;
                    return (
                      <Group key={t.id} gap={4} wrap="nowrap" justify="space-between" mb={3}>
                        <Checkbox
                          size="xs"
                          checked={checked}
                          disabled={!checked && atMax}
                          onChange={() => toggle(t.id)}
                          label={
                            <Group gap={5} wrap="nowrap">
                              <Text size="xs">{t.abbr}</Text>
                              {t.hasStrong && (
                                <Text size="9px" c="brand" fw={700}>
                                  S
                                </Text>
                              )}
                            </Group>
                          }
                        />
                        {checked && onMakePrimary && (
                          <Tooltip
                            label={isPrimary ? 'Головний переклад' : 'Зробити головним'}
                            withArrow
                          >
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color={isPrimary ? 'brand' : 'gray'}
                              onClick={() => onMakePrimary(t.id)}
                              aria-label="Зробити головним"
                            >
                              {isPrimary ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    );
                  })}
                </div>
              ))}
              {groups.length === 0 && (
                <Text size="xs" c="dimmed" py="xs">
                  Нічого не знайдено
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Box>
      </Collapse>
    </Box>
  );
}

import { useMemo, useState, useEffect, useRef } from 'react';
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
  IconArchive,
  IconArchiveOff,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { type Translation } from '../api';
import { tr, useLang } from '../i18n';
import { languageFirst } from '../lib/translationOrder';

interface Props {
  translations: Translation[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Promote a checked translation to primary (first — drives navigation + top slide line). */
  onMakePrimary?: (id: number) => void;
  /** the archived translations' short names (1.26.0-beta.2): a folded group at the end */
  archived?: readonly string[];
  /** put translations into the archive, or back */
  onArchive?: (abbrs: string[], archived: boolean) => void;
  /** Enter on a translation (1.18.3, F1017-09): the control window shows its preview once ready */
  onEnter?: () => void;
  max?: number;
}

const NONE: readonly string[] = [];

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
  archived = NONE,
  onArchive,
  onEnter,
  max = 5,
}: Props) {
  const uiLang = useLang();
  // a short screen with a translation ticked starts folded (1.25.0-beta.5): at 768 px the open list
  // left the books four rows; the folded header names the ticked ones
  const [open, setOpen] = useState(true);
  const touched = useRef(false);
  const ticked = selectedIds.length > 0;
  useEffect(() => {
    if (!touched.current && ticked && window.innerHeight < 900) setOpen(false);
  }, [ticked]);
  const [filter, setFilter] = useState('');

  const [archiveOpen, setArchiveOpen] = useState(false);
  const q = filter.trim().toLowerCase();
  const { groups, away } = useMemo(() => {
    const map = new Map<string, Translation[]>();
    const gone = new Set(archived);
    const away: Translation[] = [];
    for (const t of translations) {
      if (q && !t.abbr.toLowerCase().includes(q) && !(t.title ?? '').toLowerCase().includes(q))
        continue;
      // a ticked one stays where it is: it is in use
      if (gone.has(t.abbr) && !selectedIds.includes(t.id)) {
        away.push(t);
        continue;
      }
      const key = t.language || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // the interface language's group first (1.25.0-beta.5)
    return { groups: languageFirst([...map.entries()], uiLang), away };
  }, [translations, q, uiLang, archived, selectedIds]);
  // what is looked for by its name is shown, archived too
  const awayOpen = archiveOpen || q !== '';

  const atMax = selectedIds.length >= max;
  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else if (!atMax) onChange([...selectedIds, id]);
  };

  const row = (t: Translation) => {
    const checked = selectedIds.includes(t.id);
    const isPrimary = checked && selectedIds[0] === t.id;
    const isAway = archived.includes(t.abbr);
    const away = isAway ? tr('Повернути з архіву') : tr('В архів: у кінці списків, без пошуку');
    return (
      <Group
        key={t.id}
        className="vo-archive-row"
        gap={4}
        wrap="nowrap"
        justify="space-between"
        mb={3}
      >
        <Checkbox
          size="xs"
          style={{ flex: 1, minWidth: 0 }}
          checked={checked}
          disabled={!checked && atMax}
          onChange={() => toggle(t.id)}
          label={
            <Group gap={5} wrap="nowrap">
              <Text size="xs" c={isAway ? 'dimmed' : undefined}>
                {t.abbr}
              </Text>
              {t.hasStrong && (
                <Text size="9px" c="brand" fw={700}>
                  S
                </Text>
              )}
            </Group>
          }
        />
        {onArchive && (
          <Tooltip label={away} withArrow openDelay={300}>
            <ActionIcon
              className="vo-archive-btn"
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => onArchive([t.abbr], !isAway)}
              aria-label={`${isAway ? tr('Повернути з архіву') : tr('В архів')}: ${t.abbr}`}
            >
              {isAway ? <IconArchiveOff size={13} /> : <IconArchive size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
        {checked && onMakePrimary && (
          <Tooltip label={isPrimary ? tr('Головний переклад') : tr('Зробити головним')} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color={isPrimary ? 'brand' : 'gray'}
              onClick={() => onMakePrimary(t.id)}
              aria-label={tr('Зробити головним')}
            >
              {isPrimary ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    );
  };

  return (
    <Box>
      <UnstyledButton
        onClick={() => {
          touched.current = true;
          setOpen((o) => !o);
        }}
        aria-label={tr('Переклади')}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
        }}
      >
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="sm" fw={600}>
            {tr('Переклади')}
          </Text>
          {!open && selectedIds.length > 0 && (
            <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
              {selectedIds
                .map((id) => translations.find((t) => t.id === id)?.abbr)
                .filter(Boolean)
                .join(', ')}
            </Text>
          )}
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
            placeholder={tr('Фільтр перекладів…')}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            leftSection={<IconSearch size={13} />}
          />
          <ScrollArea.Autosize mah={210}>
            {/* Enter on a ticked translation: the preview goes on screen, with the translations as
                they are now (F1017-09 — Space ticks, Enter shows) */}
            <Stack
              gap={2}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !onEnter) return;
                if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'checkbox') return;
                e.preventDefault();
                onEnter();
              }}
            >
              {groups.map(([lang, items]) => (
                <div key={lang}>
                  <Group className="vo-archive-row" gap={4} wrap="nowrap" mt={6} mb={2}>
                    <Text size="10px" c="dimmed" fw={700} tt="uppercase" style={{ flex: 1 }}>
                      {lang}
                    </Text>
                    {onArchive && groups.length > 1 && !q && items.length > 1 && (
                      <Tooltip label={tr('Усю групу в архів')} withArrow openDelay={300}>
                        <ActionIcon
                          className="vo-archive-btn"
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() =>
                            onArchive(
                              items.map((t) => t.abbr),
                              true,
                            )
                          }
                          aria-label={tr('Усю групу «{name}» в архів', { name: lang })}
                        >
                          <IconArchive size={13} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                  {items.map(row)}
                </div>
              ))}
              {away.length > 0 && (
                <div data-translations-archive>
                  <UnstyledButton
                    mt={8}
                    mb={2}
                    aria-expanded={awayOpen}
                    // a filter shows what it finds there
                    disabled={q !== ''}
                    onClick={() => setArchiveOpen(!awayOpen)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {awayOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                    <Text size="xs" c="dimmed">
                      {tr('Архів ({n})', { n: away.length })}
                    </Text>
                  </UnstyledButton>
                  {awayOpen && away.map(row)}
                </div>
              )}
              {groups.length === 0 && away.length === 0 && (
                <Text size="xs" c="dimmed" py="xs">
                  {translations.length === 0 ? tr('Перекладів ще немає') : tr('Нічого не знайдено')}
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Box>
      </Collapse>
    </Box>
  );
}

import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBooks, IconSearch } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, MODULE_KIND_IDS, type ModuleKindId } from '../api';
import { tr, useLang } from '../i18n';
import { inLibrary, KIND_LABEL, useModulesPanel } from '../lib/modules';
import { rebuildProgress, useRebuildLibrary } from '../lib/rebuild';
import { useServer } from '../serverStore';
import { FloatingPanel } from './FloatingPanel';
import { VirtualList } from './VirtualList';

/**
 * «Модулі»: the module files kept in modules/ and which of them the library takes — tick, then
 * «Зібрати бібліотеку». The files are put into the folder by the operator.
 */
export function ModulesFloating() {
  const open = useModulesPanel((s) => s.open);
  const hide = useModulesPanel((s) => s.hide);
  useLang();
  return (
    <FloatingPanel
      opened={open}
      onClose={hide}
      title={tr('Модулі')}
      storageKey="vo:modulesPanelPos"
      width={460}
      icon={<IconBooks size={16} />}
    >
      {open && <ModulesPanel />}
    </FloatingPanel>
  );
}

const KINDS = () => MODULE_KIND_IDS.map((k) => ({ value: k, label: tr(KIND_LABEL[k]) }));

function ModulesPanel() {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  if (serverAvailable === false)
    return (
      <Text size="sm" c="dimmed" p="sm">
        {tr('Вибір модулів працює, коли застосунок запущено на цьому комп’ютері.')}
      </Text>
    );
  // its full height from the first frame: the panel finds its place by the height it opens with,
  // and the list comes a moment later
  return (
    <Stack gap="xs" p="sm" mih="30rem">
      <LibraryList />
      <RebuildLine />
    </Stack>
  );
}

function LibraryList() {
  const queryClient = useQueryClient();
  const modules = useQuery({ queryKey: ['modules'], queryFn: () => api.modules(), retry: false });
  const [kind, setKind] = useState<ModuleKindId>('bibles');
  const [query, setQuery] = useState('');
  const [changed, setChanged] = useState(false);
  const { rebuild, rebuilding } = useRebuildLibrary();

  const info = modules.data;
  const files = info?.files[kind] ?? [];
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = files.filter((f) => words.every((w) => f.toLocaleLowerCase().includes(w)));
  const taken = info ? files.filter((f) => inLibrary(info, kind, f)).length : 0;

  const toggle = async (file: string) => {
    if (!info) return;
    const sel = info.selection?.[kind];
    const now = sel == null ? files : sel;
    const on = inLibrary(info, kind, file);
    const next = on ? now.filter((n) => n.toLowerCase() !== file.toLowerCase()) : [...now, file];
    try {
      await api.selectModules(kind, next);
      setChanged(true);
      await queryClient.invalidateQueries({ queryKey: ['modules'] });
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
    }
  };

  if (modules.isError)
    return (
      <Text size="sm" c="orange">
        {(modules.error as Error).message}
      </Text>
    );
  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        fullWidth
        value={kind}
        onChange={(v) => setKind(v as ModuleKindId)}
        data={KINDS()}
      />
      <TextInput
        size="xs"
        leftSection={<IconSearch size={14} />}
        placeholder={tr('Назва файлу')}
        aria-label={tr('Пошук серед модулів')}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <Text size="xs" c="dimmed">
        {tr('У бібліотеці {n} з {total}.', { n: String(taken), total: String(files.length) })}{' '}
        {tr('Позначте, які модулі брати, і зберіть бібліотеку.')}
      </Text>
      <Box
        h="16rem"
        style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}
      >
        <VirtualList
          items={shown}
          getKey={(f) => f}
          estimateSize={30}
          onSelect={(f) => void toggle(f)}
          empty={
            files.length
              ? tr('Нічого не знайдено за «{query}»', { query })
              : tr(
                  'У папці modules/ немає модулів цього виду. Покладіть туди файли .SQLite3 і зберіть бібліотеку.',
                )
          }
          renderRow={(f) => (
            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
              <Checkbox
                size="xs"
                readOnly
                tabIndex={-1}
                checked={!!info && inLibrary(info, kind, f)}
                aria-label={tr('У бібліотеці')}
              />
              <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                {f.replace(
                  /(\.(dictionary|commentaries|crossreferences|subheadings))?\.SQLite3$/i,
                  '',
                )}
              </Text>
            </Group>
          )}
        />
      </Box>
      <Group gap="xs" wrap="nowrap">
        <Button
          size="xs"
          variant={changed ? 'filled' : 'light'}
          loading={rebuilding}
          onClick={() => {
            setChanged(false);
            void rebuild();
          }}
        >
          {tr('Зібрати бібліотеку')}
        </Button>
        {info && (
          <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }} title={info.dir}>
            {info.dir}
          </Text>
        )}
      </Group>
    </Stack>
  );
}

/** The library build under way, in one line. */
function RebuildLine() {
  const { job } = useRebuildLibrary();
  if (job?.phase === 'running')
    return (
      <Text size="xs" c="dimmed" aria-live="polite">
        {rebuildProgress(job)}
      </Text>
    );
  return null;
}

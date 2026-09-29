import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconDownload, IconPlayerPlay } from '@tabler/icons-react';
import { probeServer, useServer } from '../serverStore';
import { download, saveCsv } from '../lib/bench/files';
import {
  payloads,
  runSyncBench,
  syncCsv,
  TRANSPORT_NAME,
  TRANSPORTS,
  type SyncCell,
  type SyncReport,
  type TransportId,
} from '../lib/bench/sync';
import { fmtNumber, tr, useLang } from '../i18n';

const ms = (v: number) =>
  Number.isFinite(v)
    ? tr('{n} мс', { n: fmtNumber(v, { maximumFractionDigits: v < 10 ? 2 : 0 }) })
    : '—';
const size = (bytes: number) =>
  bytes >= 1048576
    ? tr('{n} МБ', { n: fmtNumber(bytes / 1048576, { maximumFractionDigits: 1 }) })
    : bytes >= 1024
      ? tr('{n} КБ', { n: Math.round(bytes / 1024) })
      : tr('{n} Б', { n: bytes });

/**
 * «Синхронізація вікон» tab of /bench: the transports a window bus could use, measured
 * with the payloads the app really sends (lib/bench/sync.ts).
 */
export function SyncBench() {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  const [transports, setTransports] = useState<TransportId[]>(
    TRANSPORTS.filter((t) => t !== 'websocket'),
  );
  const [rounds, setRounds] = useState(30);
  const [peer, setPeer] = useState<'window' | 'iframe'>('window');
  const [progress, setProgress] = useState<{ message: string; fraction: number } | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void probeServer().then((ok) => {
      if (ok) setTransports((t) => (t.includes('websocket') ? t : [...t, 'websocket']));
    });
  }, []);

  const run = async () => {
    setReport(null);
    setError(null);
    setProgress({ message: tr('Відкриваю вікно-партнера…'), fraction: 0 });
    try {
      setReport(
        await runSyncBench({
          transports: TRANSPORTS.filter((t) => transports.includes(t)),
          rounds,
          peer,
          onProgress: (message, fraction) => setProgress({ message, fraction }),
        }),
      );
    } catch (e) {
      setError(tr((e as Error).message));
    } finally {
      setProgress(null);
    }
  };

  const stamp = report?.createdAt.slice(0, 19).replace(/[:T]/g, '-');
  const kinds = payloads();

  return (
    <>
      <Text size="sm" c="dimmed" mb="md" maw={760}>
        {tr(
          'Як швидко повідомлення доходить з вікна керування до іншого вікна застосунку (вікна показу, сцени) і назад — та скільки воно при цьому блокує саме вікно керування. Для сервера — шлях телефонів і пульта. Партнер — маленьке окреме вікно, як справжнє вікно показу (якщо спливні вікна заблоковані — прихований фрейм), або одразу фрейм у цій сторінці.',
        )}
      </Text>

      <Paper withBorder p="md" mb="md">
        <Group align="flex-start" gap="xl" wrap="wrap">
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              {tr('Способи передачі')}
            </Text>
            <Checkbox.Group value={transports} onChange={(v) => setTransports(v as TransportId[])}>
              <Stack gap={4}>
                {TRANSPORTS.map((t) => (
                  <Checkbox
                    key={t}
                    size="xs"
                    value={t}
                    disabled={t === 'websocket' && serverAvailable === false}
                    label={
                      t === 'websocket' && serverAvailable === false
                        ? `${TRANSPORT_NAME[t]} — ${tr('сервер не запущено')}`
                        : TRANSPORT_NAME[t]
                    }
                  />
                ))}
              </Stack>
            </Checkbox.Group>
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              {tr('Дані')}
            </Text>
            {kinds.map((k) => (
              <Text key={k.id} size="xs">
                {k.label}{' '}
                <Text span size="xs" c="dimmed">
                  {size(k.payload.length)}
                </Text>
              </Text>
            ))}
            <Text size="sm" fw={500} mt={4}>
              {tr('Партнер')}
            </Text>
            <SegmentedControl
              size="xs"
              value={peer}
              onChange={(v) => setPeer(v as 'window' | 'iframe')}
              data={[
                { label: tr('Окреме вікно'), value: 'window' },
                { label: tr('Фрейм'), value: 'iframe' },
              ]}
            />
            <NumberInput
              size="xs"
              label={tr('Обмінів на кожен вимір')}
              value={rounds}
              onChange={(v) => setRounds(Math.max(5, Math.min(500, Number(v) || 30)))}
              min={5}
              max={500}
              w={200}
            />
          </Stack>
          <Stack gap={6} style={{ flex: 1, minWidth: 220 }}>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              disabled={!!progress || transports.length === 0}
              onClick={() => void run()}
            >
              {tr('Запустити')}
            </Button>
            {progress ? (
              <>
                <Progress value={progress.fraction * 100} size="sm" animated />
                <Text size="xs" c="dimmed">
                  {progress.message}
                </Text>
              </>
            ) : (
              <Text size="xs" c="dimmed">
                {tr(
                  'Кожен обмін: дані туди, коротке підтвердження назад; час — на годиннику вікна керування. Далі серія зі 200 команд без очікування.',
                )}
              </Text>
            )}
            {error && (
              <Text size="xs" c="orange">
                {error}
              </Text>
            )}
          </Stack>
        </Group>
      </Paper>

      {report && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="sm" wrap="wrap">
            <Text size="sm" c="dimmed">
              {report.peer === 'window' ? tr('окреме вікно') : tr('прихований фрейм')} ·{' '}
              {tr('{n} обмінів · v{app}', { n: report.rounds, app: report.app })}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="default"
                leftSection={<IconCopy size={14} />}
                onClick={() => {
                  void navigator.clipboard.writeText(syncCsv(report)).then(
                    () =>
                      notifications.show({
                        message: tr('CSV скопійовано'),
                        color: 'green',
                        autoClose: 1500,
                      }),
                    () => saveCsv(`vo-sync-${stamp}.csv`, syncCsv(report)),
                  );
                }}
              >
                {tr('Копіювати CSV')}
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                onClick={() => saveCsv(`vo-sync-${stamp}.csv`, syncCsv(report))}
              >
                CSV
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                onClick={() =>
                  download(
                    `vo-sync-${stamp}.json`,
                    JSON.stringify(report, null, 2),
                    'application/json',
                  )
                }
              >
                JSON
              </Button>
            </Group>
          </Group>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing={6} horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  {kinds.map((k) => (
                    <Table.Th key={k.id}>
                      <Text size="sm" fw={600}>
                        {k.label}
                      </Text>
                      <Text size="xs" c="dimmed" fw={400}>
                        {size(report.sizes[k.id])}
                      </Text>
                    </Table.Th>
                  ))}
                  <Table.Th>
                    <Text size="sm" fw={600}>
                      {tr('Серія команд')}
                    </Text>
                    <Text size="xs" c="dimmed" fw={400}>
                      {tr('200 без очікування')}
                    </Text>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.rows.map((row) => (
                  <Table.Tr key={row.transport}>
                    <Table.Td>
                      <Text size="sm">{TRANSPORT_NAME[row.transport]}</Text>
                    </Table.Td>
                    {kinds.map((k) => {
                      const max = Math.max(
                        ...report.rows
                          .map((r) => r.cells[k.id]?.medianMs ?? NaN)
                          .filter(Number.isFinite),
                      );
                      return (
                        <Table.Td key={k.id}>
                          <Cell cell={row.cells[k.id]} max={max} />
                        </Table.Td>
                      );
                    })}
                    <Table.Td>
                      {row.burst ? (
                        <>
                          <Text size="sm" fw={500}>
                            {tr('{n} / с', { n: fmtNumber(row.burst.perSec) })}
                          </Text>
                          <Text size="xs" c={row.burst.lost ? 'orange' : 'dimmed'}>
                            {tr('втрачено {lost} з {sent}', {
                              lost: row.burst.lost,
                              sent: row.burst.sent,
                            })}
                          </Text>
                        </>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Text size="xs" c="dimmed" mt="sm">
            {tr(
              'Час — повний обмін (дані туди + підтвердження назад), медіана; під ним p95 і «блокує» — скільки вікно керування стоїть усередині відправлення (серіалізація, запис у localStorage): стільки інтерфейс не реагує на кожен показ.',
            )}
          </Text>
        </Paper>
      )}
    </>
  );
}

function Cell({ cell, max }: { cell: SyncCell | null; max: number }) {
  if (!cell) return <>—</>;
  if (cell.error)
    return (
      <Text size="xs" c="orange">
        {tr(cell.error)}
      </Text>
    );
  return (
    <>
      <Text size="sm" fw={500}>
        {ms(cell.medianMs)}
      </Text>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          margin: '3px 0',
          width: `${max > 0 ? Math.max(2, (cell.medianMs / max) * 100) : 0}%`,
          background: 'var(--mantine-color-brand-light-color)',
          opacity: 0.6,
        }}
      />
      <Text size="xs" c="dimmed">
        {tr('p95 {p95} · блокує {median} (max {max})', {
          p95: ms(cell.p95Ms),
          median: ms(cell.sendMedianMs),
          max: ms(cell.sendMaxMs),
        })}
        {cell.lost ? ` · ${tr('втрачено {n}', { n: cell.lost })}` : ''}
      </Text>
    </>
  );
}

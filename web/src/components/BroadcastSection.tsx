import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';
import { useSettings, type BroadcastLook, type OutputAspect } from '../settingsStore';
import { tr, useLang } from '../i18n';
import { broadcastUrl } from '../lib/broadcast';

/**
 * «Вікна виводу» → the outputs' shape and «Трансляція» (1.14.0-beta.3, the author's answers):
 * «Співвідношення сторін» for every output; the broadcast look, its address for OBS / vMix and a
 * window for a keyer over HDMI.
 */
export function BroadcastSection() {
  useLang();
  const aspect = useSettings((s) => s.outputs.aspect);
  const look = useSettings((s) => s.outputs.broadcast);
  const setOutputs = useSettings((s) => s.setOutputs);
  const set = (patch: Partial<BroadcastLook>) => setOutputs({ broadcast: { ...look, ...patch } });
  const url = broadcastUrl(window.location.origin, look);
  return (
    <Stack gap={8}>
      <div>
        <Text size="sm" fw={500} mb={2}>
          {tr('Співвідношення сторін')}
        </Text>
        <Text size="xs" c="dimmed" mb={6}>
          {tr('Як показувати слайд, коли проєктор чи трансляція має іншу форму, ніж вікно.')}
        </Text>
        <SegmentedControl
          size="xs"
          fullWidth
          value={aspect}
          onChange={(v) => setOutputs({ aspect: v as OutputAspect })}
          data={[
            { label: tr('Як екран'), value: 'screen' },
            { label: '16:9', value: '16:9' },
            { label: '4:3', value: '4:3' },
          ]}
        />
      </div>
      <div>
        <Text size="sm" fw={500} mb={2}>
          {tr('Трансляція')}
        </Text>
        <Text size="xs" c="dimmed" mb={6}>
          {tr(
            'Текст поверх відео з камери: в OBS чи vMix — за адресою нижче (джерело «Браузер», 1920×1080); через HDMI на мікшер — у вікні на тому екрані, із зеленим чи чорним фоном для ключа.',
          )}
        </Text>
        <Stack gap={6}>
          <SegmentedControl
            size="xs"
            fullWidth
            value={look.look}
            onChange={(v) => set({ look: v as BroadcastLook['look'] })}
            data={[
              { label: tr('Нижня третина'), value: 'lower' },
              { label: tr('Як на показі'), value: 'full' },
            ]}
          />
          <SegmentedControl
            size="xs"
            fullWidth
            value={look.bg}
            onChange={(v) => set({ bg: v as BroadcastLook['bg'] })}
            data={[
              { label: tr('Прозорий'), value: 'transparent' },
              { label: tr('Зелений'), value: 'green' },
              { label: tr('Чорний'), value: 'black' },
            ]}
          />
          <Switch
            size="xs"
            checked={look.band}
            onChange={(e) => set({ band: e.currentTarget.checked })}
            label={tr('Плашка під текстом')}
            description={tr(
              'Темна смуга, на якій текст читається поверх будь-якого кадру. Для ключа за яскравістю (чорний фон) вимкніть її.',
            )}
          />
          <TextInput
            size="xs"
            readOnly
            value={url}
            label={tr('Адреса для OBS / vMix')}
            onFocus={(e) => e.currentTarget.select()}
            rightSection={
              <CopyButton value={url}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? tr('Скопійовано') : tr('Скопіювати адресу')} withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={copied ? 'green' : 'gray'}
                      onClick={copy}
                      aria-label={tr('Скопіювати адресу')}
                    >
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            }
          />
          <Text size="xs" c="dimmed">
            {tr('Адреса працює лише на цьому комп’ютері.')}
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconExternalLink size={14} />}
              onClick={() => window.open('/key', 'vo-key', 'popup,width=960,height=540')}
            >
              {tr('Відкрити вікно трансляції')}
            </Button>
          </Group>
        </Stack>
      </div>
    </Stack>
  );
}

import { Button, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { IconQrcode, IconQrcodeOff } from '@tabler/icons-react';
import { useSettings } from '../settingsStore';
import type { QrStyle } from '../presenterBus';
import { plural } from '../lib/plural';
import { PhoneLink } from './PhoneLink';

/**
 * Audience follow-along controls: a toggle that mirrors the live slide to the
 * server, plus a QR / URL viewers scan to read along on their phones.
 * Rendered inside a `FloatingPanel`.
 */
export function FollowPanel({
  viewers,
  qrOnScreen,
  onToggleQr,
}: {
  viewers: number;
  /** the viewers' QR is the slide on screen now (0.6.16) */
  qrOnScreen: boolean;
  onToggleQr: () => void;
}) {
  const followAlong = useSettings((s) => s.followAlong);
  const setFollowAlong = useSettings((s) => s.setFollowAlong);
  const followQrCorner = useSettings((s) => s.followQrCorner);
  const setFollowQrCorner = useSettings((s) => s.setFollowQrCorner);
  const followQrStyle = useSettings((s) => s.followQrStyle);
  const setFollowQrStyle = useSettings((s) => s.setFollowQrStyle);
  return (
    <Stack gap="sm" p="md">
      <Switch
        checked={followAlong}
        onChange={(e) => setFollowAlong(e.currentTarget.checked)}
        label="Трансляція на телефони глядачів"
        description="Поточний слайд дзеркалиться на сервер; глядачі читають за QR нижче."
      />
      {followAlong ? (
        <>
          <Text size="sm" fw={500}>
            {viewers === 0
              ? 'Поки ніхто не підключився'
              : `На зв’язку: ${viewers} ${plural(viewers, ['телефон', 'телефони', 'телефонів'])}`}
          </Text>
          <PhoneLink
            path="/follow"
            caption="Відскануйте або відкрийте на телефоні (та сама мережа Wi-Fi):"
          />
          <Button
            size="xs"
            variant={qrOnScreen ? 'filled' : 'light'}
            color={qrOnScreen ? 'live' : 'brand'}
            leftSection={qrOnScreen ? <IconQrcodeOff size={14} /> : <IconQrcode size={14} />}
            onClick={onToggleQr}
          >
            {qrOnScreen ? 'Прибрати QR з екрана' : 'QR на екран'}
          </Button>
          <Switch
            size="xs"
            checked={followQrCorner}
            onChange={(e) => setFollowQrCorner(e.currentTarget.checked)}
            label="QR у кутку екрана"
            description="Маленький QR на кожному слайді, щоб підключитися могли й ті, хто прийшов пізніше"
          />
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Вигляд QR на екрані
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              value={followQrStyle}
              onChange={(v) => setFollowQrStyle(v as QrStyle)}
              data={[
                { label: 'Класичний', value: 'square' },
                { label: 'Округлий', value: 'rounded' },
                { label: 'Крапки', value: 'dots' },
              ]}
            />
          </div>
        </>
      ) : (
        <Text size="xs" c="dimmed">
          Увімкніть, щоб показати QR-код. Працює в межах локальної мережі.
        </Text>
      )}
    </Stack>
  );
}

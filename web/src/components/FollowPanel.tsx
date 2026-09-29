import { Button, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { IconQrcode, IconQrcodeOff } from '@tabler/icons-react';
import { useSettings } from '../settingsStore';
import type { QrStyle } from '../presenterBus';
import { PhoneLink } from './PhoneLink';
import { tr, trn, useLang } from '../i18n';

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
  useLang();
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
        label={tr('Трансляція на телефони глядачів')}
        description={tr('Поточний слайд дзеркалиться на сервер; глядачі читають за QR нижче.')}
      />
      {followAlong ? (
        <>
          <Text size="sm" fw={500}>
            {viewers === 0
              ? tr('Поки ніхто не підключився')
              : trn(
                  viewers,
                  'На зв’язку: {n} телефон|На зв’язку: {n} телефони|На зв’язку: {n} телефонів',
                )}
          </Text>
          <PhoneLink
            path="/follow"
            caption={tr('Відскануйте або відкрийте на телефоні (та сама мережа Wi-Fi):')}
          />
          <Button
            size="xs"
            variant={qrOnScreen ? 'filled' : 'light'}
            color={qrOnScreen ? 'live' : 'brand'}
            leftSection={qrOnScreen ? <IconQrcodeOff size={14} /> : <IconQrcode size={14} />}
            onClick={onToggleQr}
          >
            {qrOnScreen ? tr('Прибрати QR з екрана') : tr('QR на екран')}
          </Button>
          <Switch
            size="xs"
            checked={followQrCorner}
            onChange={(e) => setFollowQrCorner(e.currentTarget.checked)}
            label={tr('QR у кутку екрана')}
            description={tr(
              'Маленький QR на кожному слайді, щоб підключитися могли й ті, хто прийшов пізніше',
            )}
          />
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              {tr('Вигляд QR на екрані')}
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              value={followQrStyle}
              onChange={(v) => setFollowQrStyle(v as QrStyle)}
              data={[
                { label: tr('Класичний'), value: 'square' },
                { label: tr('Округлий'), value: 'rounded' },
                { label: tr('Крапки'), value: 'dots' },
              ]}
            />
          </div>
        </>
      ) : (
        <Text size="xs" c="dimmed">
          {tr('Увімкніть, щоб показати QR-код. Працює в межах локальної мережі.')}
        </Text>
      )}
    </Stack>
  );
}

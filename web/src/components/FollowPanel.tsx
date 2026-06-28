import { useEffect, useMemo, useState } from 'react';
import { Stack, Switch, Text, Image, Code, CopyButton, Button, Group, Loader } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import QRCode from 'qrcode';
import { api } from '../api';
import { useSettings } from '../settingsStore';

/**
 * Audience follow-along controls: a toggle that mirrors the live slide to the
 * server, plus a QR / URL the congregation scans to read along on their phones.
 * Rendered inside a `FloatingPanel`.
 */
export function FollowPanel() {
  const followAlong = useSettings((s) => s.followAlong);
  const setFollowAlong = useSettings((s) => s.setFollowAlong);
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [qr, setQr] = useState('');

  useEffect(() => {
    api
      .host()
      .then((r) => setLanIps(r.ips))
      .catch(() => setLanIps([]));
  }, []);

  // Prefer a LAN IP when the operator opened the app on localhost (phones can't
  // reach localhost); otherwise use the current origin.
  const url = useMemo(() => {
    const { protocol, hostname, port, origin } = window.location;
    const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hostname);
    if (isLocal && lanIps[0]) {
      return `${protocol}//${lanIps[0]}${port ? `:${port}` : ''}/follow`;
    }
    return `${origin}/follow`;
  }, [lanIps]);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

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
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              background: '#fff',
              borderRadius: 8,
              padding: 12,
            }}
          >
            {qr ? (
              <Image src={qr} w={200} h={200} alt="QR для приєднання" />
            ) : (
              <Loader size="sm" />
            )}
          </div>
          <Text size="xs" c="dimmed" ta="center">
            Відскануйте або відкрийте на телефоні (та сама мережа Wi-Fi):
          </Text>
          <Group gap="xs" wrap="nowrap" justify="center">
            <Code style={{ fontSize: 13 }}>{url}</Code>
            <CopyButton value={url}>
              {({ copied, copy }) => (
                <Button
                  size="compact-xs"
                  variant="light"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                >
                  {copied ? 'Скопійовано' : 'Копіювати'}
                </Button>
              )}
            </CopyButton>
          </Group>
          {/^(localhost|127\.)/.test(window.location.hostname) &&
            (lanIps.length > 0 ? (
              <Text size="xs" c="dimmed" ta="center">
                Телефони мають бути в тій самій мережі Wi-Fi. Якщо не відкривається — відкрийте
                керування за IP-адресою комп'ютера ({lanIps[0]}).
              </Text>
            ) : (
              <Text size="xs" c="orange" ta="center">
                Не знайдено мережевої адреси — підключіть комп'ютер до Wi-Fi/LAN, щоб телефони могли
                приєднатися.
              </Text>
            ))}
        </>
      ) : (
        <Text size="xs" c="dimmed">
          Увімкніть, щоб показати QR-код. Працює в межах локальної мережі.
        </Text>
      )}
    </Stack>
  );
}

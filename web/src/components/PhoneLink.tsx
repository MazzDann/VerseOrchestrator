import { useEffect, useMemo, useState } from 'react';
import { Stack, Text, Image, Code, CopyButton, Button, Group, Loader } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import QRCode from 'qrcode';
import { api } from '../api';

/**
 * A phone-reachable link to one of this app's pages, as a QR + copyable URL. When the
 * operator opened the app on localhost (phones can't reach that), the URL uses this
 * machine's LAN IP instead. Shared by the viewers (/follow) and speaker-remote panels.
 */
export function PhoneLink({ path, caption }: { path: string; caption: string }) {
  const [lanIps, setLanIps] = useState<string[] | null>(null);
  const [qr, setQr] = useState('');
  const onLocalhost = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);

  useEffect(() => {
    api
      .host()
      .then((r) => setLanIps(r.ips))
      .catch(() => setLanIps([]));
  }, []);

  const url = useMemo(() => {
    const { protocol, port, origin } = window.location;
    if (onLocalhost && lanIps?.[0])
      return `${protocol}//${lanIps[0]}${port ? `:${port}` : ''}${path}`;
    return `${origin}${path}`;
  }, [lanIps, onLocalhost, path]);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  return (
    <Stack gap="xs">
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          background: '#fff',
          borderRadius: 8,
          padding: 12,
        }}
      >
        {qr ? <Image src={qr} w={200} h={200} alt={caption} /> : <Loader size="sm" />}
      </div>
      <Text size="xs" c="dimmed" ta="center">
        {caption}
      </Text>
      <Group gap="xs" wrap="nowrap" justify="center">
        <Code
          style={{
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {url}
        </Code>
        <CopyButton value={url}>
          {({ copied, copy }) => (
            <Button
              size="compact-xs"
              variant="light"
              color={copied ? 'brand' : 'gray'}
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              onClick={copy}
            >
              {copied ? 'Скопійовано' : 'Копіювати'}
            </Button>
          )}
        </CopyButton>
      </Group>
      {onLocalhost &&
        lanIps &&
        (lanIps.length > 0 ? (
          <Text size="xs" c="dimmed" ta="center">
            Телефон має бути в тій самій мережі Wi-Fi. Якщо не відкривається, відкрийте керування за
            IP-адресою комп’ютера ({lanIps[0]}).
          </Text>
        ) : (
          <Text size="xs" c="orange" ta="center">
            Не знайдено мережевої адреси. Підключіть комп’ютер до Wi-Fi чи LAN, щоб телефон міг
            приєднатися.
          </Text>
        ))}
    </Stack>
  );
}

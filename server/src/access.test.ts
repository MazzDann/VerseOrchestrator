import type os from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanIps } from './access';

const nic = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false) =>
  ({ address, family, internal, netmask: '', mac: '', cidr: null }) as os.NetworkInterfaceInfo;

describe('lanIps: the address phones get first', () => {
  // Mac check of 1.9.0: macOS names its virtual adapters by unit, none of them «virtual»
  it('a Mac: the hall Wi-Fi (en0) before UTM’s bridge', () => {
    expect(
      lanIps({
        lo0: [nic('127.0.0.1', 'IPv4', true), nic('::1', 'IPv6', true)],
        bridge100: [nic('192.168.64.1')],
        en0: [nic('fe80::1c2a:3b4c:5d6e:7f80', 'IPv6'), nic('10.0.0.23')],
      }),
    ).toEqual(['10.0.0.23', '192.168.64.1']);
  });

  it('VirtualBox host-only and container bridges go after the real Wi-Fi (1.9.2 review)', () => {
    expect(lanIps({ vboxnet0: [nic('192.168.56.1')], en0: [nic('10.0.0.23')] })).toEqual([
      '10.0.0.23',
      '192.168.56.1',
    ]);
    expect(
      lanIps({
        lxdbr0: [nic('10.10.10.1')],
        podman0: [nic('10.88.0.1')],
        cni0: [nic('10.22.0.1')],
        wlan0: [nic('172.20.4.7')],
      }),
    ).toEqual(['172.20.4.7', '10.10.10.1', '10.88.0.1', '10.22.0.1']);
  });

  it('a Mac: en0 before Parallels’ vnic0 and vnic1', () => {
    expect(
      lanIps({
        vnic0: [nic('10.211.55.2')],
        vnic1: [nic('10.37.129.2')],
        en0: [nic('172.20.4.7')],
      }),
    ).toEqual(['172.20.4.7', '10.211.55.2', '10.37.129.2']);
  });

  it('a Mac: en0 before Internet Sharing’s bridge enumerated first', () => {
    expect(
      lanIps({
        bridge100: [nic('192.168.2.1')],
        en0: [nic('192.168.1.40')],
      }),
    ).toEqual(['192.168.1.40', '192.168.2.1']);
  });

  it('a Mac: VMware Fusion, a VPN, the Thunderbolt Bridge and AirDrop go after en0', () => {
    expect(
      lanIps({
        vmnet8: [nic('192.168.200.1')],
        vmnet1: [nic('192.168.153.1')],
        utun4: [nic('192.168.7.2')],
        bridge0: [nic('192.168.3.1')],
        awdl0: [nic('fe80::a1', 'IPv6')],
        llw0: [nic('fe80::a2', 'IPv6')],
        en0: [nic('192.168.1.40')],
      }),
    ).toEqual(['192.168.1.40', '192.168.200.1', '192.168.153.1', '192.168.7.2', '192.168.3.1']);
  });

  it('a Mac: en<N> first among equals; two en keep their order', () => {
    expect(
      lanIps({
        zt5u4y6f2a: [nic('192.168.193.5')], // a name no list knows
        en0: [nic('192.168.1.40')],
        en5: [nic('192.168.1.41')], // a USB Ethernet adapter
      }),
    ).toEqual(['192.168.1.40', '192.168.1.41', '192.168.193.5']);
  });

  it('a link-local en0 is skipped; Internet Sharing over Wi-Fi keeps the bridge', () => {
    expect(
      lanIps({
        en0: [nic('169.254.12.3')], // no DHCP
        bridge100: [nic('192.168.2.1')],
      }),
    ).toEqual(['192.168.2.1']);
  });

  it('Windows: as before — vEthernet and VirtualBox after Wi-Fi, real ones in their order', () => {
    expect(
      lanIps({
        'vEthernet (WSL)': [nic('172.20.160.1')],
        'VirtualBox Host-Only Network': [nic('192.168.56.1')],
        'Loopback Pseudo-Interface 1': [nic('127.0.0.1', 'IPv4', true)],
        Ethernet: [nic('192.168.0.10')],
        'Wi-Fi': [nic('192.168.0.249')],
        'Ethernet 2': [nic('169.254.10.2')],
      }),
    ).toEqual(['192.168.0.10', '192.168.0.249', '192.168.56.1', '172.20.160.1']);
  });

  it('Linux: docker0 as before; Docker networks, libvirt and VPNs after the LAN, a br0 kept', () => {
    expect(
      lanIps({
        docker0: [nic('172.17.0.1')],
        'br-3f2a1b4c5d6e': [nic('172.18.0.1')],
        virbr0: [nic('192.168.122.1')],
        wg0: [nic('10.8.0.2')],
        enp3s0: [nic('172.16.5.20')],
        br0: [nic('192.168.1.20')], // a bridge over the real Ethernet
      }),
    ).toEqual([
      '192.168.1.20',
      '172.16.5.20',
      '192.168.122.1',
      '10.8.0.2',
      '172.17.0.1',
      '172.18.0.1',
    ]);
  });
});

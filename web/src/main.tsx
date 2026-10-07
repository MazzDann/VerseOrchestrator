import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { setBoot } from './serverStore';
import { installScrollingFlag } from './lib/scrolling';
import './styles.css';

import { theme } from './theme';
import { useSettings } from './settingsStore';
import { usePlaylist } from './playlistStore';
import { listenForForget } from './lib/browserData';
import { PageGuard } from './components/PageGuard';
import { takeHandover } from './lib/handover';
import { Home } from './pages/Home';

// Each page is its own chunk (0.12.1): a phone on /follow loads the reader, not the control
// window with its panels, the database engine and the benchmarks.
const Presenter = lazy(() => import('./pages/Presenter').then((m) => ({ default: m.Presenter })));
const Stage = lazy(() => import('./pages/Stage').then((m) => ({ default: m.Stage })));
const Follow = lazy(() => import('./pages/Follow').then((m) => ({ default: m.Follow })));
const Remote = lazy(() => import('./pages/Remote').then((m) => ({ default: m.Remote })));
const Desk = lazy(() => import('./pages/Desk').then((m) => ({ default: m.Desk })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Bench = lazy(() => import('./pages/Bench').then((m) => ({ default: m.Bench })));
const BenchPeer = lazy(() => import('./pages/BenchPeer').then((m) => ({ default: m.BenchPeer })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
});

// Cross-window live sync: a `storage` event fires in OTHER windows when one writes
// to localStorage, so rehydrate the persisted stores there — changes made in the
// standalone settings window flow to the control/presenter windows immediately.
window.addEventListener('storage', (e) => {
  if (e.key === 'vo:settings') void useSettings.persist.rehydrate();
  else if (e.key === 'vo:playlist') void usePlaylist.persist.rehydrate();
});
// «Вимкнути повністю» with «стерти дані браузера» in another window: stop writing here (0.7.1)
listenForForget();

// Control window: the server, the settings sync, the browser library (lib/controlBoot.ts —
// its own chunk, only for this page). Library reads wait for it (whenBooted).
if (window.location.pathname === '/') {
  // «Відкрити в … зараз» (lib/handover.ts): the one-time token — and the start file's browser
  // mark — out of the address before anything (the router, a reload, a restored tab) reads it
  takeHandover();
  setBoot(import('./lib/controlBoot').then((m) => m.bootControl()));
}

// no hover flashes on rows passing under a still pointer while a list scrolls (0.6.5)
installScrollingFlag();

// the page's language follows the interface language (0.11.0): screen readers, hyphenation
document.documentElement.lang = useSettings.getState().language;
useSettings.subscribe((s) => {
  document.documentElement.lang = s.language;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {/* bottom-left: the monitor column and the top of the centre stay free, and floating
          panels tile from the bottom-right — a toast there took the click meant for a
          panel's button (Windows test) */}
      <Notifications position="bottom-left" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/* a page that breaks never leaves a white window (0.13.0) */}
          <PageGuard>
            {/* nothing while a page's chunk arrives — a fraction of a second, once per window */}
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/presenter" element={<Presenter />} />
                <Route path="/stage" element={<Stage />} />
                <Route path="/follow" element={<Follow />} />
                <Route path="/remote" element={<Remote />} />
                <Route path="/desk" element={<Desk />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/bench" element={<Bench />} />
                <Route path="/bench/peer" element={<BenchPeer />} />
              </Routes>
            </Suspense>
          </PageGuard>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);

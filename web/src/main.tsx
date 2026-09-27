import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { probeServer, setBoot } from './serverStore';
import { localEngine } from './lib/engine';
import { restoreLocalSegments } from './lib/engine/restore';
import './styles.css';

import { theme } from './theme';
import { Control } from './pages/Control';
import { Presenter } from './pages/Presenter';
import { Stage } from './pages/Stage';
import { Follow } from './pages/Follow';
import { Remote } from './pages/Remote';
import { Settings } from './pages/Settings';
import { Bench } from './pages/Bench';
import { BenchPeer } from './pages/BenchPeer';
import { useSettings } from './settingsStore';
import { usePlaylist } from './playlistStore';

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

// Control window: is the server there? Without it (static deployment / server stopped)
// the library runs in the browser — switch to it and restore the remembered segments.
// Library reads wait for this (whenBooted), so nothing hits a missing API first.
if (window.location.pathname === '/') {
  setBoot(
    probeServer().then(() => {
      // (no server → reads go to the browser engine via effectiveSource(); the saved
      // preference is left alone so a temporary outage doesn't flip it)
      restoreLocalSegments();
      return localEngine.whenReady();
    }),
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {/* bottom-left: the monitor column and the top of the centre stay free, and floating
          panels tile from the bottom-right — a toast there took the click meant for a
          panel's button (Windows test) */}
      <Notifications position="bottom-left" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Control />} />
            <Route path="/presenter" element={<Presenter />} />
            <Route path="/stage" element={<Stage />} />
            <Route path="/follow" element={<Follow />} />
            <Route path="/remote" element={<Remote />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/bench" element={<Bench />} />
            <Route path="/bench/peer" element={<BenchPeer />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);

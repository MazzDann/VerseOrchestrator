import { lazy } from 'react';
import { useServer } from '../serverStore';

// each its own chunk (0.12.1): another computer never downloads the control window
const Control = lazy(() => import('./Control').then((m) => ({ default: m.Control })));
const OtherComputer = lazy(() =>
  import('./OtherComputer').then((m) => ({ default: m.OtherComputer })),
);

/**
 * `/` (1.9.0-beta.1): the control window on the computer with the app; opened from another
 * computer, how to get a desk link — nothing until the start knows which (at once on localhost).
 */
export function Home() {
  const here = useServer((s) => s.here);
  return here === false ? <OtherComputer /> : here ? <Control /> : null;
}

/// <reference lib="webworker" />

/**
 * SharedWorker relay for the sync benchmark (lib/bench/sync.ts): every page that
 * connects gets a port; whatever one port posts is forwarded to all the others — the
 * shape a SharedWorker-based window bus would have.
 */
const ports: MessagePort[] = [];

(self as unknown as SharedWorkerGlobalScope).onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  ports.push(port);
  port.onmessage = (m: MessageEvent) => {
    for (const p of ports) if (p !== port) p.postMessage(m.data);
  };
  port.start();
};

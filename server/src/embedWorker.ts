/**
 * The vector job's model in its own process (embedding.ts openChildEmbedder): started at the lowest
 * priority, it answers the server's IPC messages — open the model once, then batches of texts.
 */
import { openEmbedder, type WorkerAsk, type WorkerReply } from './embedding.js';

let embedder: Awaited<ReturnType<typeof openEmbedder>> | null = null;
const reply = (m: WorkerReply) => process.send?.(m);

process.on('message', (m: WorkerAsk) => {
  void (async () => {
    try {
      if ('open' in m) {
        embedder = await openEmbedder(m.open.dataDir, m.open.model, m.open.threads);
        reply({ id: m.id });
      } else {
        if (!embedder) throw new Error('no model open');
        reply({ id: m.id, vectors: await embedder.embed(m.texts, m.as) });
      }
    } catch (e) {
      reply({ id: m.id, error: (e as Error).message });
    }
  })();
});
// the server gone (its IPC channel closed): nothing left to answer
process.on('disconnect', () => process.exit(0));

/**
 * A dropped module in a text format read apart (1.25.0-beta.6, textModuleCheck.ts): a whole Bible takes
 * about a second, and the server's sockets go on meanwhile. The file's path in, what came of it out.
 */
import fs from 'node:fs';
import { ModuleError, parseTextModule } from '@vo/shared';
import type { TextCheckAsk, TextCheckReply } from './textModuleCheck.js';

const reply = (m: TextCheckReply) => process.send?.(m, () => process.exit(0));

process.on('message', (m: TextCheckAsk) => {
  try {
    reply({ skipped: parseTextModule(fs.readFileSync(m.file)).skipped });
  } catch (e) {
    reply(
      e instanceof ModuleError
        ? { key: e.key, vars: e.vars }
        : { key: '', error: (e as Error).message },
    );
  }
});
process.on('disconnect', () => process.exit(0));

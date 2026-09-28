# Developer documentation

These pages are for developers who change VerseOrchestrator's code. They assume you know
TypeScript, React, and Node.js. The user documentation, in Ukrainian, starts at
[docs/README.md](../README.md).

- [Architecture](architecture.md): the packages, the processes, how data flows, and
  where to start reading for a given change.
- [Hybrid database](hybrid-db.md): one schema and one set of queries on SQLite, SQLite
  in WebAssembly, and PostgreSQL in WebAssembly, with the measurements.
- [Window synchronization](window-sync.md): the window bus, output windows, the leading
  control window, commands, and the hub for phones, with the measurements.
- [Contributing](contributing.md): the setup, the checks before every commit, and the
  project's conventions for versions, commits, UI, and docs.

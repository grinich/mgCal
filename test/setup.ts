// src/app/time.ts reads a persisted zoom level at module scope, so a minimal
// localStorage stand-in has to exist before it's imported. Nothing else in the
// tested modules touches browser APIs.
const store = new Map<string, string>()

globalThis.localStorage = {
  get length() {
    return store.size
  },
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
} as Storage

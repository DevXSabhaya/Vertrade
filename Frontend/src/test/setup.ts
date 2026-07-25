import '@testing-library/jest-dom/vitest'

// This Node runtime's built-in `localStorage` global requires an explicit
// `--localstorage-file` flag and shadows jsdom's own implementation without
// it — stub a minimal in-memory version so modules that read localStorage at
// import time (token-store.ts) don't crash under Vitest.
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

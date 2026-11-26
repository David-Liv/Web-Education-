export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

class BrowserKeyValueStorage implements KeyValueStorage {
  private readonly getBackend: () => Storage | null;

  constructor(getBackend: () => Storage | null) {
    this.getBackend = getBackend;
  }

  get(key: string): string | null {
    try {
      return this.getBackend()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      this.getBackend()?.setItem(key, value);
    } catch {
      // Ignore quota / private-browsing storage restrictions
    }
  }

  remove(key: string): void {
    try {
      this.getBackend()?.removeItem(key);
    } catch {
      // Ignore storage access errors in restricted webviews
    }
  }
}

export function createBrowserStorage(getBackend: () => Storage | null): KeyValueStorage {
  return new BrowserKeyValueStorage(getBackend);
}

export const persistentStorage: KeyValueStorage = createBrowserStorage(() =>
  typeof localStorage === 'undefined' ? null : localStorage
);

export const sessionStore: KeyValueStorage = createBrowserStorage(() =>
  typeof sessionStorage === 'undefined' ? null : sessionStorage
);

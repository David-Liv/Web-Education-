import { describe, expect, it } from 'vitest';
import { createBrowserStorage } from './storage';

describe('platform/storage', () => {
  it('reads, writes, and removes values through the KeyValueStorage interface', () => {
    const map = new Map<string, string>();
    const fakeBackend = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    } as Storage;

    const store = createBrowserStorage(() => fakeBackend);
    expect(store.get('hokse.sidebar-collapsed')).toBeNull();
    store.set('hokse.sidebar-collapsed', 'true');
    expect(store.get('hokse.sidebar-collapsed')).toBe('true');
    store.remove('hokse.sidebar-collapsed');
    expect(store.get('hokse.sidebar-collapsed')).toBeNull();
  });

  it('degrades safely without throwing when storage is unavailable or blocked', () => {
    const throwingStore = createBrowserStorage(() => {
      throw new Error('SecurityError');
    });
    expect(throwingStore.get('k')).toBeNull();
    expect(() => throwingStore.set('k', 'v')).not.toThrow();
    expect(() => throwingStore.remove('k')).not.toThrow();

    const missingStore = createBrowserStorage(() => null);
    expect(missingStore.get('k')).toBeNull();
    expect(() => missingStore.set('k', 'v')).not.toThrow();
  });
});

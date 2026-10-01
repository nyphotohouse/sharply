"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Keep the server render deterministic and hydrate from localStorage after mount
  const [value, setValue] = useState<T>(initialValue);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  useEffect(() => {
    // Read the stored value once the component is mounted to avoid SSR mismatch
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // ignore read failures
    } finally {
      setHasLoadedFromStorage(true);
    }
  }, [key]);

  useEffect(() => {
    if (!hasLoadedFromStorage) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write failures
    }
  }, [key, value, hasLoadedFromStorage]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setValue(initialValue);
  }, [key, initialValue]);

  return { value, setValue, clear, hasLoadedFromStorage } as const;
}

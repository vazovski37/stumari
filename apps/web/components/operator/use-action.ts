"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { errorMessage } from "@/lib/client/api";

/**
 * Runs one API mutation at a time (keyed, so a table knows which row is busy), keeps its error,
 * and re-renders the server component page on success.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(key);
      setError(null);
      try {
        const result = await fn();
        router.refresh();
        return result;
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  return { run, busy, error, clearError: () => setError(null) };
}

import { useCallback, useEffect, useState } from "react";

/*
  Loads data for a key and re-loads when the key changes.
    const { data, error, loading, reload, setData } = useResource(key, (signal) => api(...))
  Pass key = null to skip loading. Requests for stale keys are aborted.
*/
export function useResource(key, fetcher, { keepPrevious = false } = {}) {
  const [state, setState] = useState({ key: null, data: undefined, error: null });
  const [nonce, setNonce] = useState(0);
  const fullKey = key == null ? null : `${key}#${nonce}`;

  useEffect(() => {
    if (fullKey == null) return undefined;
    const controller = new AbortController();
    fetcher(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key: fullKey, data, error: null });
      },
      (error) => {
        if (error?.name === "AbortError" || controller.signal.aborted) return;
        setState((s) => ({ key: fullKey, data: keepPrevious ? s.data : undefined, error }));
      }
    );
    return () => controller.abort();
    // The fetcher is intentionally not a dependency: the key decides when to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const current = state.key === fullKey;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (updater) => setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater })),
    []
  );

  return {
    data: current || keepPrevious ? state.data : undefined,
    error: current ? state.error : null,
    loading: fullKey != null && !current,
    reload,
    setData,
  };
}

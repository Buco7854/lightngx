import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Tag } from "../../api";

export const catalogEvent = "lightngx:tags-changed";

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(() => {
    const request = ++sequence.current;
    return api
      .tags()
      .then((r) => {
        if (request === sequence.current) {
          setTags(r.tags);
          setError("");
        }
      })
      .catch((e) => {
        if (request === sequence.current) setError(e.message);
      })
      .finally(() => {
        if (request === sequence.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener(catalogEvent, refresh);
    return () => {
      sequence.current++;
      window.removeEventListener(catalogEvent, refresh);
    };
  }, [refresh]);
  return { tags, refresh, error, loading };
}

type FileTagState = Awaited<ReturnType<typeof api.fileTags>>;

export function useFileTags(path?: string, revision?: string, enabled = true) {
  const [data, setData] = useState<FileTagState | null>(null);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!path || !enabled) return;
    try {
      const result = await api.fileTags(path);
      if (request === sequence.current) {
        setData(result);
        setError("");
      }
    } catch (err) {
      if (request === sequence.current) setError((err as Error).message);
    }
  }, [path, enabled]);
  useEffect(() => {
    void refresh();
    window.addEventListener(catalogEvent, refresh);
    return () => {
      sequence.current++;
      window.removeEventListener(catalogEvent, refresh);
    };
  }, [refresh, revision]);
  const update = useCallback((value: FileTagState) => {
    // An older refresh must not overwrite an optimistic edit or its saved result.
    sequence.current++;
    setData(value);
  }, []);
  return { data, error, refresh, setData: update };
}

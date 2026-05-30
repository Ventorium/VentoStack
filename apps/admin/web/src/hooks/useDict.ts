import { useCallback, useEffect, useRef, useState } from "react";

export interface DictItem {
  id: string;
  typeCode: string;
  label: string;
  value: string;
  sort: number;
  cssClass: string;
  status: number;
}

interface CacheEntry {
  data: DictItem[];
  expireAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000; // 5 minutes

async function fetchDictData(typeCode: string): Promise<DictItem[]> {
  const { client } = await import("@/api");
  const { data } = (await client.get("/api/system/dict/types/:code/data", {
    params: { code: typeCode },
  } as any)) as { data?: DictItem[]; error?: unknown };
  return data ?? [];
}

export function useDict(typeCode: string): {
  options: DictItem[];
  loading: boolean;
  refresh: () => void;
} {
  const [options, setOptions] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef(0);

  const load = useCallback(async () => {
    const cached = cache.get(typeCode);
    if (cached && cached.expireAt > Date.now()) {
      setOptions(cached.data);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchDictData(typeCode);
      cache.set(typeCode, { data, expireAt: Date.now() + TTL });
      setOptions(data);
    } finally {
      setLoading(false);
    }
  }, [typeCode]);

  useEffect(() => {
    load();
  }, [load, refreshRef.current]);

  return {
    options,
    loading,
    refresh: () => {
      refreshRef.current++;
    },
  };
}

export function invalidateDict(typeCode?: string) {
  if (typeCode) {
    cache.delete(typeCode);
  } else {
    cache.clear();
  }
}

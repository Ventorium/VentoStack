import { useCallback, useEffect, useState } from "react";

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
  } as unknown as Parameters<typeof client.get>[1])) as { data?: DictItem[]; error?: unknown };
  return data ?? [];
}

export function useDict(typeCode: string): {
  options: DictItem[];
  loading: boolean;
  refresh: () => void;
} {
  const [options, setOptions] = useState<DictItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

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
  }, [load, version]);

  return {
    options,
    loading,
    refresh: () => {
      // 清除缓存并递增版本号，触发重新加载
      cache.delete(typeCode);
      setVersion((v) => v + 1);
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

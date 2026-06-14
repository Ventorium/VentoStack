/**
 * 日期时间工具
 * 获取当前时间、时区转换、日期计算
 */

export function createDatetimeTool() {
  return {
    name: "datetime",
    description: "获取当前日期时间、时区信息。支持获取指定时区的当前时间。",
    parameters: [
      {
        name: "timezone",
        type: "string" as const,
        description: "时区名称，如 Asia/Shanghai、America/New_York，留空则返回 UTC",
        required: false,
      },
    ],
    riskLevel: "low" as const,
    async handler(params: Record<string, unknown>): Promise<Record<string, string>> {
      const tz = (params.timezone as string) || "UTC";
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("zh-CN", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          weekday: "long",
          hour12: false,
        });
        return {
          timezone: tz,
          datetime: formatter.format(now),
          iso: now.toISOString(),
          timestamp: String(Math.floor(now.getTime() / 1000)),
        };
      } catch {
        return { error: `无效的时区: ${tz}` };
      }
    },
  };
}

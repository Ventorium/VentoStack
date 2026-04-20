// @aeron/observability — Health Check

export interface CheckResult {
  status: "ok" | "error";
  message?: string;
  duration?: number;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  checks: Record<string, CheckResult>;
  uptime: number;
}

export interface HealthCheck {
  addCheck(name: string, checker: () => Promise<boolean | string>): void;
  live(): { status: "ok" };
  ready(): Promise<HealthStatus>;
}

export interface HealthCheckOptions {
  startTime?: number;
}

export function createHealthCheck(options?: HealthCheckOptions): HealthCheck {
  const startTime = options?.startTime ?? Date.now();
  const checks = new Map<string, () => Promise<boolean | string>>();

  function addCheck(name: string, checker: () => Promise<boolean | string>): void {
    checks.set(name, checker);
  }

  function live(): { status: "ok" } {
    return { status: "ok" };
  }

  async function ready(): Promise<HealthStatus> {
    const results: Record<string, CheckResult> = {};
    let okCount = 0;
    let totalCount = 0;

    const entries = Array.from(checks.entries());

    await Promise.all(
      entries.map(async ([name, checker]) => {
        totalCount++;
        const start = performance.now();
        try {
          const result = await checker();
          const duration = Math.round((performance.now() - start) * 100) / 100;
          if (result === true) {
            results[name] = { status: "ok", duration };
            okCount++;
          } else {
            results[name] = { status: "error", message: result as string, duration };
          }
        } catch (err) {
          const duration = Math.round((performance.now() - start) * 100) / 100;
          results[name] = {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
            duration,
          };
        }
      }),
    );

    let status: HealthStatus["status"];
    if (totalCount === 0) {
      status = "ok";
    } else if (okCount === totalCount) {
      status = "ok";
    } else if (okCount === 0) {
      status = "error";
    } else {
      status = "degraded";
    }

    return {
      status,
      checks: results,
      uptime: Date.now() - startTime,
    };
  }

  return { addCheck, live, ready };
}

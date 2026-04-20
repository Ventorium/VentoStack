// @aeron/testing - 安全回归测试工具

export interface SecurityTestSuite {
  xssPayloads(): string[];
  sqlInjectionPayloads(): string[];
  pathTraversalPayloads(): string[];
  csrfPayloads(): Array<{ method: string; headers: Record<string, string> }>;
  oversizedPayload(sizeBytes: number): string;
  testEndpoint(
    client: {
      fetch: (url: string, init?: RequestInit) => Promise<Response>;
    },
    url: string,
    options?: {
      expectedStatus?: number[];
      testXSS?: boolean;
      testSQLi?: boolean;
      testPathTraversal?: boolean;
    },
  ): Promise<{ passed: boolean; failures: string[] }>;
}

const XSS_PAYLOADS: string[] = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '"><script>alert(1)</script>',
  "'-alert(1)-'",
  '<iframe src="javascript:alert(1)">',
  '<body onload=alert(1)>',
  '<input onfocus=alert(1) autofocus>',
  '{{constructor.constructor("alert(1)")()}}',
];

const SQLI_PAYLOADS: string[] = [
  "' OR 1=1 --",
  '"; DROP TABLE users; --',
  "' UNION SELECT NULL, NULL --",
  "1; SELECT * FROM information_schema.tables --",
  "' AND 1=CONVERT(int,(SELECT TOP 1 table_name FROM information_schema.tables)) --",
  "admin'--",
  "1' ORDER BY 1 --",
  "' OR '1'='1",
  "-1 OR 1=1",
  "'; EXEC xp_cmdshell('whoami') --",
];

const PATH_TRAVERSAL_PAYLOADS: string[] = [
  "../../../etc/passwd",
  "..%2F..%2F..%2Fetc%2Fpasswd",
  "....//....//....//etc/passwd",
  "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "..\\..\\..\\windows\\system32\\config\\sam",
  "%00",
  "..%00",
  "/etc/passwd%00.jpg",
  "....//",
  "..%252f..%252f..%252fetc%252fpasswd",
];

export function createSecurityTestSuite(): SecurityTestSuite {
  return {
    xssPayloads() {
      return [...XSS_PAYLOADS];
    },

    sqlInjectionPayloads() {
      return [...SQLI_PAYLOADS];
    },

    pathTraversalPayloads() {
      return [...PATH_TRAVERSAL_PAYLOADS];
    },

    csrfPayloads() {
      return [
        { method: "POST", headers: {} },
        { method: "POST", headers: { origin: "https://evil.com" } },
        { method: "POST", headers: { referer: "https://evil.com/attack" } },
        {
          method: "PUT",
          headers: { origin: "https://evil.com" },
        },
        {
          method: "DELETE",
          headers: { origin: "https://evil.com" },
        },
      ];
    },

    oversizedPayload(sizeBytes: number): string {
      return "A".repeat(sizeBytes);
    },

    async testEndpoint(client, url, options = {}) {
      const {
        expectedStatus = [400, 403, 422],
        testXSS = true,
        testSQLi = true,
        testPathTraversal = true,
      } = options;

      const failures: string[] = [];

      async function testPayloads(
        category: string,
        payloads: string[],
      ): Promise<void> {
        for (const payload of payloads) {
          try {
            const response = await client.fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ input: payload }),
            });

            if (!expectedStatus.includes(response.status)) {
              failures.push(
                `${category}: payload "${payload.slice(0, 50)}" returned status ${response.status}, expected one of [${expectedStatus.join(", ")}]`,
              );
            }
          } catch (error) {
            failures.push(
              `${category}: payload "${payload.slice(0, 50)}" threw error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (testXSS) {
        await testPayloads("XSS", XSS_PAYLOADS);
      }
      if (testSQLi) {
        await testPayloads("SQLi", SQLI_PAYLOADS);
      }
      if (testPathTraversal) {
        await testPayloads("PathTraversal", PATH_TRAVERSAL_PAYLOADS);
      }

      return {
        passed: failures.length === 0,
        failures,
      };
    },
  };
}

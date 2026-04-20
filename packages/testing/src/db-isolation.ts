// @aeron/testing - 数据库测试隔离

export interface DBIsolationOptions {
  executor: (sql: string) => Promise<void>;
}

export interface DBIsolation {
  begin(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<void>;
  rollbackTo(name: string): Promise<void>;
}

function validateSavepointName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid savepoint name: "${name}". Only alphanumeric characters and underscores are allowed.`,
    );
  }
}

export function createDBIsolation(options: DBIsolationOptions): DBIsolation {
  const { executor } = options;

  return {
    async begin() {
      await executor("BEGIN");
    },
    async rollback() {
      await executor("ROLLBACK");
    },
    async savepoint(name: string) {
      validateSavepointName(name);
      await executor(`SAVEPOINT ${name}`);
    },
    async rollbackTo(name: string) {
      validateSavepointName(name);
      await executor(`ROLLBACK TO SAVEPOINT ${name}`);
    },
  };
}

export function withTransaction(executor: (sql: string) => Promise<void>): {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
} {
  const isolation = createDBIsolation({ executor });

  return {
    beforeEach: () => isolation.begin(),
    afterEach: () => isolation.rollback(),
  };
}

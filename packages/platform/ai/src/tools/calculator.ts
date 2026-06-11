/**
 * 安全计算器工具
 * 安全数学表达式求值，不使用 eval
 * 支持：+、-、*、/、**、%、()
 */

export function createCalculatorTool() {
  return {
    name: "calculator",
    description: "安全数学表达式求值。支持 +、-、*、/、**（幂）、%（取模）和括号。",
    parameters: [
      {
        name: "expression",
        type: "string" as const,
        description: "数学表达式，例如 '2 * (3 + 4)'",
        required: true,
      },
    ],
    async handler(params: Record<string, unknown>): Promise<{ result: number; expression: string } | { error: string }> {
      const expression = (params.expression as string)?.trim();
      if (!expression) {
        return { error: "表达式不能为空" };
      }

      try {
        const result = safeEvaluate(expression);
        return { result, expression };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "表达式计算失败",
        };
      }
    },
  };
}

/**
 * 安全数学表达式求值
 * 使用递归下降解析器，不使用 eval
 */
function safeEvaluate(expr: string): number {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++]!;
  }

  function parseExpression(): number {
    return parseAddSub();
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek()?.type === "op" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = consume().value;
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePower();
    while (peek()?.type === "op" && (peek()!.value === "*" || peek()!.value === "/" || peek()!.value === "%")) {
      const op = consume().value;
      const right = parsePower();
      if (op === "/") {
        if (right === 0) throw new Error("除以零");
        left = left / right;
      } else if (op === "%") {
        if (right === 0) throw new Error("除以零");
        left = left % right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parsePower(): number {
    let base = parseUnary();
    if (peek()?.type === "op" && peek()!.value === "**") {
      consume();
      const exp = parsePower(); // 右结合
      base = base ** exp;
    }
    return base;
  }

  function parseUnary(): number {
    if (peek()?.type === "op" && peek()!.value === "-") {
      consume();
      return -parsePrimary();
    }
    if (peek()?.type === "op" && peek()!.value === "+") {
      consume();
      return parsePrimary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = peek();
    if (!token) throw new Error("意外的表达式结尾");

    if (token.type === "number") {
      consume();
      return Number(token.value);
    }

    if (token.type === "lparen") {
      consume(); // (
      const value = parseExpression();
      if (peek()?.type !== "rparen") throw new Error("缺少右括号");
      consume(); // )
      return value;
    }

    throw new Error(`意外的 token: ${token.value}`);
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`多余的 token: ${tokens[pos]!.value}`);
  }
  return result;
}

interface Token {
  type: "number" | "op" | "lparen" | "rparen";
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i]!;

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    if (ch === "(") { tokens.push({ type: "lparen", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")" }); i++; continue; }
    if (ch === "+" || ch === "-" || ch === "/" || ch === "%") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "*") {
      if (expr[i + 1] === "*") {
        tokens.push({ type: "op", value: "**" });
        i += 2;
      } else {
        tokens.push({ type: "op", value: "*" });
        i++;
      }
      continue;
    }

    if (ch >= "0" && ch <= "9" || ch === ".") {
      let num = "";
      while (i < expr.length && ((expr[i]! >= "0" && expr[i]! <= "9") || expr[i] === ".")) {
        num += expr[i]!;
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    throw new Error(`非法字符: ${ch}`);
  }

  return tokens;
}

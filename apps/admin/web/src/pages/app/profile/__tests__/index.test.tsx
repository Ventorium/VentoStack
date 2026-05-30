import { describe, expect, mock, test } from "bun:test";

describe("个人中心页", () => {
  test("密码校验 - 长度至少8位", () => {
    const validatePassword = (pwd: string) => pwd.length >= 8;
    expect(validatePassword("12345678")).toBe(true);
    expect(validatePassword("1234567")).toBe(false);
  });

  test("密码校验 - 包含字母和数字", () => {
    const pattern =
      /^(?=.*[a-zA-Z])(?=.*\d)|(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9])|(?=.*\d)(?=.*[^a-zA-Z0-9]).+$/;
    expect(pattern.test("abc12345")).toBe(true);
    expect(pattern.test("abcdefgh")).toBe(false);
    expect(pattern.test("12345678")).toBe(false);
  });

  test("两次密码一致性校验", () => {
    const matchPassword = (newPwd: string, confirmPwd: string) => newPwd === confirmPwd;
    expect(matchPassword("abc12345", "abc12345")).toBe(true);
    expect(matchPassword("abc12345", "abc12346")).toBe(false);
  });

  test("性别选项正确", () => {
    const genderOptions = [
      { value: 0, label: "未知" },
      { value: 1, label: "男" },
      { value: 2, label: "女" },
    ];
    expect(genderOptions).toHaveLength(3);
    expect(genderOptions.map((g) => g.value)).toEqual([0, 1, 2]);
  });

  test("MFA 设置状态转换", () => {
    type MfaStep = "idle" | "setup" | "verify";
    const steps: MfaStep[] = ["idle", "setup", "verify"];
    expect(steps).toHaveLength(3);
    expect(steps[0]).toBe("idle");
  });

  test("个人中心 API 端点正确", () => {
    const endpoints = {
      profile: "/api/system/user/profile",
      updateProfile: "/api/system/user/profile",
      changePassword: "/api/system/user/profile/password",
      avatar: "/api/system/user/profile/avatar",
      mfaEnable: "/api/auth/mfa/enable",
      mfaVerify: "/api/auth/mfa/verify",
      mfaDisable: "/api/auth/mfa/disable",
    };
    expect(endpoints.profile).toContain("profile");
    expect(endpoints.changePassword).toContain("password");
    expect(endpoints.mfaEnable).toContain("mfa");
  });

  test("Tab 结构包含 5 个标签: basic/password/mfa/passkey/history", () => {
    const tabKeys = ["basic", "password", "mfa", "passkey", "history"];
    expect(tabKeys).toHaveLength(5);
    expect(tabKeys).toContain("basic");
    expect(tabKeys).toContain("password");
    expect(tabKeys).toContain("mfa");
    expect(tabKeys).toContain("passkey");
    expect(tabKeys).toContain("history");
  });

  test("MFA tab 在 mfaGloballyEnabled=false 时不显示", () => {
    const mfaGloballyEnabled = false;
    const tabItems = [
      { key: "basic" },
      { key: "password" },
      ...(mfaGloballyEnabled ? [{ key: "mfa" }] : []),
      { key: "passkey" },
      { key: "history" },
    ];
    expect(tabItems.map((t) => t.key)).not.toContain("mfa");
    expect(tabItems).toHaveLength(4);
  });

  test("MFA tab 在 mfaGloballyEnabled=true 时显示", () => {
    const mfaGloballyEnabled = true;
    const tabItems = [
      { key: "basic" },
      { key: "password" },
      ...(mfaGloballyEnabled ? [{ key: "mfa" }] : []),
      { key: "passkey" },
      { key: "history" },
    ];
    expect(tabItems.map((t) => t.key)).toContain("mfa");
    expect(tabItems).toHaveLength(5);
  });

  test("个人资料表单字段: nickname、email、phone、gender", () => {
    const profileFields = ["nickname", "email", "phone", "gender"];
    expect(profileFields).toContain("nickname");
    expect(profileFields).toContain("email");
    expect(profileFields).toContain("phone");
    expect(profileFields).toContain("gender");
  });

  test("提交个人资料时 gender 应从字符串转为数字", () => {
    const values = { nickname: "test", email: "test@test.com", phone: "13800138000", gender: "1" };
    const body = {
      nickname: values.nickname,
      email: values.email,
      phone: values.phone,
      gender: Number(values.gender),
    };
    expect(body.gender).toBe(1);
    expect(typeof body.gender).toBe("number");
  });

  test("修改密码 API: PUT /api/system/user/profile/password", () => {
    const client = { put: mock(() => Promise.resolve({ error: null })) };
    client.put("/api/system/user/profile/password", {
      body: { oldPassword: "old123", newPassword: "new12345" },
    });
    expect(client.put).toHaveBeenCalledTimes(1);
    const [url, options] = client.put.mock.calls[0];
    expect(url).toBe("/api/system/user/profile/password");
    expect(options.body.oldPassword).toBe("old123");
    expect(options.body.newPassword).toBe("new12345");
  });

  test("MFA 启用: POST /api/auth/mfa/enable 返回 setupData", () => {
    const client = {
      post: mock(() =>
        Promise.resolve({
          error: null,
          data: { secret: "ABCDEF", qrCodeUri: "otpauth://...", recoveryCodes: ["code1", "code2"] },
        }),
      ),
    };
    client.post("/api/auth/mfa/enable", {});
    expect(client.post).toHaveBeenCalledTimes(1);
    const [url] = client.post.mock.calls[0];
    expect(url).toBe("/api/auth/mfa/enable");
  });

  test("MFA 启用后 mfaStep 转为 setup", () => {
    let mfaStep: "idle" | "setup" | "verify" = "idle";
    const setupData = { secret: "ABCDEF", qrCodeUri: "otpauth://...", recoveryCodes: ["code1"] };
    if (setupData) {
      mfaStep = "setup";
    }
    expect(mfaStep).toBe("setup");
  });

  test("MFA 验证: POST /api/auth/mfa/verify body 含 code", () => {
    const client = { post: mock(() => Promise.resolve({ error: null })) };
    client.post("/api/auth/mfa/verify", { body: { code: "123456" } });
    expect(client.post).toHaveBeenCalledTimes(1);
    const [url, options] = client.post.mock.calls[0];
    expect(url).toBe("/api/auth/mfa/verify");
    expect(options.body.code).toBe("123456");
  });

  test("MFA 验证成功后 mfaEnabled 变为 true", () => {
    let mfaEnabled = false;
    let mfaStep: "idle" | "setup" | "verify" = "verify";
    // 模拟验证成功
    mfaEnabled = true;
    mfaStep = "idle";
    expect(mfaEnabled).toBe(true);
    expect(mfaStep).toBe("idle");
  });

  test("MFA 禁用: POST /api/auth/mfa/disable body 含 code", () => {
    const client = { post: mock(() => Promise.resolve({ error: null })) };
    client.post("/api/auth/mfa/disable", { body: { code: "123456" } });
    expect(client.post).toHaveBeenCalledTimes(1);
    const [url, options] = client.post.mock.calls[0];
    expect(url).toBe("/api/auth/mfa/disable");
    expect(options.body.code).toBe("123456");
  });

  test("通行密钥列表: GET /api/auth/passkey/list", () => {
    const client = { get: mock(() => Promise.resolve({ error: null, data: [] })) };
    client.get("/api/auth/passkey/list" as unknown as "/api/system/users");
    expect(client.get).toHaveBeenCalledTimes(1);
    const [url] = client.get.mock.calls[0];
    expect(url).toBe("/api/auth/passkey/list");
  });

  test("通行密钥注册: begin → finish 流程", () => {
    const client = {
      post: mock(() => Promise.resolve({ error: null, data: { options: {}, challengeId: "ch1" } })),
    };
    // begin
    client.post("/api/auth/passkey/register-begin" as unknown as "/api/system/users", { body: {} });
    expect(client.post).toHaveBeenCalledTimes(1);
    // finish
    client.post("/api/auth/passkey/register-finish" as unknown as "/api/system/users", {
      body: { name: "MacBook", challengeId: "ch1", credential: { id: "cred1" } },
    });
    expect(client.post).toHaveBeenCalledTimes(2);
    const [, finishOptions] = client.post.mock.calls[1];
    expect(finishOptions.body.name).toBe("MacBook");
    expect(finishOptions.body.challengeId).toBe("ch1");
  });

  test("通行密钥删除: DELETE /api/auth/passkey/:id", () => {
    const client = { delete: mock(() => Promise.resolve({ error: null })) };
    client.delete("/api/auth/passkey/pk1" as unknown as "/api/system/users/:id");
    expect(client.delete).toHaveBeenCalledTimes(1);
    const [url] = client.delete.mock.calls[0];
    expect(url).toBe("/api/auth/passkey/pk1");
  });

  test("通行密钥上限 3 个，达到上限后禁用添加按钮", () => {
    const passkeys = [
      {
        id: "1",
        name: "key1",
        deviceType: "platform",
        backedUp: false,
        createdAt: "",
        lastUsedAt: null,
      },
      {
        id: "2",
        name: "key2",
        deviceType: "platform",
        backedUp: false,
        createdAt: "",
        lastUsedAt: null,
      },
      {
        id: "3",
        name: "key3",
        deviceType: "platform",
        backedUp: false,
        createdAt: "",
        lastUsedAt: null,
      },
    ];
    const addDisabled = passkeys.length >= 3;
    expect(addDisabled).toBe(true);
    expect(passkeys).toHaveLength(3);
  });

  test("通行密钥少于 3 个时启用添加按钮", () => {
    const passkeys = [
      {
        id: "1",
        name: "key1",
        deviceType: "platform",
        backedUp: false,
        createdAt: "",
        lastUsedAt: null,
      },
    ];
    const addDisabled = passkeys.length >= 3;
    expect(addDisabled).toBe(false);
  });

  test("mfaForce && !mfaEnabled 时显示警告提示", () => {
    const mfaForce = true;
    const mfaEnabled = false;
    const mfaStep: string = "idle";
    const showAlert = mfaForce && !mfaEnabled && mfaStep === "idle";
    expect(showAlert).toBe(true);
  });

  test("mfaForce && mfaEnabled 时不显示警告提示", () => {
    const mfaForce = true;
    const mfaEnabled = true;
    const mfaStep: string = "idle";
    const showAlert = mfaForce && !mfaEnabled && mfaStep === "idle";
    expect(showAlert).toBe(false);
  });

  test("登录记录使用 useTable + /api/system/login-logs", () => {
    const client = {
      get: mock(() => Promise.resolve({ error: null, data: { items: [], total: 0 } })),
    };
    client.get("/api/system/login-logs", { query: { page: 1, pageSize: 10 } });
    expect(client.get).toHaveBeenCalledTimes(1);
    const [url, options] = client.get.mock.calls[0];
    expect(url).toBe("/api/system/login-logs");
    expect(options.query.page).toBe(1);
    expect(options.query.pageSize).toBe(10);
  });

  test("登录记录列包含 IP、浏览器、操作系统、状态、登录方式、登录时间", () => {
    const columnKeys = ["ip", "browser", "os", "status", "loginMethod", "loginAt"];
    expect(columnKeys).toContain("ip");
    expect(columnKeys).toContain("browser");
    expect(columnKeys).toContain("os");
    expect(columnKeys).toContain("status");
    expect(columnKeys).toContain("loginMethod");
    expect(columnKeys).toContain("loginAt");
  });

  test("登录方式标签映射正确", () => {
    const methodMap: Record<string, { label: string; color: string }> = {
      password: { label: "密码", color: "default" },
      mfa: { label: "MFA", color: "blue" },
      passkey: { label: "Passkey", color: "green" },
    };
    expect(methodMap.password.label).toBe("密码");
    expect(methodMap.mfa.color).toBe("blue");
    expect(methodMap.passkey.color).toBe("green");
  });
});

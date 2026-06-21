import { client } from "@/api";
import { globalNavigate } from "@/components/GlobalHistory";
import { startAuthentication } from "@simplewebauthn/browser";
import { create } from "zustand";
import { clearToken, getAccessToken, setAccessToken, setRefreshToken } from "./token";

interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
  gender: number;
  status: number;
  deptId: string;
  deptName: string;
  roles: string[];
  permissions: string[];
}

export type LoginForm = { username: string; password: string; remember?: boolean };

export type PasswordExpiredInfo = { code: "password_expired"; tempToken: string };

export type MfaRequiredInfo = { code: "mfa_required"; mfaToken: string };

interface LoginResponseData {
  accessToken: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  mfaToken?: string;
  mfaSetupRequired?: boolean;
  expiresIn: number;
  sessionId: string;
}

export type LoginResult = UserProfile | PasswordExpiredInfo | MfaRequiredInfo | null;

export type AuthState = {
  user: UserProfile | null;
  ready: boolean;
  loading: boolean;
  computed: { logged: boolean };
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchUser: (patch: Partial<UserProfile>) => void;
  login: (args: LoginForm) => Promise<LoginResult>;
  completeMFALogin: (mfaToken: string, code: string) => Promise<LoginResult>;
  passkeyLogin: (username: string) => Promise<LoginResult>;
  logout: () => void;
};

function onExpired() {
  clearToken();
  globalNavigate("/auth/login", { replace: true });
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  loading: false,
  computed: {
    get logged() {
      return !!get().user;
    },
  },
  async refreshProfile() {
    const { data: user } = (await client.get("/api/system/user/profile")) as {
      data?: UserProfile;
      error?: unknown;
    };
    if (user) set({ user });
  },
  patchUser(patch) {
    const { user } = get();
    if (user) set({ user: { ...user, ...patch } });
  },
  async init() {
    if (get().loading) return;
    set({ loading: true });
    const accessToken = getAccessToken();
    if (accessToken) {
      const { data: user, error } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (!error && user) {
        set({ user });
      } else {
        clearToken();
      }
    }
    set({ loading: false, ready: true });
  },
  async login(args) {
    const { error, data, response } = (await client.post("/api/auth/login", { body: args })) as {
      error?: unknown;
      data?: LoginResponseData;
      response?: Response;
    };
    // 密码过期：从原始 403 响应中提取 tempToken
    if (response?.status === 403) {
      try {
        const json = (await response.clone().json()) as {
          data?: { code?: string; tempToken?: string };
        };
        if (json?.data?.code === "password_expired" && json.data.tempToken) {
          return { code: "password_expired" as const, tempToken: json.data.tempToken };
        }
      } catch {
        /* ignore */
      }
      return null;
    }
    if (!error && data) {
      // MFA required — return mfaToken for second step
      if (data.mfaRequired && data.mfaToken) {
        return { code: "mfa_required" as const, mfaToken: data.mfaToken };
      }
      // Normal login success
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      const { data: user } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (user) {
        const result: UserProfile & { mfaSetupRequired?: boolean } = { ...user };
        if (data.mfaSetupRequired) {
          result.mfaSetupRequired = true;
        }
        set({ user });
        return result;
      }
    }
    return null;
  },
  async completeMFALogin(mfaToken, code) {
    const { error, data } = (await client.post("/api/auth/mfa/login", {
      body: { mfaToken, code },
    })) as {
      data?: { accessToken: string; refreshToken: string; expiresIn: number; sessionId: string };
      error?: unknown;
    };
    if (!error && data) {
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      const { data: user } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (user) {
        set({ user });
        return user;
      }
    }
    return null;
  },
  async passkeyLogin(username) {
    try {
      const { error: beginError, data: resp } = await client.post("/api/auth/passkey/login-begin", {
        body: { username },
      });
      if (beginError || !resp) return null;
      const beginData = resp as unknown as { challengeId: string; options: unknown };
      if (!beginData?.options) return null;

      const assertion = await startAuthentication({ optionsJSON: beginData.options });
      const { error: finishError, data: finishResp } = await client.post(
        "/api/auth/passkey/login-finish",
        {
          body: { challengeId: beginData.challengeId, assertion },
        },
      );
      if (finishError || !finishResp) return null;
      const finishData = finishResp as unknown as { accessToken: string; refreshToken?: string };

      setAccessToken(finishData.accessToken);
      if (finishData.refreshToken) setRefreshToken(finishData.refreshToken);
      const { data: user } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (user) {
        set({ user });
        return user;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "NotAllowedError") {
        // user cancelled browser dialog
      } else {
        console.error("[passkeyLogin] unexpected error:", e);
      }
    }
    return null;
  },
  logout() {
    client.post("/api/auth/logout");
    set({ user: null });
    onExpired();
  },
}));

import { client } from "@/api";
import { create } from "zustand";

export interface PublicConfig {
  siteName: string;
  deptEnabled: boolean;
  mfaEnabled: boolean;
  mfaForce: boolean;
  passkeyEnabled: boolean;
  passwordMinLength: number;
  passwordComplexity: "low" | "medium" | "high";
}

interface PublicConfigState {
  config: PublicConfig;
  loaded: boolean;
  fetch: () => Promise<void>;
}

const defaultConfig: PublicConfig = {
  siteName: "VentoStack",
  deptEnabled: true,
  mfaEnabled: false,
  mfaForce: false,
  passkeyEnabled: true,
  passwordMinLength: 6,
  passwordComplexity: "low",
};

export const usePublicConfig = create<PublicConfigState>((set) => ({
  config: defaultConfig,
  loaded: false,
  fetch: async () => {
    try {
      const { data, error } = (await client.get("/api/system/configs/public")) as {
        data?: Record<string, unknown>;
        error?: unknown;
      };
      if (!error && data) {
        set({
          config: {
            siteName: (data.siteName as string) ?? defaultConfig.siteName,
            deptEnabled: (data.deptEnabled as boolean) ?? defaultConfig.deptEnabled,
            mfaEnabled: (data.mfaEnabled as boolean) ?? defaultConfig.mfaEnabled,
            mfaForce: (data.mfaForce as boolean) ?? defaultConfig.mfaForce,
            passkeyEnabled: (data.passkeyEnabled as boolean) ?? defaultConfig.passkeyEnabled,
            passwordMinLength: (data.passwordMinLength as number) ?? defaultConfig.passwordMinLength,
            passwordComplexity: (data.passwordComplexity as "low" | "medium" | "high") ?? defaultConfig.passwordComplexity,
          },
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },
}));

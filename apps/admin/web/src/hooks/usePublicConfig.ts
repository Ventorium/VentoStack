import { create } from 'zustand'

export interface PublicConfig {
  siteName: string
  theme: 'light' | 'dark'
  deptEnabled: boolean
  mfaEnabled: boolean
  mfaForce: boolean
  passkeyEnabled: boolean
}

interface PublicConfigState {
  config: PublicConfig
  loaded: boolean
  fetch: () => Promise<void>
}

const defaultConfig: PublicConfig = {
  siteName: 'VentoStack',
  theme: 'light',
  deptEnabled: true,
  mfaEnabled: false,
  mfaForce: false,
  passkeyEnabled: true,
}

export const usePublicConfig = create<PublicConfigState>((set) => ({
  config: defaultConfig,
  loaded: false,
  fetch: async () => {
    try {
      const resp = await fetch('/api/system/configs/public')
      const data = await resp.json()
      if (data?.data) {
        set({
          config: {
            siteName: data.data.siteName ?? defaultConfig.siteName,
            theme: data.data.theme ?? defaultConfig.theme,
            deptEnabled: data.data.deptEnabled ?? defaultConfig.deptEnabled,
            mfaEnabled: data.data.mfaEnabled ?? defaultConfig.mfaEnabled,
            mfaForce: data.data.mfaForce ?? defaultConfig.mfaForce,
            passkeyEnabled: data.data.passkeyEnabled ?? defaultConfig.passkeyEnabled,
          },
          loaded: true,
        })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },
}))

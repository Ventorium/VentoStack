// @aeron/auth - OAuth2/OIDC 客户端
// state 参数防 CSRF，exchangeCode 用 POST 换取 token

export interface OAuthProvider {
  name: string;
  authorizationURL: string;
  tokenURL: string;
  userInfoURL?: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectURL: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
  idToken?: string;
}

export interface OAuthUserInfo {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  raw: Record<string, unknown>;
}

export interface OAuthManager {
  getAuthorizationURL(provider: OAuthProvider, state: string): string;
  exchangeCode(
    provider: OAuthProvider,
    code: string,
  ): Promise<OAuthTokenResponse>;
  getUserInfo(
    provider: OAuthProvider,
    accessToken: string,
  ): Promise<OAuthUserInfo>;
  github(config: {
    clientId: string;
    clientSecret: string;
    redirectURL: string;
  }): OAuthProvider;
  google(config: {
    clientId: string;
    clientSecret: string;
    redirectURL: string;
  }): OAuthProvider;
}

export function createOAuth(): OAuthManager {
  return {
    getAuthorizationURL(provider: OAuthProvider, state: string): string {
      const url = new URL(provider.authorizationURL);
      url.searchParams.set("client_id", provider.clientId);
      url.searchParams.set("redirect_uri", provider.redirectURL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      if (provider.scopes.length > 0) {
        url.searchParams.set("scope", provider.scopes.join(" "));
      }
      return url.toString();
    },

    async exchangeCode(
      provider: OAuthProvider,
      code: string,
    ): Promise<OAuthTokenResponse> {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: provider.redirectURL,
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
      });

      const response = await fetch(provider.tokenURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(
          `OAuth token exchange failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as Record<string, unknown>;

      return {
        accessToken: data.access_token as string,
        tokenType: (data.token_type as string) ?? "bearer",
        expiresIn: data.expires_in as number | undefined,
        refreshToken: data.refresh_token as string | undefined,
        scope: data.scope as string | undefined,
        idToken: data.id_token as string | undefined,
      };
    },

    async getUserInfo(
      provider: OAuthProvider,
      accessToken: string,
    ): Promise<OAuthUserInfo> {
      if (!provider.userInfoURL) {
        throw new Error(
          `Provider ${provider.name} does not have a userInfoURL configured`,
        );
      }

      const response = await fetch(provider.userInfoURL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `OAuth user info request failed: ${response.status} ${response.statusText}`,
        );
      }

      const raw = (await response.json()) as Record<string, unknown>;

      return {
        id: String(raw.id ?? raw.sub ?? ""),
        email: raw.email as string | undefined,
        name: (raw.name ?? raw.login) as string | undefined,
        avatar: (raw.avatar_url ?? raw.picture) as string | undefined,
        raw,
      };
    },

    github(config) {
      return {
        name: "github",
        authorizationURL: "https://github.com/login/oauth/authorize",
        tokenURL: "https://github.com/login/oauth/access_token",
        userInfoURL: "https://api.github.com/user",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: ["read:user", "user:email"],
        redirectURL: config.redirectURL,
      };
    },

    google(config) {
      return {
        name: "google",
        authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenURL: "https://oauth2.googleapis.com/token",
        userInfoURL: "https://www.googleapis.com/oauth2/v3/userinfo",
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: ["openid", "email", "profile"],
        redirectURL: config.redirectURL,
      };
    },
  };
}

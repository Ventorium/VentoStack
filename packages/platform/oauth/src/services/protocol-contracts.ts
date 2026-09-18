export interface OAuthClientRow {
  id: string;
  client_id: string;
  client_secret_digest: string;
  name: string;
  identifier: string;
  redirect_uri: string;
  allowed_scopes: string;
  offline_access_enabled: boolean;
  enabled: boolean;
  status: string;
}

export interface AuthorizationInput {
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export interface AuthorizationResult {
  kind: 'login' | 'redirect';
  location: string;
  setCookie?: string;
  applicationId?: string;
}

export interface TokenResult {
  token_type: 'Bearer';
  access_token: string;
  expires_in: number;
  scope: string;
  id_token: string;
  refresh_token?: string;
}

export interface SsoSessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  backend_session_id: string;
  auth_time: Date;
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
}

export interface AuthorizationCodeRow {
  id: string;
  tenant_id: string;
  user_id: string;
  application_id: string;
  redirect_uri: string;
  scope: string;
  nonce: string;
  code_challenge: string;
  session_id: string;
  auth_time: Date;
  backend_session_id: string;
}

export interface RefreshTokenRow {
  id: string;
  family_id: string;
  tenant_id: string;
  user_id: string;
  application_id: string;
  session_id: string;
  scope: string;
  sid: string;
  auth_time: Date;
  backend_session_id: string;
}

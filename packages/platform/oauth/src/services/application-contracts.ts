import { VentoStackError } from '@ventostack/core';

export interface OAuthApplication {
  id: string;
  identifier: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  homepageUrl: string;
  redirectUri: string;
  postLogoutRedirectUri: string | null;
  backchannelLogoutUri: string | null;
  backchannelLogoutSessionRequired: boolean;
  clientId: string;
  allowedScopes: string[];
  offlineAccessEnabled: boolean;
  enabled: boolean;
  sort: number;
  status: 'ACTIVE' | 'DISABLED' | 'DELETING' | 'DELETED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationParams {
  identifier: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  homepageUrl: string;
  redirectUri: string;
  postLogoutRedirectUri?: string | null;
  backchannelLogoutUri?: string | null;
  backchannelLogoutSessionRequired?: boolean;
  allowedScopes: string[];
  offlineAccessEnabled?: boolean;
  enabled?: boolean;
  sort?: number;
}

export type UpdateApplicationParams = Omit<Partial<CreateApplicationParams>, 'identifier'>;

export interface ApplicationRow {
  id: string;
  identifier: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  icon_storage_path: string | null;
  icon_mime_type: string | null;
  homepage_url: string;
  redirect_uri: string;
  post_logout_redirect_uri: string | null;
  backchannel_logout_uri: string | null;
  backchannel_logout_session_required: boolean;
  client_id: string;
  client_secret_version: number;
  allowed_scopes: string;
  offline_access_enabled: boolean;
  enabled: boolean;
  sort: number;
  status: OAuthApplication['status'];
  created_at: Date;
  updated_at: Date;
}

export class OAuthApplicationError extends VentoStackError {
  constructor(message: string, status = 400, code = 'OAUTH_APPLICATION_INVALID') {
    super(message, status, code);
    this.name = 'OAuthApplicationError';
  }
}

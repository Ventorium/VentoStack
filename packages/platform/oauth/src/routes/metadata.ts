import { createRouter } from '@ventostack/core';
import type { Router } from '@ventostack/core';
import { sha256 } from '../services/protocol-utils';
import type { OAuthTokenSigner } from '../services/token-signer';

export function createOAuthMetadataRoutes(deps: {
  signer: OAuthTokenSigner;
  issuer: string;
}): Router {
  const router = createRouter();
  const issuer = deps.issuer.replace(/\/$/, '');
  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    userinfo_endpoint: `${issuer}/userinfo`,
    revocation_endpoint: `${issuer}/revoke`,
    introspection_endpoint: `${issuer}/introspect`,
    end_session_endpoint: `${issuer}/logout`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['client_secret_basic'],
    introspection_endpoint_auth_methods_supported: ['client_secret_basic'],
    scopes_supported: [
      'openid',
      'profile',
      'offline_access',
      'context',
      'roles.read',
      'departments.read',
      'permissions.read',
      'menus.read',
    ],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    backchannel_logout_supported: true,
    backchannel_logout_session_supported: true,
  };
  const response = () =>
    Response.json(metadata, { headers: { 'Cache-Control': 'public, max-age=300' } });
  router.get('/api/oauth/.well-known/openid-configuration', {}, response);
  router.get('/.well-known/oauth-authorization-server/api/oauth', {}, response);
  router.get('/api/oauth/jwks', {}, async (ctx) => {
    const body = JSON.stringify({ keys: await deps.signer.jwks() });
    const etag = `"${await sha256(body)}"`;
    const headers = { ETag: etag, 'Cache-Control': 'public, max-age=300' };
    if (ctx.request.headers.get('If-None-Match') === etag)
      return new Response(null, { status: 304, headers });
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
  });
  return router;
}

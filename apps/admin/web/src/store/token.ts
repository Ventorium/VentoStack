let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  return null;
}

export function setRefreshToken(_token: string): void {
  // Refresh tokens are stored in HttpOnly cookies by the backend.
}

export function clearToken(): void {
  accessToken = null;
}

export interface IJwtPayload {
  sub: string; // User ID
  email: string;
  iat?: number;
  exp?: number;
}

export interface IRefreshTokenPayload {
  sub: string; // User ID
  tokenId: string; // Unique token identifier for revocation
  iat?: number;
  exp?: number;
}

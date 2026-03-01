export const AuthProviders = {
  LOCAL:  'LOCAL',
  GOOGLE: 'GOOGLE',
} as const;

export type AuthProvider = typeof AuthProviders[keyof typeof AuthProviders];

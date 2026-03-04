import type { AuthProvider } from '../constants/auth-providers.js';

export const AUTH_PROVIDER_LABELS: Record<AuthProvider, string> = {
  LOCAL:  'Email e password',
  GOOGLE: 'Google',
};

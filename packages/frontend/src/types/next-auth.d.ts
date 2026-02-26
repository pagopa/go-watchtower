import 'next-auth'
import { type DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      roleName: string
      accessToken: string
      refreshToken: string
    } & DefaultSession['user']
    /** Set to true when the refresh token has expired and the session is cleared */
    expired?: boolean
  }

  interface User {
    id: string
    email: string
    name: string
    roleName: string
    accessToken: string
    refreshToken: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    email: string
    name: string
    roleName: string
    accessToken: string
    refreshToken: string
    accessTokenExpires: number
  }
}

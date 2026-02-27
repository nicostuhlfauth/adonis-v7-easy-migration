// @ts-nocheck — fixture file simulating a real v6 project; @adonisjs packages are not installed in this tool's node_modules
import env from '#start/env'
import { defineConfig } from '@adonisjs/core/app'

export const appKey = env.get('APP_KEY')

export default defineConfig({
  http: {
    generateRequestId: true,
    allowMethodSpoofing: false,
    useAsyncLocalStorage: false,
    cookie: {
      domain: '',
      path: '/',
      maxAge: '2h',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    },
  },
})

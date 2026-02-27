// @ts-nocheck — fixture file simulating a real v6 project; @adonisjs packages are not installed in this tool's node_modules
import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  */
  commands: [() => import('@adonisjs/core/commands')],

  /*
  |--------------------------------------------------------------------------
  | Service Providers
  |--------------------------------------------------------------------------
  */
  providers: [() => import('@adonisjs/core/providers/app_provider')],

  /*
  |--------------------------------------------------------------------------
  | Assembler hooks
  |--------------------------------------------------------------------------
  */
  assetsBundler: false,

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  */
  tests: {
    suites: [
      {
        name: 'functional',
        files: ['tests/**/*.spec(.ts|.js)'],
        timeout: 30000,
      },
    ],
  },
})

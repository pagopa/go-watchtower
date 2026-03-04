/**
 * Local development runner — NOT included in the Lambda build.
 *
 * Usage:
 *   pnpm --filter @go-watchtower/slack-ingestor dev
 *
 * Requires a .env file in packages/slack-ingestor/ (see .env.example).
 * Requires @go-watchtower/shared and @go-watchtower/database to be built first.
 */

import { handler } from './handler.js'

const isVerbose = process.env['VERBOSE'] === '1' || process.env['DEBUG'] === '1'

console.log('[run-local] Starting slack-ingestor...')
console.log(`[run-local] NODE_ENV=${process.env['NODE_ENV'] ?? 'development'}`)
console.log(`[run-local] DATABASE_URL=${process.env['DATABASE_URL'] ? '✓ set' : '✗ NOT SET'}`)
console.log(`[run-local] SLACK_BOT_TOKEN=${process.env['SLACK_BOT_TOKEN'] ? '✓ set' : '✗ NOT SET'}`)
console.log(`[run-local] VERBOSE=${isVerbose ? '✓ on' : 'off'}`)
console.log('')

const start = Date.now()

handler()
  .then(() => {
    console.log(`\n[run-local] Completed in ${Date.now() - start}ms`)
    process.exit(0)
  })
  .catch((err: unknown) => {
    console.error('\n[run-local] Fatal error:', err)
    process.exit(1)
  })

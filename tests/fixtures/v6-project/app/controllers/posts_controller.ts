// @ts-nocheck — fixture file simulating a real v6 project; @adonisjs packages are not installed in this tool's node_modules
import type { HttpContext } from '@adonisjs/core/http'
import { Request, Response } from '@adonisjs/core/http'
import router from '@adonisjs/core/services/router'
import { getDirname, slash, joinToURL } from '@adonisjs/core/helpers'

export default class PostsController {
  async index({ request, response }: HttpContext) {
    const url = router.makeUrl('posts.show', { id: 1 })
    const dir = getDirname()
    const slashed = slash('/foo/bar')
    const joined = joinToURL('https://example.com', '/api/v1')

    return response.json({ url, dir, slashed, joined })
  }

  async show({ params, response }: HttpContext) {
    return response.json({ id: params.id })
  }
}

Request.macro('isJson', function (this: Request) {
  return this.header('content-type')?.includes('application/json') ?? false
})

declare module '@adonisjs/core/http' {
  interface Request {
    isJson(): boolean
  }
}

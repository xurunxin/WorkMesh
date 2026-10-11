import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'

// Keep the path fixed and return the signed bytes without text conversion.
const skillAsset = new URL('../assets/skills/workmesh-1.1.0.md', import.meta.url)

export function registerSkillDownloadRoute(app: FastifyInstance): void {
  app.get('/skills/workmesh-1.1.0.md', async (_request, reply) => {
    const bytes = await readFile(skillAsset)
    return reply.header('content-type', 'text/markdown; charset=utf-8')
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=3600')
      .send(bytes)
  })
}

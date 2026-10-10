import type { FastifyInstance } from 'fastify'
import prisma from '../db.js'

export default async function migrationRoutes(app: FastifyInstance) {
  app.get('/export', async () => {
    const [categories, tags, timeEntries, todos, goals, memos] = await Promise.all([
      prisma.category.findMany(),
      prisma.tag.findMany(),
      prisma.timeEntry.findMany(),
      prisma.todo.findMany(),
      prisma.goal.findMany(),
      prisma.memo.findMany({ include: { attachments: true } }),
    ])

    return { version: 1, exportedAt: new Date().toISOString(), categories, tags, timeEntries, todos, goals, memos }
  })
}

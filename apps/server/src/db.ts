import { PrismaClient } from '@prisma/client'
import { join } from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { DATA_DIR } from './config.js'

// 屏蔽 Prisma 联网引擎检查，完全启用本地离线引擎
process.env.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = '1'
// Prisma WASM schema engine 在无 RUST_LOG（或依赖调用者 shell 状态）时，Windows 下偶发 Schema engine error。
// 这里固定一个稳定值，使启动与测试行为不随外部环境漂移。
process.env.RUST_LOG ??= 'info'

const legacyDatabasePath = join(DATA_DIR, 'tagtime.db')
const currentDatabasePath = join(DATA_DIR, 'ittime.db')
if (!existsSync(currentDatabasePath) && existsSync(legacyDatabasePath)) {
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${legacyDatabasePath}${suffix}`
    if (existsSync(source)) renameSync(source, `${currentDatabasePath}${suffix}`)
  }
}

// Prisma 会把相对 SQLite URL 相对于 schema.prisma（apps/server/src）解析，
// 这会把正式库误放到 apps/server/src/data，并可能与冒烟测试共用同一份库。
// 运行时统一将默认库和旧的 ./data/ittime.db 写法落到 DATA_DIR 下。
const defaultDatabaseUrl = `file:${join(DATA_DIR, 'ittime.db').replace(/\\/g, '/')}`
const configuredDatabaseUrlRaw = process.env.DATABASE_URL?.trim().replace(/^"(.*)"$/, '$1')
const configuredDatabaseUrl = configuredDatabaseUrlRaw?.replace(/\\/g, '/') === `file:${legacyDatabasePath.replace(/\\/g, '/')}`
  ? defaultDatabaseUrl
  : configuredDatabaseUrlRaw
if (!configuredDatabaseUrl) {
  process.env.DATABASE_URL = defaultDatabaseUrl
} else if (/^file:(?:\.?[\\/]?)data[\\/]ittime\.db$/i.test(configuredDatabaseUrl)) {
  process.env.DATABASE_URL = defaultDatabaseUrl
} else {
  process.env.DATABASE_URL = configuredDatabaseUrl
}

const prisma = new PrismaClient()

export default prisma

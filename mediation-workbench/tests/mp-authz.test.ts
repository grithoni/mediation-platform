import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getDb, resetDb } from '../server/database'
import { users, cases, tenants } from '../server/database/schema'
import { runMigrations } from '../server/database/migrate'
const { canAccessMpCase, resolveAuthorizedMpCases } = await import('../server/mp/authz')

function withTempDb(fn: (ctx: { db: ReturnType<typeof getDb>; dir: string }) => void | Promise<void>) {
  const previousCwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'mp-authz-test-'))
  process.chdir(dir)
  resetDb()
  const db = getDb()
  runMigrations(db.$client)

  return Promise.resolve(fn({ db, dir })).finally(() => {
    resetDb()
    process.chdir(previousCwd)
    rmSync(dir, { recursive: true, force: true })
  })
}

function seedTenant(db: ReturnType<typeof getDb>) {
  db.insert(tenants).values({
    id: 'tenant-default',
    name: '默认租户',
    slug: 'default',
    createdAt: 1,
    updatedAt: 1,
  }).run()
}

test('mp authz limits linked wx users to their own cases', () => {
  return withTempDb(({ db }) => {
    seedTenant(db)

    db.insert(users).values([
      {
        id: 'user-a',
        tenantId: 'tenant-default',
        role: 'claimant',
        name: '甲',
        username: 'party-a',
        wxOpenId: 'wx-open-a',
      },
      {
        id: 'user-b',
        tenantId: 'tenant-default',
        role: 'respondent',
        name: '乙',
        username: 'party-b',
        wxOpenId: 'wx-open-b',
      },
    ]).run()

    db.insert(cases).values([
      {
        id: '2026-1',
        tenantId: 'tenant-default',
        title: 'A 案',
        partyAName: '甲',
        partyBName: '乙',
        partyAUserId: 'user-a',
        accessCode: '123',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: '2026-2',
        tenantId: 'tenant-default',
        title: 'B 案',
        partyAName: '丙',
        partyBName: '丁',
        partyBUserId: 'user-a',
        accessCode: '123',
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: '2026-3',
        tenantId: 'tenant-default',
        title: 'C 案',
        partyAName: '戊',
        partyBName: '己',
        partyAUserId: 'user-b',
        accessCode: '123',
        createdAt: 3,
        updatedAt: 3,
      },
    ]).run()

    assert.deepEqual(resolveAuthorizedMpCases({ openid: 'wx-open-a' }), ['2026-1', '2026-2'])
    assert.equal(canAccessMpCase({ openid: 'wx-open-a' }, '2026-1'), true)
    assert.equal(canAccessMpCase({ openid: 'wx-open-a' }, '2026-3'), false)
    assert.deepEqual(resolveAuthorizedMpCases({ openid: 'wx-missing' }), [])
  })
})

test('mp authz keeps demo users scoped to the single bound case', () => {
  return withTempDb(({ db }) => {
    seedTenant(db)
    assert.deepEqual(resolveAuthorizedMpCases({ openid: 'demo_2026-9' }), ['2026-9'])
    assert.equal(canAccessMpCase({ openid: 'demo_2026-9' }, '2026-9'), true)
    assert.equal(canAccessMpCase({ openid: 'demo_2026-9' }, '2026-10'), false)
  })
})

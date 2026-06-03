import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDb } from './index'
import { mediators, cases } from './schema'

export async function seed() {
  const db = getDb()

  // Check if already seeded
  const existing = db.select().from(mediators).all()
  if (existing.length > 0) {
    console.log('Database already seeded, skipping.')
    return
  }

  // Create default admin mediator
  const adminId = uuid()
  const passwordHash = await bcrypt.hash('123', 10)

  db.insert(mediators).values({
    id: adminId,
    name: '管理员',
    username: 'guanliyuan',
    email: 'admin@mediation.com',
    passwordHash,
    role: 'admin',
  }).run()

  // Create a test mediator
  const mediatorId = uuid()
  const mediatorHash = await bcrypt.hash('123', 10)

  db.insert(mediators).values({
    id: mediatorId,
    name: '张调解员',
    username: 'zhangtiaojieyuan',
    email: 'mediator@mediation.com',
    passwordHash: mediatorHash,
    role: 'mediator',
  }).run()

  // Create sample cases
  const sampleCases = [
    {
      id: 'CM-2025-0001',
      title: '合同纠纷调解',
      description: '甲乙双方因供货合同条款理解不一致产生争议，涉及货款金额约50万元。',
      partyAName: '甲公司',
      partyBName: '乙公司',
      accessCode: 'ACC001',
      mediatorId,
      status: 'active' as const,
    },
    {
      id: 'CM-2025-0002',
      title: '股权转让纠纷',
      description: '股东之间因股权转让价格和支付方式未能达成一致意见。',
      partyAName: '张先生',
      partyBName: '李先生',
      accessCode: 'ACC002',
      mediatorId,
      status: 'pending' as const,
    },
    {
      id: 'CM-2025-0003',
      title: '知识产权授权争议',
      description: '专利授权使用费及授权范围方面的分歧。',
      partyAName: '科技公司A',
      partyBName: '科技公司B',
      accessCode: 'ACC003',
      status: 'pending' as const,
    },
  ]

  for (const c of sampleCases) {
    db.insert(cases).values(c).run()
  }

  console.log('Seed data created successfully!')
  console.log('Admin login: guanliyuan / 123')
  console.log('Mediator login: zhangtiaojieyuan / 123')
}

// Run directly
seed().catch(console.error)

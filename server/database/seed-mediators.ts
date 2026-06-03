import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDb } from './index'
import { mediators } from './schema'
import { eq } from 'drizzle-orm'

const CATEGORY_TYPES = {
  passExam: '通过国家统一法律职业资格考试取得法律职业资格，从事调解工作满3年的',
  lawyerArbitrationNotary: '从事律师/仲裁/公证工作满3年的',
  judgeProcurator: '曾任法官/检察官满3年的',
  professionalKnowledge: '具有法律、经济、科学技术等相关专业知识，从事法律、经济贸易等专业工作，并具有中级以上职称或者具有同等专业水平的',
  beforeRegulation: '《商事调解条例》施行前已从事商事调解工作满3年，并具有大学本科以上学历的',
  publicOfficial: '公职人员兼任商事调解员的',
}

async function seedMediators() {
  const db = getDb()

  const mediatorData = [
    {
      name: '林婉清',
      username: 'linwanqing',
      password: '123',
      birthDate: '1982年3月',
      gender: '女',
      nativePlace: '广东省广州市',
      ethnicity: '汉族',
      politicalStatus: '中共党员',
      idNumber: '440106198203184562',
      phone: '13688887654',
      education: '本科',
      degree: '学士',
      university: '中山大学',
      major: '国际经济与贸易',
      specialties: ['贸易', '投资', '金融'],
      hasForeignCapability: true,
      foreignLanguages: '英语、法语',
      foreignLanguageLevel: '英语专业八级、法语B2',
      appointmentType: '兼职',
      organization: '广州某国际贸易有限公司',
      position: '法务总监',
      categoryTypes: [CATEGORY_TYPES.passExam],
      learningAndWorkExperience:
        '2000年9月至2004年6月，在中山大学国际经济与贸易专业学习，获经济学学士学位。' +
        '2004年7月至2012年8月，在广州某外贸公司任业务经理；' +
        '2012年9月至2018年12月，在某跨国企业中国区任法务主管；' +
        '2019年1月至今，在广州某国际贸易有限公司任法务总监，兼任商事调解员。',
    },
    {
      name: '赵明远',
      username: 'zhaomingyuan',
      password: '123',
      birthDate: '1970年11月',
      gender: '男',
      nativePlace: '北京市',
      ethnicity: '满族',
      politicalStatus: '民建会员',
      idNumber: '110105197011251234',
      phone: '13801234567',
      education: '博士研究生',
      degree: '博士',
      university: '北京大学',
      major: '金融学',
      specialties: ['运输', '知识产权'],
      hasForeignCapability: false,
      foreignLanguages: '英语',
      foreignLanguageLevel: 'IELTS 7.5',
      appointmentType: '专职',
      organization: '',
      position: '',
      categoryTypes: [CATEGORY_TYPES.lawyerArbitrationNotary],
      learningAndWorkExperience:
        '1988年9月至1992年6月，在北京大学经济学专业学习，获经济学学士学位；' +
        '1992年9月至1995年6月，在北京大学金融学专业学习，获经济学硕士学位；' +
        '2001年9月至2005年6月，在北京大学金融学专业学习，获经济学博士学位。' +
        '1995年7月至2001年8月，在某国有银行总行任高级经理；' +
        '2005年7月至2015年12月，在某仲裁委员会任仲裁员；' +
        '2016年1月至今，从事专职商事调解工作。',
    },
    {
      name: '陈建国',
      username: 'chenjianguo',
      password: '123',
      birthDate: '1975年6月',
      gender: '男',
      nativePlace: '湖北省武汉市',
      ethnicity: '汉族',
      politicalStatus: '中共党员',
      idNumber: '420102197506152873',
      phone: '13908765432',
      education: '研究生',
      degree: '硕士',
      university: '武汉大学',
      major: '法学',
      specialties: ['贸易', '投资', '金融', '房地产'],
      hasForeignCapability: true,
      foreignLanguages: '英语',
      foreignLanguageLevel: 'CET-6',
      appointmentType: '专职',
      organization: '',
      position: '',
      categoryTypes: [CATEGORY_TYPES.lawyerArbitrationNotary],
      learningAndWorkExperience:
        '1993年9月至1997年6月，在武汉大学法学专业学习，获法学学士学位；' +
        '1997年9月至2000年6月，在武汉大学国际经济法专业学习，获法学硕士学位。' +
        '2000年7月至2010年12月，在湖北省某中级人民法院任法官；' +
        '2011年1月至2020年6月，在某律师事务所任合伙人律师；' +
        '2020年7月至今，从事商事调解工作。',
    },
  ]

  let imported = 0
  for (const data of mediatorData) {
    const existing = db.select().from(mediators).where(eq(mediators.username, data.username)).all()
    if (existing.length > 0) {
      console.log(`⏭ ${data.name} (${data.username}) already exists, skipping.`)
      continue
    }

    const passwordHash = await bcrypt.hash(data.password, 10)
    db.insert(mediators)
      .values({
        id: uuid(),
        name: data.name,
        username: data.username,
        passwordHash,
        role: 'mediator',
        birthDate: data.birthDate,
        gender: data.gender,
        nativePlace: data.nativePlace,
        ethnicity: data.ethnicity,
        politicalStatus: data.politicalStatus,
        idNumber: data.idNumber,
        phone: data.phone,
        education: data.education,
        degree: data.degree,
        university: data.university,
        major: data.major,
        specialties: JSON.stringify(data.specialties),
        hasForeignCapability: data.hasForeignCapability,
        foreignLanguages: data.foreignLanguages,
        foreignLanguageLevel: data.foreignLanguageLevel,
        appointmentType: data.appointmentType,
        organization: data.organization || null,
        position: data.position || null,
        categoryTypes: JSON.stringify(data.categoryTypes),
        learningAndWorkExperience: data.learningAndWorkExperience,
      })
      .run()

    console.log(`✓ ${data.name} imported (用户名: ${data.username})`)
    imported++
  }

  console.log(`\nDone! ${imported} mediators imported.`)
  console.log('Default password for all: 123')
}

seedMediators().catch(console.error)

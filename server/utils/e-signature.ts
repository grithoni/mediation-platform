/**
 * 电子签署服务
 * 支持法大大、上上签等电子签署平台
 */

export interface ESignConfig {
  platform: 'fadada' | 'signyun'
  apiKey: string
  apiSecret: string
  baseUrl?: string
}

export interface SignTask {
  taskId: string
  documentUrl: string
  signers: Array<{
    name: string
    phone: string
    idNumber?: string
    signPosition: { x: number; y: number; page: number }
  }>
  callbackUrl?: string
  expiresAt?: Date
}

export interface SignResult {
  success: boolean
  taskId?: string
  signUrl?: string
  error?: string
}

/**
 * 法大大 API 客户端
 */
class FadadaClient {
  private apiKey: string
  private apiSecret: string
  private baseUrl: string

  constructor(config: ESignConfig) {
    this.apiKey = config.apiKey
    this.apiSecret = config.apiSecret
    this.baseUrl = config.baseUrl || 'https://openapi.fadada.com'
  }

  /**
   * 创建签署任务
   */
  async createSignTask(task: SignTask): Promise<SignResult> {
    try {
      // 实际实现需要调用法大大 API
      // 这里是示例代码结构
      const response = await fetch(`${this.baseUrl}/api/v3/sign/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          document_url: task.documentUrl,
          signers: task.signers.map((s) => ({
            name: s.name,
            phone: s.phone,
            id_number: s.idNumber,
            sign_position: s.signPosition,
          })),
          callback_url: task.callbackUrl,
          expires_at: task.expiresAt?.toISOString(),
        }),
      })

      const data = await response.json()

      if (data.code === 0) {
        return {
          success: true,
          taskId: data.data.task_id,
          signUrl: data.data.sign_url,
        }
      }

      return {
        success: false,
        error: data.message || '创建签署任务失败',
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * 查询签署状态
   */
  async getSignStatus(taskId: string): Promise<{
    status: 'pending' | 'signing' | 'signed' | 'failed'
    signers: Array<{
      name: string
      status: string
      signedAt?: string
    }>
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v3/sign/status/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      })

      const data = await response.json()

      if (data.code === 0) {
        return {
          status: data.data.status,
          signers: data.data.signers,
        }
      }

      throw new Error(data.message || '查询签署状态失败')
    } catch (error: any) {
      throw error
    }
  }

  /**
   * 获取签署文档
   */
  async getSignedDocument(taskId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v3/sign/document/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      })

      const data = await response.json()

      if (data.code === 0) {
        return data.data.document_url
      }

      throw new Error(data.message || '获取签署文档失败')
    } catch (error: any) {
      throw error
    }
  }
}

/**
 * 上上签 API 客户端
 */
class SignYunClient {
  private apiKey: string
  private apiSecret: string
  private baseUrl: string

  constructor(config: ESignConfig) {
    this.apiKey = config.apiKey
    this.apiSecret = config.apiSecret
    this.baseUrl = config.baseUrl || 'https://openapi.signyun.com'
  }

  /**
   * 创建签署任务
   */
  async createSignTask(task: SignTask): Promise<SignResult> {
    try {
      // 实际实现需要调用上上签 API
      const response = await fetch(`${this.baseUrl}/api/v1/sign/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          document_url: task.documentUrl,
          signers: task.signers.map((s) => ({
            name: s.name,
            mobile: s.phone,
            id_card: s.idNumber,
            sign_pos: s.signPosition,
          })),
          callback_url: task.callbackUrl,
          expire_time: task.expiresAt?.toISOString(),
        }),
      })

      const data = await response.json()

      if (data.code === 200) {
        return {
          success: true,
          taskId: data.data.task_id,
          signUrl: data.data.sign_url,
        }
      }

      return {
        success: false,
        error: data.msg || '创建签署任务失败',
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * 查询签署状态
   */
  async getSignStatus(taskId: string): Promise<{
    status: 'pending' | 'signing' | 'signed' | 'failed'
    signers: Array<{
      name: string
      status: string
      signedAt?: string
    }>
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/sign/status/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      })

      const data = await response.json()

      if (data.code === 200) {
        return {
          status: data.data.status,
          signers: data.data.signers,
        }
      }

      throw new Error(data.msg || '查询签署状态失败')
    } catch (error: any) {
      throw error
    }
  }
}

/**
 * 电子签署服务工厂
 */
export function createESignService(platform: 'fadada' | 'signyun', config: ESignConfig) {
  switch (platform) {
    case 'fadada':
      return new FadadaClient(config)
    case 'signyun':
      return new SignYunClient(config)
    default:
      throw new Error(`Unsupported e-sign platform: ${platform}`)
  }
}

export { FadadaClient, SignYunClient }

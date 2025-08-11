import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

// Simple interfaces to avoid deep type instantiation
interface PaystackConfig {
  secretKey: string
  publicKey: string
  webhookSecret: string
}

interface PaymentInitData {
  email: string
  amount: number
  reference: string
  callback_url: string
  metadata: Record<string, any>
  subaccount?: string
  split_code?: string
}

interface PaystackResponse {
  status: boolean
  message: string
  data: any
}

interface SplitPaymentConfig {
  name: string
  type: 'percentage' | 'flat'
  value: number
  subaccounts: Array<{
    subaccount: string
    share: number
  }>
}

interface BankAccount {
  account_number: string
  bank_code: string
  account_name?: string
}

interface SubaccountData {
  business_name: string
  settlement_bank: string
  account_number: string
  percentage_charge: number
  description?: string
  primary_contact_email?: string
  primary_contact_name?: string
  primary_contact_phone?: string
}

// Enterprise Paystack Service
export class PaystackService {
  private config: PaystackConfig
  private baseUrl = 'https://api.paystack.co'

  constructor() {
    this.config = {
      secretKey: process.env.PAYSTACK_SECRET_KEY!,
      publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
      webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET!
    }

    if (!this.config.secretKey || !this.config.publicKey) {
      throw new Error('Paystack configuration missing')
    }
  }

  // Generate unique payment reference
  generateReference(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 15)
    return `RH_${timestamp}_${random}`
  }

  // Initialize payment with split configuration
  async initializePayment(data: PaymentInitData): Promise<PaystackResponse> {
    try {
      log.info('Initializing Paystack payment', {
        action: 'paystack_init_payment',
        metadata: {
          amount: data.amount,
          email: data.email,
          reference: data.reference,
          hasSplit: !!data.split_code
        }
      })

      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: data.email,
          amount: data.amount, // Amount in kobo
          reference: data.reference,
          callback_url: data.callback_url,
          metadata: {
            ...data.metadata,
            platform: 'RehabifyHealth',
            timestamp: Date.now()
          },
          ...(data.split_code && { split_code: data.split_code }),
          ...(data.subaccount && { subaccount: data.subaccount })
        })
      })

      const result = await response.json()

      if (!result.status) {
        throw new Error(`Paystack initialization failed: ${result.message}`)
      }

      log.info('Paystack payment initialized successfully', {
        action: 'paystack_payment_initialized',
        metadata: {
          reference: data.reference,
          authorization_url: result.data.authorization_url
        }
      })

      return result
    } catch (error) {
      log.error('Paystack payment initialization failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, {
        action: 'paystack_init_error',
        extra: { reference: data.reference, amount: data.amount }
      })
      throw error
    }
  }

  // Verify payment status
  async verifyPayment(reference: string): Promise<PaystackResponse> {
    try {
      log.info('Verifying Paystack payment', {
        action: 'paystack_verify_payment',
        metadata: { reference }
      })

      const response = await fetch(`${this.baseUrl}/transaction/verify/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      log.info('Paystack payment verification completed', {
        action: 'paystack_payment_verified',
        metadata: {
          reference,
          status: result.data?.status,
          amount: result.data?.amount
        }
      })

      return result
    } catch (error) {
      log.error('Paystack payment verification failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, {
        action: 'paystack_verify_error',
        extra: { reference }
      })
      throw error
    }
  }

  // Create subaccount for physiotherapist
  async createSubaccount(data: SubaccountData): Promise<PaystackResponse> {
    try {
      log.info('Creating Paystack subaccount', {
        action: 'paystack_create_subaccount',
        metadata: {
          business_name: data.business_name,
          account_number: data.account_number
        }
      })

      const response = await fetch(`${this.baseUrl}/subaccount`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          business_name: data.business_name,
          settlement_bank: data.settlement_bank,
          account_number: data.account_number,
          percentage_charge: data.percentage_charge,
          description: data.description || `Subaccount for ${data.business_name}`,
          primary_contact_email: data.primary_contact_email,
          primary_contact_name: data.primary_contact_name,
          primary_contact_phone: data.primary_contact_phone
        })
      })

      const result = await response.json()

      if (!result.status) {
        throw new Error(`Subaccount creation failed: ${result.message}`)
      }

      log.info('Paystack subaccount created successfully', {
        action: 'paystack_subaccount_created',
        metadata: {
          subaccount_code: result.data.subaccount_code,
          business_name: data.business_name
        }
      })

      return result
    } catch (error) {
      log.error('Paystack subaccount creation failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, {
        action: 'paystack_subaccount_error',
        extra: { business_name: data.business_name }
      })
      throw error
    }
  }

  // Create split payment configuration
  async createSplitPayment(config: SplitPaymentConfig): Promise<PaystackResponse> {
    try {
      log.info('Creating Paystack split payment', {
        action: 'paystack_create_split',
        metadata: { name: config.name, type: config.type }
      })

      const response = await fetch(`${this.baseUrl}/split`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: config.name,
          type: config.type,
          currency: 'NGN',
          subaccounts: config.subaccounts,
          bearer_type: 'subaccount',
          bearer_subaccount: config.subaccounts[0]?.subaccount
        })
      })

      const result = await response.json()

      if (!result.status) {
        throw new Error(`Split payment creation failed: ${result.message}`)
      }

      log.info('Paystack split payment created successfully', {
        action: 'paystack_split_created',
        metadata: {
          split_code: result.data.split_code,
          name: config.name
        }
      })

      return result
    } catch (error) {
      log.error('Paystack split payment creation failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, {
        action: 'paystack_split_error',
        extra: { name: config.name }
      })
      throw error
    }
  }

  // Resolve bank account details
  async resolveBankAccount(account: BankAccount): Promise<PaystackResponse> {
    try {
      log.info('Resolving bank account', {
        action: 'paystack_resolve_account',
        metadata: {
          account_number: account.account_number,
          bank_code: account.bank_code
        }
      })

      const response = await fetch(
        `${this.baseUrl}/bank/resolve?account_number=${account.account_number}&bank_code=${account.bank_code}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const result = await response.json()

      log.info('Bank account resolved', {
        action: 'paystack_account_resolved',
        metadata: {
          account_number: account.account_number,
          account_name: result.data?.account_name
        }
      })

      return result
    } catch (error) {
      log.error('Bank account resolution failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, {
        action: 'paystack_resolve_error',
        extra: { account_number: account.account_number }
      })
      throw error
    }
  }

  // Get list of banks
  async getBanks(): Promise<PaystackResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/bank`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      return result
    } catch (error) {
      log.error('Get banks failed', { error: error as Error })
      throw error
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const hash = crypto
        .createHmac('sha512', this.config.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex')

      return hash === signature
    } catch (error) {
      log.error('Webhook signature verification failed', { error: error as Error })
      return false
    }
  }

  // Calculate platform fee and physiotherapist share
  calculateSplitAmounts(totalAmount: number): {
    platformFee: number
    physiotherapistShare: number
    paystackFee: number
  } {
    const platformFee = parseInt(process.env.PLATFORM_FEE_AMOUNT || '100000') // ₦1,000 in kobo
    const paystackFee = Math.ceil(totalAmount * 0.015) + 10000 // 1.5% + ₦100
    const physiotherapistShare = totalAmount - platformFee - paystackFee

    return {
      platformFee,
      physiotherapistShare: Math.max(0, physiotherapistShare),
      paystackFee
    }
  }
}

// Export singleton instance
export const paystackService = new PaystackService()

// Export types for use in other modules
export type {
  PaystackConfig,
  PaymentInitData,
  PaystackResponse,
  SplitPaymentConfig,
  BankAccount,
  SubaccountData
}

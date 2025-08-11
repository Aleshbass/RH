// Simplified Payment Service to avoid deep type instantiation
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

// Simple payment interfaces
export interface PaymentData {
  invoiceId: string
  patientId: string
  amount: number
  currency: string
  reference: string
}

export interface PaystackInitResponse {
  status: boolean
  message: string
  data?: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

export interface BankInfo {
  account_number: string
  bank_code: string
  account_name?: string
}

// Simple Paystack service without complex types
export class SimplePaystackService {
  private secretKey: string
  private publicKey: string
  private baseUrl = 'https://api.paystack.co'

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || ''
    this.publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || ''
  }

  // Initialize payment
  async initializePayment(data: PaymentData): Promise<PaystackInitResponse> {
    try {
      log.info('Initializing payment', { action: 'payment_init', metadata: { reference: data.reference } })

      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: `patient-${data.patientId}@rehabifyhealth.com`, // Temporary email
          amount: data.amount,
          reference: data.reference,
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
          metadata: {
            invoiceId: data.invoiceId,
            patientId: data.patientId,
            platform: 'RehabifyHealth'
          }
        })
      })

      const result = await response.json()
      log.info('Payment initialized', { action: 'payment_initialized', metadata: { success: result.status } })
      return result

    } catch (error) {
      log.error('Payment initialization failed', { error: error as Error })
      ErrorTracker.captureException(error as Error, { action: 'payment_init_error' })
      throw error
    }
  }

  // Verify payment
  async verifyPayment(reference: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/transaction/verify/${reference}`, {
        headers: {
          'Authorization': `Bearer ${this.secretKey}`
        }
      })

      const result = await response.json()
      log.info('Payment verified', { action: 'payment_verified', metadata: { reference, status: result.data?.status } })
      return result

    } catch (error) {
      log.error('Payment verification failed', { error: error as Error })
      throw error
    }
  }

  // Get banks list
  async getBanks(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/bank`, {
        headers: {
          'Authorization': `Bearer ${this.secretKey}`
        }
      })

      return await response.json()
    } catch (error) {
      log.error('Failed to fetch banks', { error: error as Error })
      throw error
    }
  }

  // Resolve bank account
  async resolveBankAccount(bankInfo: BankInfo): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/bank/resolve?account_number=${bankInfo.account_number}&bank_code=${bankInfo.bank_code}`,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`
          }
        }
      )

      return await response.json()
    } catch (error) {
      log.error('Bank account resolution failed', { error: error as Error })
      throw error
    }
  }

  // Create subaccount for physiotherapist
  async createSubaccount(data: {
    business_name: string
    settlement_bank: string
    account_number: string
    percentage_charge: number
  }): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/subaccount`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      return await response.json()
    } catch (error) {
      log.error('Subaccount creation failed', { error: error as Error })
      throw error
    }
  }

  // Verify webhook (Paystack uses IP whitelisting, not signature verification)
  verifyWebhook(request: any): boolean {
    try {
      // Paystack webhook IPs (production)
      const paystackIPs = [
        '52.31.139.75',
        '52.49.173.169', 
        '52.214.14.220'
      ]
      
      // Get client IP (in production, check x-forwarded-for header)
      const clientIP = request.headers?.['x-forwarded-for']?.split(',')[0] || 
                      request.headers?.['x-real-ip'] ||
                      request.connection?.remoteAddress ||
                      '127.0.0.1'
      
      // For development, always allow localhost
      if (process.env.NODE_ENV === 'development') {
        log.info('Webhook verification (dev mode)', { clientIP } as any)
        return true
      }
      
      // In production, verify IP is from Paystack
      const isValidIP = paystackIPs.includes(clientIP)
      
      log.info('Webhook IP verification', { 
        clientIP, 
        isValid: isValidIP,
        paystackIPs 
      } as any)
      
      return isValidIP
    } catch (error) {
      log.error('Webhook verification failed', { error: error as Error })
      return false
    }
  }

  // Calculate split amounts
  calculateSplit(totalAmount: number): {
    platformFee: number
    physiotherapistShare: number
    paystackFee: number
  } {
    const platformFee = parseInt(process.env.PLATFORM_FEE_AMOUNT || '100000') // ₦1,000
    const paystackFee = Math.ceil(totalAmount * 0.015) + 10000 // 1.5% + ₦100
    const physiotherapistShare = Math.max(0, totalAmount - platformFee - paystackFee)

    return {
      platformFee,
      physiotherapistShare,
      paystackFee
    }
  }
}

// Export singleton
export const simplePaystackService = new SimplePaystackService()

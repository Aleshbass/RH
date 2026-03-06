import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

// Paystack configuration interface
interface PaystackConfig {
    secretKey: string
    publicKey: string
    webhookSecret: string
}

// Payment initialization data
interface PaystackPaymentInitData {
    email: string
    amount: number // in kobo
    reference: string
    callback_url: string
    metadata: Record<string, unknown>
    subaccount?: string
    bearer?: 'account' | 'subaccount'
    transaction_charge?: number // platform fee in kobo
    currency?: string
    channels?: string[]
}

// Paystack API response
interface PaystackResponse {
    status: boolean
    message: string
    data: any
}

// Bank account interface
interface BankAccount {
    account_number: string
    bank_code: string
    account_name?: string
}

// Subaccount creation data
interface SubaccountData {
    business_name: string
    settlement_bank: string
    account_number: string
    percentage_charge: number // Percentage for the subaccount
    description?: string
    primary_contact_email?: string
    primary_contact_name?: string
    primary_contact_phone?: string
}

/**
 * Paystack Payment Service
 * Handles all Paystack API interactions for payments, subaccounts, and bank operations
 */
export class PaystackService {
    private config: PaystackConfig
    private baseUrl = 'https://api.paystack.co'

    constructor() {
        const secretKey = process.env.PAYSTACK_SECRET_KEY || ''
        const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || ''
        const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || ''

        if (!webhookSecret) {
            console.warn('PAYSTACK_WEBHOOK_SECRET is not set. Webhook signature verification will fail securely.');
        }

        this.config = {
            secretKey,
            publicKey,
            webhookSecret
        }

        if (!this.config.secretKey || !this.config.publicKey) {
            throw new Error('Paystack configuration missing: PAYSTACK_SECRET_KEY and NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY are required')
        }
    }

    /**
     * Generate unique payment reference
     * Format: PS_RH_{timestamp}_{random}
     */
    generateReference(): string {
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 15)
        return `PS_RH_${timestamp}_${random}`
    }

    /**
     * Initialize a payment transaction
     * Returns the authorization URL for redirect
     */
    async initializePayment(data: PaystackPaymentInitData): Promise<PaystackResponse> {
        try {
            // Mask email for logs
            const maskedEmail = data.email ? `${data.email.split('@')[0].slice(0, 3)}***@${data.email.split('@')[1]}` : 'unknown';

            log.info('Initializing Paystack payment', {
                action: 'paystack_initiate',
                metadata: {
                    reference: data.reference,
                    amount: data.amount,
                    email: maskedEmail,
                    hasSubaccount: !!data.subaccount
                }
            })

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000)

            const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: data.email,
                    amount: data.amount,
                    reference: data.reference,
                    callback_url: data.callback_url,
                    subaccount: data.subaccount,
                    bearer: data.bearer,
                    transaction_charge: data.transaction_charge,
                    metadata: {
                        ...data.metadata,
                        platform: 'RehabifyHealth',
                        timestamp: Date.now()
                    },
                    currency: data.currency || 'NGN',
                    channels: data.channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json()

            if (result.status) {
                log.info('Paystack payment initialized successfully', {
                    action: 'paystack_initiate_success',
                    metadata: { reference: data.reference }
                })
            } else {
                log.warn('Paystack payment initialization failed API checks', {
                    action: 'paystack_initiate_failed',
                    metadata: { reference: data.reference, message: result.message }
                })
            }

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

    /**
     * Verify a payment transaction by reference
     */
    async verifyPayment(reference: string): Promise<PaystackResponse> {
        try {
            log.info('Verifying Paystack payment', {
                action: 'paystack_verify',
                metadata: { reference }
            })

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000)

            const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.config.secretKey}`,
                },
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json()

            log.info('Paystack verification completed', {
                action: 'paystack_verify_complete',
                metadata: { reference, status: result.status }
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

    /**
     * Create a subaccount for physiotherapist split payments
     */
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
                    description: data.description,
                    primary_contact_email: data.primary_contact_email,
                    primary_contact_name: data.primary_contact_name,
                    primary_contact_phone: data.primary_contact_phone,
                })
            })

            const result = await response.json()

            if (!result.status) {
                throw new Error(`Subaccount creation failed: ${result.message}`)
            }

            log.info('Paystack subaccount created successfully', {
                action: 'paystack_subaccount_created',
                metadata: {
                    subaccount_code: result.data?.subaccount_code,
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

    /**
     * Resolve bank account details (verify account name)
     */
    async resolveBankAccount(accountNumber: string, bankCode: string): Promise<PaystackResponse> {
        try {
            const maskedAccount = accountNumber ? `****${accountNumber.slice(-4)}` : 'unknown';

            log.info('Resolving bank account', {
                action: 'paystack_resolve_bank',
                metadata: { accountNumber: maskedAccount, bankCode }
            })

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000)

            const response = await fetch(`${this.baseUrl}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.config.secretKey}`
                },
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json()

            log.info('Bank account resolved', {
                action: 'paystack_resolve_success',
                metadata: {
                    accountNumber: maskedAccount,
                    account_name: result.data?.account_name
                }
            })

            return result
        } catch (error) {
            log.error('Bank account resolution failed', { error: error as Error })
            ErrorTracker.captureException(error as Error, {
                action: 'paystack_resolve_error',
                extra: { accountNumber }
            })
            throw error
        }
    }

    /**
     * Get list of Nigerian banks
     */
    async getBanks(country: string = 'nigeria'): Promise<PaystackResponse> {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000)

            const response = await fetch(`${this.baseUrl}/bank?country=${encodeURIComponent(country)}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.config.secretKey}`
                },
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json()
        } catch (error) {
            log.error('Get banks failed', { error: error as Error })
            throw error
        }
    }

    /**
     * Verify webhook signature
     * Paystack uses HMAC SHA512 for webhook verification
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
        try {
            if (!this.config.webhookSecret) {
                log.error('Missing Paystack webhook secret for verification', { action: 'paystack_verify_webhook_missing_secret' })
                return false
            }

            const hash = crypto.createHmac('sha512', this.config.webhookSecret)
                .update(payload)
                .digest('hex')

            const bufferHash = Buffer.from(hash, 'hex')
            const bufferSig = Buffer.from(signature, 'hex')

            if (bufferHash.length !== bufferSig.length) {
                return false
            }

            return crypto.timingSafeEqual(bufferHash, bufferSig)
        } catch (error) {
            log.error('Webhook signature verification failed', { error: error as Error })
            return false
        }
    }

    /**
     * Calculate platform fee and physiotherapist share
     * Paystack fees: 1.5% + ₦100 for local cards, capped at ₦2,000
     */
    calculateSplitAmounts(totalAmount: number): {
        platformFee: number
        physiotherapistShare: number
        paystackFee: number
    } {
        // Base platform fee configured or 100k kobo (₦1000)
        const platformFee = parseInt(process.env.PLATFORM_FEE_AMOUNT || '100000', 10) // ₦1,000 in kobo
        // Paystack fee: 1.5% + ₦100 (10000 kobo), capped at ₦2,000 (200000 kobo)
        const calculatedFee = Math.ceil(totalAmount * 0.015) + 10000
        const paystackFee = Math.min(calculatedFee, 200000)
        const physiotherapistShare = totalAmount - platformFee - paystackFee

        return {
            platformFee,
            physiotherapistShare: Math.max(0, physiotherapistShare),
            paystackFee
        }
    }

    /**
     * Get the public key for frontend inline payment
     */
    getPublicKey(): string {
        return this.config.publicKey
    }
}

// Export singleton instance
export const paystackService = new PaystackService()

// Export types for use in other modules
export type {
    PaystackConfig,
    PaystackPaymentInitData,
    PaystackResponse,
    BankAccount,
    SubaccountData
}

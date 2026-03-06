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
        this.config = {
            secretKey: process.env.PAYSTACK_SECRET_KEY!,
            publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
            webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
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
            log.info('Initializing Paystack payment', {
                action: 'paystack_init_payment',
                metadata: {
                    amount: data.amount,
                    email: data.email,
                    reference: data.reference,
                    hasSubaccount: !!data.subaccount
                }
            })

            const payload: Record<string, unknown> = {
                email: data.email,
                amount: data.amount, // Paystack uses kobo
                reference: data.reference,
                callback_url: data.callback_url,
                currency: data.currency || 'NGN',
                metadata: {
                    ...data.metadata,
                    platform: 'RehabifyHealth',
                    timestamp: Date.now()
                },
                channels: data.channels || ['card', 'bank', 'ussd', 'bank_transfer'],
            }

            // Add split payment configuration if subaccount exists
            if (data.subaccount) {
                payload.subaccount = data.subaccount
                payload.bearer = data.bearer || 'account' // Rehabify pays Paystack fees
                if (data.transaction_charge) {
                    payload.transaction_charge = data.transaction_charge // Platform fee in kobo
                }
            }

            const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })

            const result = await response.json()

            if (!result.status) {
                throw new Error(`Paystack initialization failed: ${result.message}`)
            }

            log.info('Paystack payment initialized successfully', {
                action: 'paystack_payment_initialized',
                metadata: {
                    reference: data.reference,
                    authorization_url: result.data?.authorization_url
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

    /**
     * Verify a payment transaction by reference
     */
    async verifyPayment(reference: string): Promise<PaystackResponse> {
        try {
            log.info('Verifying Paystack payment', {
                action: 'paystack_verify_payment',
                metadata: { reference }
            })

            const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
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
            log.info('Resolving bank account', {
                action: 'paystack_resolve_account',
                metadata: { accountNumber, bankCode }
            })

            const response = await fetch(
                `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
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
                    accountNumber,
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
            const response = await fetch(`${this.baseUrl}/bank?country=${country}`, {
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

    /**
     * Verify webhook signature
     * Paystack uses HMAC SHA512 for webhook verification
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
        try {
            const hash = crypto
                .createHmac('sha512', this.config.secretKey)
                .update(payload)
                .digest('hex')

            return hash === signature
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
        const platformFee = parseInt(process.env.PLATFORM_FEE_AMOUNT || '100000') // ₦1,000 in kobo
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

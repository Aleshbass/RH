/**
 * @deprecated — Payment processing has been migrated to Paystack.
 * See: lib/payments/paystack.ts
 * This file is kept for reference only. All new payment code should use PaystackService.
 */
import crypto from 'crypto'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

// Flutterwave configuration interface
interface FlutterwaveConfig {
    secretKey: string
    publicKey: string
    encryptionKey: string
    webhookSecret: string
}

// Payment initialization data
interface PaymentInitData {
    email: string
    amount: number
    tx_ref: string
    redirect_url: string
    meta: Record<string, unknown>
    subaccounts?: Array<{
        id: string
        transaction_charge_type: 'flat' | 'percentage'
        transaction_charge: number
    }>
    currency?: string
    customer?: {
        email: string
        name?: string
        phonenumber?: string
    }
}

// Flutterwave API response
interface FlutterwaveResponse {
    status: string
    message: string
    data: unknown
}

// Bank account interface
interface BankAccount {
    account_number: string
    account_bank: string
    account_name?: string
}

// Subaccount creation data
interface SubaccountData {
    business_name: string
    account_bank: string
    account_number: string
    split_value: number // Percentage for the subaccount
    split_type: 'percentage' | 'flat'
    business_email?: string
    business_contact?: string
    business_contact_mobile?: string
    business_mobile?: string
    country?: string
}

/**
 * Flutterwave Payment Service
 * Handles all Flutterwave API interactions for payments, subaccounts, and bank operations
 */
export class FlutterwaveService {
    private config: FlutterwaveConfig
    private baseUrl = 'https://api.flutterwave.com/v3'

    constructor() {
        this.config = {
            secretKey: process.env.FLUTTERWAVE_SECRET_KEY!,
            publicKey: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
            encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY!,
            webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET!
        }

        if (!this.config.secretKey || !this.config.publicKey) {
            throw new Error('Flutterwave configuration missing: FLUTTERWAVE_SECRET_KEY and NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY are required')
        }
    }

    /**
     * Generate unique payment reference
     * Format: FLW_RH_{timestamp}_{random}
     */
    generateReference(): string {
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 15)
        return `FLW_RH_${timestamp}_${random}`
    }

    /**
     * Initialize a payment transaction
     * Returns the payment link for redirect
     */
    async initializePayment(data: PaymentInitData): Promise<FlutterwaveResponse> {
        try {
            log.info('Initializing Flutterwave payment', {
                action: 'flutterwave_init_payment',
                metadata: {
                    amount: data.amount,
                    email: data.email,
                    tx_ref: data.tx_ref,
                    hasSubaccounts: !!data.subaccounts?.length
                }
            })

            const payload: Record<string, unknown> = {
                tx_ref: data.tx_ref,
                amount: data.amount,
                currency: data.currency || 'NGN',
                redirect_url: data.redirect_url,
                customer: data.customer || {
                    email: data.email
                },
                meta: {
                    ...data.meta,
                    platform: 'RehabifyHealth',
                    timestamp: Date.now()
                },
                customizations: {
                    title: 'Physio Around Me',
                    logo: 'https://physioaroundme.com/logo.png'
                }
            }

            // Add subaccounts for split payments
            if (data.subaccounts && data.subaccounts.length > 0) {
                payload.subaccounts = data.subaccounts
            }

            const response = await fetch(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })

            const result = await response.json()

            if (result.status !== 'success') {
                throw new Error(`Flutterwave initialization failed: ${result.message}`)
            }

            log.info('Flutterwave payment initialized successfully', {
                action: 'flutterwave_payment_initialized',
                metadata: {
                    tx_ref: data.tx_ref,
                    link: result.data?.link
                }
            })

            return result
        } catch (error) {
            log.error('Flutterwave payment initialization failed', { error: error as Error })
            ErrorTracker.captureException(error as Error, {
                action: 'flutterwave_init_error',
                extra: { tx_ref: data.tx_ref, amount: data.amount }
            })
            throw error
        }
    }

    /**
     * Verify a payment transaction by ID
     */
    async verifyPayment(transactionId: string | number): Promise<FlutterwaveResponse> {
        try {
            log.info('Verifying Flutterwave payment', {
                action: 'flutterwave_verify_payment',
                metadata: { transactionId }
            })

            const response = await fetch(`${this.baseUrl}/transactions/${transactionId}/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                }
            })

            const result = await response.json()

            log.info('Flutterwave payment verification completed', {
                action: 'flutterwave_payment_verified',
                metadata: {
                    transactionId,
                    status: result.data?.status,
                    amount: result.data?.amount
                }
            })

            return result
        } catch (error) {
            log.error('Flutterwave payment verification failed', { error: error as Error })
            ErrorTracker.captureException(error as Error, {
                action: 'flutterwave_verify_error',
                extra: { transactionId }
            })
            throw error
        }
    }

    /**
     * Verify a payment by tx_ref (reference)
     */
    async verifyPaymentByReference(tx_ref: string): Promise<FlutterwaveResponse> {
        try {
            log.info('Verifying Flutterwave payment by reference', {
                action: 'flutterwave_verify_by_ref',
                metadata: { tx_ref }
            })

            const response = await fetch(`${this.baseUrl}/transactions/verify_by_reference?tx_ref=${tx_ref}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                }
            })

            const result = await response.json()

            log.info('Flutterwave payment verification by reference completed', {
                action: 'flutterwave_ref_verified',
                metadata: {
                    tx_ref,
                    status: result.data?.status,
                    amount: result.data?.amount
                }
            })

            return result
        } catch (error) {
            log.error('Flutterwave payment verification by reference failed', { error: error as Error })
            ErrorTracker.captureException(error as Error, {
                action: 'flutterwave_verify_ref_error',
                extra: { tx_ref }
            })
            throw error
        }
    }

    /**
     * Create a subaccount for physiotherapist split payments
     */
    async createSubaccount(data: SubaccountData): Promise<FlutterwaveResponse> {
        try {
            log.info('Creating Flutterwave subaccount', {
                action: 'flutterwave_create_subaccount',
                metadata: {
                    business_name: data.business_name,
                    account_number: data.account_number
                }
            })

            const response = await fetch(`${this.baseUrl}/subaccounts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    business_name: data.business_name,
                    account_bank: data.account_bank,
                    account_number: data.account_number,
                    split_value: data.split_value,
                    split_type: data.split_type,
                    business_email: data.business_email,
                    business_contact: data.business_contact,
                    business_contact_mobile: data.business_contact_mobile,
                    business_mobile: data.business_mobile,
                    country: data.country || 'NG'
                })
            })

            const result = await response.json()

            if (result.status !== 'success') {
                throw new Error(`Subaccount creation failed: ${result.message}`)
            }

            log.info('Flutterwave subaccount created successfully', {
                action: 'flutterwave_subaccount_created',
                metadata: {
                    subaccount_id: result.data?.subaccount_id,
                    business_name: data.business_name
                }
            })

            return result
        } catch (error) {
            log.error('Flutterwave subaccount creation failed', { error: error as Error })
            ErrorTracker.captureException(error as Error, {
                action: 'flutterwave_subaccount_error',
                extra: { business_name: data.business_name }
            })
            throw error
        }
    }

    /**
     * Resolve bank account details (verify account name)
     */
    async resolveBankAccount(account: BankAccount): Promise<FlutterwaveResponse> {
        try {
            log.info('Resolving bank account', {
                action: 'flutterwave_resolve_account',
                metadata: {
                    account_number: account.account_number,
                    account_bank: account.account_bank
                }
            })

            const response = await fetch(`${this.baseUrl}/accounts/resolve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    account_number: account.account_number,
                    account_bank: account.account_bank
                })
            })

            const result = await response.json()

            log.info('Bank account resolved', {
                action: 'flutterwave_account_resolved',
                metadata: {
                    account_number: account.account_number,
                    account_name: result.data?.account_name
                }
            })

            return result
        } catch (error) {
            log.error('Bank account resolution failed', { error: error as Error })
            ErrorTracker.captureException(error as Error, {
                action: 'flutterwave_resolve_error',
                extra: { account_number: account.account_number }
            })
            throw error
        }
    }

    /**
     * Get list of Nigerian banks
     */
    async getBanks(country: string = 'NG'): Promise<FlutterwaveResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/banks/${country}`, {
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
     * Flutterwave uses HMAC SHA256 for webhook verification
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
        try {
            const hash = crypto
                .createHmac('sha256', this.config.webhookSecret)
                .update(payload)
                .digest('hex')

            return hash === signature
        } catch (error) {
            log.error('Webhook signature verification failed', { error: error as Error })
            return false
        }
    }

    /**
     * Verify webhook using the verif-hash header (Flutterwave method)
     */
    verifyWebhookHash(verifHash: string): boolean {
        return verifHash === this.config.webhookSecret
    }

    /**
     * Calculate platform fee and physiotherapist share
     * Flutterwave fees: 1.4% for local cards, capped at ₦2,000
     */
    calculateSplitAmounts(totalAmount: number): {
        platformFee: number
        physiotherapistShare: number
        flutterwaveFee: number
    } {
        const platformFee = parseInt(process.env.PLATFORM_FEE_AMOUNT || '100000') // ₦1,000 in kobo
        // Flutterwave fee: 1.4% capped at ₦2,000 (200000 kobo)
        const calculatedFee = Math.ceil(totalAmount * 0.014)
        const flutterwaveFee = Math.min(calculatedFee, 200000)
        const physiotherapistShare = totalAmount - platformFee - flutterwaveFee

        return {
            platformFee,
            physiotherapistShare: Math.max(0, physiotherapistShare),
            flutterwaveFee
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
export const flutterwaveService = new FlutterwaveService()

// Export types for use in other modules
export type {
    FlutterwaveConfig,
    PaymentInitData,
    FlutterwaveResponse,
    BankAccount,
    SubaccountData
}

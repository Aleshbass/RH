import { NextRequest, NextResponse } from 'next/server'
import { simplePaystackService } from '@/lib/payments/simple-payments'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bankCode, accountNumber, businessName, userId } = body

    log.info('Processing bank account connection', {
      bankCode,
      accountNumber,
      businessName,
      userId
    })

    // Step 1: Resolve bank account to verify it exists
    const accountResolution = await simplePaystackService.resolveBankAccount({
      account_number: accountNumber,
      bank_code: bankCode
    })

    if (!accountResolution.status) {
      return NextResponse.json({
        success: false,
        message: 'Could not verify bank account. Please check your details.'
      }, { status: 400 })
    }

    const accountName = accountResolution.data.account_name

    log.info('Bank account verified', {
      accountName,
      accountNumber,
      bankCode
    })

    // Step 2: Create Paystack subaccount for physiotherapist
    const subaccountData = {
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 0 // Platform handles fee splitting
    }

    const subaccountResult = await simplePaystackService.createSubaccount(subaccountData)

    if (!subaccountResult.status) {
      return NextResponse.json({
        success: false,
        message: 'Failed to create payment account. Please try again.'
      }, { status: 400 })
    }

    const subaccountCode = subaccountResult.data.subaccount_code

    log.info('Paystack subaccount created', {
      subaccountCode,
      businessName
    })

    // Step 3: Save bank account details (in real implementation, save to Convex)
    const bankAccountData = {
      userId,
      bankCode,
      accountNumber,
      accountName,
      businessName,
      subaccountCode,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    log.info('Bank account connected successfully', bankAccountData)

    // Step 4: Send confirmation email to physiotherapist
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/emails/bank-connected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        accountName,
        bankName: await getBankName(bankCode),
        accountNumber: `***${accountNumber.slice(-4)}`
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Bank account connected successfully',
      data: {
        accountName,
        subaccountCode,
        status: 'active'
      }
    })

  } catch (error) {
    log.error('Failed to connect bank account', { error: error as Error })
    ErrorTracker.captureException(error as Error, {
      tags: { component: 'bank_connection' }
    })
    
    return NextResponse.json(
      { error: 'Failed to connect bank account' },
      { status: 500 }
    )
  }
}

// Get list of banks for the frontend
export async function GET() {
  try {
    const banksResult = await simplePaystackService.getBanks()
    
    if (!banksResult.status) {
      throw new Error('Failed to fetch banks')
    }

    const banks = banksResult.data.map((bank: any) => ({
      name: bank.name,
      code: bank.code,
      slug: bank.slug
    }))

    return NextResponse.json({
      success: true,
      data: banks
    })

  } catch (error) {
    log.error('Failed to fetch banks', { error: error as Error })
    return NextResponse.json(
      { error: 'Failed to fetch banks' },
      { status: 500 }
    )
  }
}

// Helper function to get bank name by code
async function getBankName(bankCode: string): Promise<string> {
  try {
    const banksResult = await simplePaystackService.getBanks()
    if (banksResult.status) {
      const bank = banksResult.data.find((b: any) => b.code === bankCode)
      return bank?.name || 'Unknown Bank'
    }
    return 'Unknown Bank'
  } catch {
    return 'Unknown Bank'
  }
}

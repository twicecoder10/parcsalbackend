/**
 * Stripe Connect Service
 * 
 * Handles Stripe Connect Express account operations:
 * - Creating/getting Express accounts
 * - Onboarding links
 * - Account status refresh
 * - Balance retrieval
 * - Payout requests
 * 
 * This module is ISOLATED and ADDITIVE - does not modify existing payment logic
 */

import Stripe from 'stripe';
import { config } from '../../config/env';
import prisma from '../../config/database';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import { AuthRequest } from '../../middleware/auth';
import { onboardingRepository } from '../onboarding/repository';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

/**
 * Convert country name or code to ISO 3166-1 alpha-2 code
 * Stripe requires 2-character country codes (e.g., 'GB', 'US', 'EG')
 */
function normalizeCountryCode(country: string): string {
  if (!country) return 'GB'; // Default to GB
  
  const upperCountry = country.toUpperCase().trim();
  
  // If already a 2-character code, return it
  if (upperCountry.length === 2) {
    return upperCountry;
  }
  
  // Map common country names to ISO codes
  const countryMap: Record<string, string> = {
    'UNITED KINGDOM': 'GB',
    'UK': 'GB',
    'GREAT BRITAIN': 'GB',
    'UNITED STATES': 'US',
    'USA': 'US',
    'UNITED STATES OF AMERICA': 'US',
    'EGYPT': 'EG',
    'NIGERIA': 'NG',
    'SOUTH AFRICA': 'ZA',
    'KENYA': 'KE',
    'GHANA': 'GH',
    'CANADA': 'CA',
    'AUSTRALIA': 'AU',
    'FRANCE': 'FR',
    'GERMANY': 'DE',
    'SPAIN': 'ES',
    'ITALY': 'IT',
    'NETHERLANDS': 'NL',
    'BELGIUM': 'BE',
    'PORTUGAL': 'PT',
    'POLAND': 'PL',
    'SWEDEN': 'SE',
    'NORWAY': 'NO',
    'DENMARK': 'DK',
    'FINLAND': 'FI',
    'IRELAND': 'IE',
    'SWITZERLAND': 'CH',
    'AUSTRIA': 'AT',
    'GREECE': 'GR',
    'TURKEY': 'TR',
    'INDIA': 'IN',
    'CHINA': 'CN',
    'JAPAN': 'JP',
    'SOUTH KOREA': 'KR',
    'SINGAPORE': 'SG',
    'MALAYSIA': 'MY',
    'THAILAND': 'TH',
    'INDONESIA': 'ID',
    'PHILIPPINES': 'PH',
    'VIETNAM': 'VN',
    'BRAZIL': 'BR',
    'ARGENTINA': 'AR',
    'MEXICO': 'MX',
    'CHILE': 'CL',
    'COLOMBIA': 'CO',
    'PERU': 'PE',
    'NEW ZEALAND': 'NZ',
    'ISRAEL': 'IL',
    'UAE': 'AE',
    'UNITED ARAB EMIRATES': 'AE',
    'SAUDI ARABIA': 'SA',
    'QATAR': 'QA',
    'KUWAIT': 'KW',
    'BAHRAIN': 'BH',
    'OMAN': 'OM',
  };
  
  // Check if it's a known country name
  if (countryMap[upperCountry]) {
    return countryMap[upperCountry];
  }
  
  // If not found, try to extract first 2 characters (might be a code with extra text)
  // Otherwise default to GB
  console.warn(`Unknown country format: "${country}". Defaulting to GB.`);
  return 'GB';
}

export const connectService = {
  /**
   * Create or get Stripe Express account for a company
   */
  async createOrGetExpressAccount(companyId: string): Promise<string> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // If account already exists, return it
    if (company.stripeAccountId) {
      return company.stripeAccountId;
    }

    // Create new Express account
    // Normalize country code to ISO 3166-1 alpha-2 format (e.g., 'GB', 'US')
    const countryCode = normalizeCountryCode(company.country || 'GB');
    
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: countryCode,
        email: company.contactEmail || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          companyId: company.id,
          companyName: company.name,
        },
      });

      // Update company with Stripe account ID
      await prisma.company.update({
        where: { id: companyId },
        data: {
          stripeAccountId: account.id,
          stripeOnboardingStatus: 'IN_PROGRESS',
        },
      });

      return account.id;
    } catch (error: any) {
      // Handle Stripe Connect not enabled error
      if (error.message && error.message.includes('signed up for Connect')) {
        throw new BadRequestError(
          'Stripe Connect is not enabled for this account. Please enable Stripe Connect in your Stripe Dashboard at https://dashboard.stripe.com/settings/connect, or contact support for assistance.'
        );
      }
      throw error;
    }
  },

  /**
   * Create onboarding link for Express account
   */
  async createOnboardingLink(companyId: string, returnUrl: string, _fromOnboarding?: boolean): Promise<string> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Ensure account exists
    const accountId = await this.createOrGetExpressAccount(companyId);

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    // If this is from onboarding, we'll mark the step as complete when payouts are enabled
    // (handled in refreshAccountStatus)
    // For now, we just create the link and let the status check handle completion

    return accountLink.url;
  },

  /**
   * Create Stripe Express dashboard login link
   */
  async createDashboardLoginLink(companyId: string): Promise<string> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    if (!company.stripeAccountId) {
      throw new BadRequestError('Stripe Connect account not found');
    }

    const loginLink = await stripe.accounts.createLoginLink(company.stripeAccountId);

    return loginLink.url;
  },

  /**
   * Refresh account status from Stripe
   */
  async refreshAccountStatus(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        admin: true,
      },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    if (!company.stripeAccountId) {
      return {
        stripeAccountId: null,
        stripeOnboardingStatus: 'NOT_STARTED',
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    // Retrieve account from Stripe
    const account = await stripe.accounts.retrieve(company.stripeAccountId);

    // Determine onboarding status
    let onboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' = 'NOT_STARTED';
    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      onboardingStatus = 'COMPLETE';
    } else if (account.details_submitted || account.charges_enabled || account.payouts_enabled) {
      onboardingStatus = 'IN_PROGRESS';
    }

    // Update company
    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        stripeOnboardingStatus: onboardingStatus,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
      },
    });

    // Handle payout_setup step (REQUIRED for onboarding completion - companies cannot complete onboarding without it)
    // This step is compulsory and enforced by updateCompanyOnboardingStep which validates ALL required steps
    if (account.payouts_enabled) {
      try {
        const companyOnboarding = await onboardingRepository.getCompanyOnboarding(companyId);
        if (companyOnboarding) {
          const payoutStep = companyOnboarding.onboardingSteps?.['payout_setup'];
          
          // If payouts are enabled and step is not completed, mark it complete
          // updateCompanyOnboardingStep will automatically recalculate onboardingCompleted 
          // based on ALL required steps, ensuring payout_setup is mandatory
          if (!payoutStep?.completed) {
            await onboardingRepository.updateCompanyOnboardingStep(
              companyId,
              'payout_setup',
              true
            );

            // Trigger user onboarding recalculation if admin exists
            if (company.adminId) {
              await onboardingRepository.updateUserOnboardingStep(
                company.adminId,
                'profile_completion',
                true
              ).catch((err) => {
                console.error('Failed to update user onboarding:', err);
              });
            }
          }
        }
      } catch (err: any) {
        // Log error but don't fail the request
        console.error(`[Connect] Failed to update onboarding step:`, {
          error: err.message,
          stack: err.stack,
          companyId,
        });
      }
    }

    return {
      stripeAccountId: updated.stripeAccountId,
      stripeOnboardingStatus: updated.stripeOnboardingStatus,
      chargesEnabled: updated.chargesEnabled,
      payoutsEnabled: updated.payoutsEnabled,
    };
  },

  /**
   * Get available balance for a company
   */
  async retrieveBalance(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    if (!company.stripeAccountId) {
      return {
        available: 0,
        pending: 0,
        currency: 'gbp',
      };
    }

    try {
      // Retrieve balance from Stripe Connect account
      const balance = await stripe.balance.retrieve({
        stripeAccount: company.stripeAccountId,
      });


      // Find GBP balance (or first available)
      const gbpBalance = balance.available.find((b) => b.currency === 'gbp') || balance.available[0];
      const gbpPending = balance.pending.find((b) => b.currency === 'gbp') || balance.pending[0];

      return {
        available: gbpBalance?.amount || 0,
        pending: gbpPending?.amount || 0,
        currency: gbpBalance?.currency || 'gbp',
      };
    } catch (error: any) {
      console.error(`[Connect] Error retrieving balance for company ${companyId}:`, {
        stripeAccountId: company.stripeAccountId,
        error: error.message,
        errorCode: error.code,
        errorType: error.type,
      });
      
      // If account doesn't exist or access denied, return 0
      if (error.code === 'resource_missing' || error.type === 'invalid_request_error') {
        return {
          available: 0,
          pending: 0,
          currency: 'gbp',
        };
      }
      
      throw error;
    }
  },

  /**
   * Get account information for debugging
   */
  async getAccountInfo(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    if (!company.stripeAccountId) {
      return {
        stripeAccountId: null,
        account: null,
        error: 'No Stripe Connect account found',
      };
    }

    try {
      const account = await stripe.accounts.retrieve(company.stripeAccountId);
      
      // Get recent charges to see if payments are going to this account
      const charges = await stripe.charges.list({
        limit: 5,
      }, {
        stripeAccount: company.stripeAccountId,
      });

      return {
        stripeAccountId: company.stripeAccountId,
        account: {
          id: account.id,
          type: account.type,
          country: account.country,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
        },
        recentCharges: charges.data.map(c => ({
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          created: new Date(c.created * 1000).toISOString(),
        })),
      };
    } catch (error: any) {
      return {
        stripeAccountId: company.stripeAccountId,
        account: null,
        error: error.message,
      };
    }
  },

  /**
   * Request a payout for a company
   */
  async requestPayout(req: AuthRequest, companyId: string, amountMinor: number) {
    if (!req.user || !req.user.companyId) {
      throw new ForbiddenError('User must be associated with a company');
    }

    if (req.user.companyId !== companyId) {
      throw new ForbiddenError('You do not have permission to request payouts for this company');
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    // Check onboarding status
    if (company.stripeOnboardingStatus !== 'COMPLETE') {
      throw new BadRequestError('Stripe account onboarding must be completed before requesting payouts');
    }

    // Check payouts enabled
    if (!company.payoutsEnabled) {
      throw new BadRequestError('Payouts are not enabled for this account');
    }

    // Minimum payout £10 (1000 pence)
    const minimumPayoutMinor = 1000;
    if (amountMinor < minimumPayoutMinor) {
      throw new BadRequestError(`Minimum payout amount is £${minimumPayoutMinor / 100}`);
    }

    // Check available balance
    const balance = await this.retrieveBalance(companyId);
    if (amountMinor > balance.available) {
      throw new BadRequestError('Requested amount exceeds available balance');
    }

    if (!company.stripeAccountId) {
      throw new BadRequestError('Stripe account not found');
    }

    // Create payout in Stripe
    const payout = await stripe.payouts.create(
      {
        amount: amountMinor,
        currency: 'gbp',
        metadata: {
          companyId: company.id,
          companyName: company.name,
        },
      },
      {
        stripeAccount: company.stripeAccountId,
      }
    );

    // Create payout request record
    const payoutRequest = await prisma.payoutRequest.create({
      data: {
        companyId: company.id,
        amount: amountMinor,
        currency: 'gbp',
        status: 'PROCESSING',
        stripePayoutId: payout.id,
      },
    });

    return {
      id: payoutRequest.id,
      amount: payoutRequest.amount,
      currency: payoutRequest.currency,
      status: payoutRequest.status,
      stripePayoutId: payoutRequest.stripePayoutId,
      createdAt: payoutRequest.createdAt.toISOString(),
    };
  },
};


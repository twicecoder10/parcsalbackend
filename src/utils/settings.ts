import fs from 'fs/promises';
import path from 'path';
import { BadRequestError } from './errors';

export interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  commissionRate: number;
  minCommission: number;
  maxCommission: number;
  autoVerifyCompanies: boolean;
  requireEmailVerification: boolean;
  allowCompanyRegistration: boolean;
  allowCustomerRegistration: boolean;
  maintenanceMode: boolean;
}

const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');

const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: 'Parcsal',
  supportEmail: 'support@parcsal.com',
  supportPhone: '+447344510715',
  facebookUrl: 'https://www.facebook.com/parcsal',
  instagramUrl: 'https://www.instagram.com/parcsalcom/',
  tiktokUrl: 'https://www.tiktok.com/@parcsal',
  commissionRate: 5.0,
  minCommission: 0,
  maxCommission: 100,
  autoVerifyCompanies: false,
  requireEmailVerification: true,
  allowCompanyRegistration: true,
  allowCustomerRegistration: true,
  maintenanceMode: false,
};

let cachedSettings: PlatformSettings | null = null;

async function loadSettings(): Promise<PlatformSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }

  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<PlatformSettings>;
    cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
    return cachedSettings;
  } catch (error) {
    // File doesn't exist, use defaults
    cachedSettings = DEFAULT_SETTINGS;
    await saveSettings(cachedSettings);
    return cachedSettings;
  }
}

async function saveSettings(settings: PlatformSettings): Promise<void> {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    cachedSettings = settings;
  } catch (error) {
    throw new BadRequestError('Failed to save settings');
  }
}

export const settingsManager = {
  async getSettings(): Promise<PlatformSettings> {
    return loadSettings();
  },

  async updateSettings(updates: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const current = await loadSettings();
    const updated = { ...current, ...updates };
    
    // Validate commission rate
    if (updates.commissionRate !== undefined) {
      if (updates.commissionRate < 0 || updates.commissionRate > 100) {
        throw new BadRequestError('Commission rate must be between 0 and 100');
      }
    }

    // Validate min/max commission
    if (updates.minCommission !== undefined || updates.maxCommission !== undefined) {
      const minCommission = updates.minCommission ?? current.minCommission;
      const maxCommission = updates.maxCommission ?? current.maxCommission;
      if (minCommission > maxCommission) {
        throw new BadRequestError('Min commission cannot be greater than max commission');
      }
    }

    await saveSettings(updated);
    return updated;
  },
};


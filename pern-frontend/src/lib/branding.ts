/**
 * PERN White-label Branding System
 * Allows different organizations to have their own branding
 */

export interface BrandingConfig {
  appName: string;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  tagline: string;
  supportEmail: string;
}

const DEFAULT_BRANDING: BrandingConfig = {
  appName: 'PERN',
  primaryColor: '#10b981',
  secondaryColor: '#3b82f6',
  tagline: 'Environmental Intelligence Platform',
  supportEmail: 'support@pern.app'
};

export function getBranding(): BrandingConfig {
  const org = localStorage.getItem('pern_current_organization');
  if (!org) return DEFAULT_BRANDING;

  try {
    const parsed = JSON.parse(org);
    
    // Custom branding per organization (can be extended)
    if (parsed.id.includes('cairo')) {
      return {
        ...DEFAULT_BRANDING,
        appName: 'Cairo AirWatch',
        tagline: 'Smart Environmental Monitoring for Cairo',
        primaryColor: '#10b981'
      };
    }
    
    if (parsed.id.includes('giza')) {
      return {
        ...DEFAULT_BRANDING,
        appName: 'Giza EcoMonitor',
        tagline: 'Protecting Giza\'s Environment',
        primaryColor: '#10b981'
      };
    }
  } catch {}

  return DEFAULT_BRANDING;
}
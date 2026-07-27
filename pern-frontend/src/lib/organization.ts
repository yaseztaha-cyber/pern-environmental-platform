/**
 * PERN Multi-Tenancy - Organization Model
 * Every company gets its own isolated workspace
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;                    // URL-friendly name (e.g. "cairo-municipality")
  logo?: string;
  plan: 'starter' | 'professional' | 'enterprise';
  maxDevices: number;
  maxUsers: number;
  createdAt: string;
}

export interface OrganizationMember {
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

// Current active organization (stored in localStorage)
export function getCurrentOrganization(): Organization | null {
  const stored = localStorage.getItem('pern_current_organization');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    if (import.meta.env.DEV) console.warn('[Org] Corrupt organization data in localStorage, clearing');
    localStorage.removeItem('pern_current_organization');
    return null;
  }
}

export function setCurrentOrganization(org: Organization) {
  localStorage.setItem('pern_current_organization', JSON.stringify(org));
}

// No hardcoded demo organizations — all data comes from the backend API
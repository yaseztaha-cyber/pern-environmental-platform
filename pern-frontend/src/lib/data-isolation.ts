/**
 * PERN Data Isolation Layer
 * Ensures all data is properly scoped to the current organization
 */

import { getCurrentOrganization } from './organization';

// Generate organization-scoped storage key
export function getOrgKey(baseKey: string): string {
  const org = getCurrentOrganization();
  const orgId = org?.id || 'default';
  return `pern_${orgId}_${baseKey}`;
}

// Organization-scoped localStorage
export const orgStorage = {
  getItem: (key: string) => {
    return localStorage.getItem(getOrgKey(key));
  },
  setItem: (key: string, value: string) => {
    localStorage.setItem(getOrgKey(key), value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(getOrgKey(key));
  }
};

// Filter data by organization
export function filterByOrganization<T extends { organizationId?: string }>(
  data: T[], 
  currentOrgId: string
): T[] {
  return data.filter(item => 
    !item.organizationId || item.organizationId === currentOrgId
  );
}

// Add organization ID to new data
export function addOrganizationContext<T>(data: T): T & { organizationId: string } {
  const org = getCurrentOrganization();
  return {
    ...data,
    organizationId: org?.id || 'default'
  };
}
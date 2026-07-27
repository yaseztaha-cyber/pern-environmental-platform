import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { Organization } from './organization';
import { getCurrentOrganization, setCurrentOrganization } from './organization';
import { apiClient } from './api-client';

interface OrganizationContextType {
  currentOrganization: Organization | null;
  organizations: Organization[];
  switchOrganization: (org: Organization) => void;
  addOrganization: (org: Organization) => void;
  clearOrganizations: () => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [currentOrganization, setCurrentOrg] = useState<Organization | null>(getCurrentOrganization());
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Fetch real organizations from the backend — never use hardcoded fake data
  useEffect(() => {
    let cancelled = false;
    apiClient.getOrganizations().then((rows: any[]) => {
      if (cancelled) return;
      const orgs: Organization[] = Array.isArray(rows)
        ? rows.map((r: any) => ({
            id: r.id,
            name: r.name || r.id,
            slug: r.slug || r.id,
            logo: r.logo,
            plan: r.plan || 'starter',
            maxDevices: r.max_devices || r.maxDevices || 10,
            maxUsers: r.max_users || r.maxUsers || 5,
            created_at: r.created_at || r.createdAt || new Date().toISOString(),
            createdAt: r.created_at || r.createdAt || new Date().toISOString(),
          }))
        : [];
      setOrganizations(orgs);

      // Auto-select first org if none selected yet
      if (!getCurrentOrganization() && orgs.length > 0) {
        setCurrentOrg(orgs[0]);
        setCurrentOrganization(orgs[0]);
      }
    }).catch(() => {
      // Backend unavailable — start with empty org list
      if (!cancelled) setOrganizations([]);
    });
    return () => { cancelled = true; };
  }, []);

  // When entering Live Mode, clear all demo/seeded organizations so only
  // real, user-created orgs are shown.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.isLive) {
        setOrganizations([]);
        setCurrentOrg(null);
        setCurrentOrganization(null as any);
      } else {
        // Re-fetch when returning to simulation
        apiClient.getOrganizations().then((rows: any[]) => {
          const orgs: Organization[] = Array.isArray(rows)
            ? rows.map((r: any) => ({
                id: r.id,
                name: r.name || r.id,
                slug: r.slug || r.id,
                logo: r.logo,
                plan: r.plan || 'starter',
                maxDevices: r.max_devices || r.maxDevices || 10,
                maxUsers: r.max_users || r.maxUsers || 5,
                created_at: r.created_at || r.createdAt || new Date().toISOString(),
                createdAt: r.created_at || r.createdAt || new Date().toISOString(),
              }))
            : [];
          setOrganizations(orgs);
        }).catch(() => {});
      }
    };
    window.addEventListener('live-mode-change', handler);
    return () => window.removeEventListener('live-mode-change', handler);
  }, []);

  // Set default organization if none selected
  useEffect(() => {
    if (!currentOrganization && organizations.length > 0) {
      const defaultOrg = organizations[0];
      setCurrentOrg(defaultOrg);
      setCurrentOrganization(defaultOrg);
    }
  }, [organizations, currentOrganization]);

  const switchOrganization = useCallback((org: Organization) => {
    setCurrentOrg(org);
    setCurrentOrganization(org);
    window.location.reload();
  }, []);

  const addOrganization = useCallback((org: Organization) => {
    setOrganizations(prev => [...prev, org]);
  }, []);

  const clearOrganizations = useCallback(() => {
    setOrganizations([]);
    setCurrentOrg(null);
    localStorage.removeItem('pern_current_organization');
  }, []);

  const value = useMemo(() => ({
    currentOrganization,
    organizations,
    switchOrganization,
    addOrganization,
    clearOrganizations
  }), [currentOrganization, organizations, switchOrganization, addOrganization, clearOrganizations]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
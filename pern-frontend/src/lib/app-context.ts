/**
 * PERN Unified App Context
 * Supports both:
 * - Organization users (companies)
 * - Individual users (personal use)
 */

export type ContextType = 'organization' | 'individual';

export interface AppContext {
  type: ContextType;
  id: string;           // organizationId or userId
  name: string;
  plan?: string;
}

// Get current context (org or individual)
export function getCurrentContext(): AppContext {
  // Check for organization first
  const org = localStorage.getItem('pern_current_organization');
  if (org) {
    try {
      const parsed = JSON.parse(org);
      return {
        type: 'organization',
        id: parsed.id,
        name: parsed.name,
        plan: parsed.plan
      };
    } catch { /* corrupt localStorage, fall through */ }
  }

  // Fallback to individual user
  const user = localStorage.getItem('pern_demo_user');
  if (user) {
    try {
      const parsed = JSON.parse(user);
      return {
        type: 'individual',
        id: parsed.id,
        name: parsed.name || 'Personal Workspace'
      };
    } catch { /* corrupt localStorage, fall through */ }
  }

  // Default individual context
  return {
    type: 'individual',
    id: 'personal-user',
    name: 'Personal Workspace'
  };
}

// Get storage key scoped to current context
export function getScopedKey(baseKey: string): string {
  const context = getCurrentContext();
  return `pern_${context.type}_${context.id}_${baseKey}`;
}
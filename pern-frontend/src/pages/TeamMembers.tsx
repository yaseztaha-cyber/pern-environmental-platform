import { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, Shield, Mail } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { PageHeader, Card, Pill, Btn, LoadingState, EmptyState } from '../components/ui';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt?: string;
}

const ROLE_OPTIONS = ['admin', 'supervisor', 'operator', 'viewer', 'researcher'] as const;

const ROLE_TONES: Record<string, 'emerald' | 'cyan' | 'violet' | 'amber' | 'slate'> = {
  admin: 'emerald',
  supervisor: 'cyan',
  operator: 'violet',
  viewer: 'slate',
  researcher: 'amber',
};

export default function TeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('operator');

  const fetchMembers = () => {
    setLoading(true);
    apiClient.getUsers().then((data: any) => {
      setMembers(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) return;
    try {
      await apiClient.post('/users', { name: inviteName, email: inviteEmail, role: inviteRole });
      setInviteName('');
      setInviteEmail('');
      setInviteRole('operator');
      setShowInvite(false);
      fetchMembers();
    } catch (err) {
      console.error('Failed to invite member:', err);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await apiClient.delete(`/users/${id}`);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleRoleChange = async (id: string, role: string) => {
    try {
      await apiClient.put(`/users/${id}`, { role });
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  };

  if (loading) return <LoadingState label="Loading team members..." />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Team Members"
        subtitle={`${members.length} user${members.length !== 1 ? 's' : ''}`}
        right={
          <Btn variant="primary" onClick={() => setShowInvite(true)}>
            <UserPlus size={14} />
            Invite Member
          </Btn>
        }
      />

      {members.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="No team members"
          message="Invite your first team member to get started."
          action={
            <Btn variant="primary" onClick={() => setShowInvite(true)}>
              <UserPlus size={14} />
              Invite Member
            </Btn>
          }
        />
      ) : (
        <Card hover={false}>
          <div className="grid-entrance space-y-1">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 hover:bg-[var(--surface)] rounded-[var(--radius-md)] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[var(--emerald-dim)] rounded-full flex items-center justify-center text-[var(--emerald)] font-medium text-sm">
                    {member.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-sm text-[var(--text-tertiary)] flex items-center gap-1">
                      <Mail size={11} /> {member.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {member.joinedAt && (
                    <span className="text-xs text-[var(--text-tertiary)] hidden sm:block">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  )}
                  <Pill tone={ROLE_TONES[member.role] || 'slate'}>
                    <Shield size={10} />
                    {member.role}
                  </Pill>
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    aria-label={`Change role for ${member.name}`}
                    className="bg-[var(--surface)] text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-secondary)]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <Btn variant="danger" size="sm" onClick={() => handleRemove(member.id)} className="p-1.5">
                    <Trash2 size={15} />
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showInvite && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="glass p-8 rounded-[var(--radius-xl)] w-full max-w-md animate-fade-in-up">
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <UserPlus size={18} className="text-[var(--emerald)]" />
              Invite New Member
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-[var(--text-tertiary)]" htmlFor="invite-name">Name</label>
                <input
                  id="invite-name"
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  aria-label="New member name"
                  className="w-full mt-1 bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-md)]"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]" htmlFor="invite-email">Email Address</label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  aria-label="New member email"
                  className="w-full mt-1 bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-md)]"
                  placeholder="user@company.com"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)]" htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  aria-label="New member role"
                  className="w-full mt-1 bg-[var(--surface)] px-4 py-3 rounded-[var(--radius-md)]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <Btn variant="ghost" className="flex-1" onClick={() => setShowInvite(false)}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                className="flex-1"
                onClick={handleInvite}
                disabled={!inviteEmail || !inviteName}
              >
                <Mail size={14} />
                Send Invitation
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

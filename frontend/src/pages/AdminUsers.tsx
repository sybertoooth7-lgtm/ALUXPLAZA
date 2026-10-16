// frontend/src/pages/AdminUsers.tsx
// Superadmin-only: list, create, edit roles, disable/enable, delete admin users.

import { useEffect, useState } from 'react';
import { secureFetch } from '@/lib/security';
import AdminLayout from '@/components/AdminLayout';

interface AdminUserRow {
  id: number;
  email: string;
  role: 'readonly' | 'admin' | 'superadmin';
  disabled_at: string | null;
  created_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'readonly' | 'admin' | 'superadmin'>('admin');
  const [tempPassword, setTempPassword] = useState('');

  async function loadUsers() {
    try {
      const res = await secureFetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await secureFetch('/api/admin/users');
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        if (!mounted) return;
        setUsers(data.users);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setTempPassword('');
    try {
      const res = await secureFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setTempPassword(data.temporaryPassword);
      setNewEmail('');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    }
  }

  async function changeRole(id: number, role: string) {
    try {
      const res = await secureFetch(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  // Disabling ends the person's access at once but keeps the account (and the
  // audit trail that names it), which is what to do when someone leaves. Delete
  // is for accounts created by mistake.
  async function setDisabled(user: AdminUserRow, disabled: boolean) {
    if (
      disabled &&
      !confirm(`Disable ${user.email}? They will be signed out and unable to log in.`)
    )
      return;
    setError('');
    try {
      const res = await secureFetch(
        `/api/admin/users/${user.id}/${disabled ? 'disable' : 'enable'}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${disabled ? 'disable' : 'enable'}`);
      }
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function deleteUser(id: number) {
    if (!confirm('Delete this admin? This cannot be undone.')) return;
    try {
      const res = await secureFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <AdminLayout>
      {(me) => (
        <div className="max-w-3xl mx-auto px-6 py-10">
          <h2 className="font-serif text-lg text-alux-gold mb-6">Admin Users</h2>

          {error && <p className="text-alux-red mb-4">{error}</p>}

          {loading ? (
            <p className="text-white/50">Loading…</p>
          ) : (
            <>
              {tempPassword && (
                <div className="bg-alux-gold/10 border border-alux-gold/30 rounded-xl p-4 mb-6">
                  <p className="text-alux-gold text-sm font-medium mb-1">
                    Temporary password (share securely):
                  </p>
                  <code className="text-lg font-mono text-white">{tempPassword}</code>
                </div>
              )}

              <form
                onSubmit={createUser}
                className="bg-navy-surface border border-white/10 rounded-xl p-4 mb-8 flex gap-3 items-end"
              >
                <div className="flex-1">
                  <label className="text-xs text-white/40 block mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-navy-base border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) =>
                      setNewRole(e.target.value as 'readonly' | 'admin' | 'superadmin')
                    }
                    className="bg-navy-base border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="readonly">Read-only</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="bg-alux-gold text-navy-base font-semibold px-4 py-2 rounded-lg text-sm hover:bg-alux-gold/90"
                >
                  Create
                </button>
              </form>

              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className={`bg-navy-surface border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between ${u.disabled_at ? 'opacity-60' : ''}`}
                  >
                    <div>
                      <p className="text-white font-medium">
                        {u.email}
                        {u.disabled_at && (
                          <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-alux-red/15 text-alux-red">
                            Disabled
                          </span>
                        )}
                      </p>
                      <p className="text-white/40 text-xs">
                        {u.role} · {new Date(u.created_at).toLocaleDateString()}
                        {u.disabled_at &&
                          ` · disabled ${new Date(u.disabled_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        className="bg-navy-base border border-white/15 rounded-lg px-2 py-1 text-white text-xs"
                      >
                        <option value="readonly">Read-only</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                      {u.email !== me.email && (
                        <button
                          onClick={() => setDisabled(u, !u.disabled_at)}
                          className="text-white/70 text-xs border border-white/20 rounded-lg px-2 py-1 hover:bg-white/10"
                        >
                          {u.disabled_at ? 'Enable' : 'Disable'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="text-alux-red text-xs border border-alux-red/30 rounded-lg px-2 py-1 hover:bg-alux-red/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

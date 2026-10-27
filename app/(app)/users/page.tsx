'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc, useStore, type Profile } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { AdminOnly, Modal } from '@/components/Shell';

export default function UsersPage() {
  return <AdminOnly><Users /></AdminOnly>;
}

type Mode = { kind: 'new' } | { kind: 'edit'; user: Profile };

function Users() {
  const { profile } = useStore();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [f, setF] = useState({ username: '', full_name: '', password: '', role: 'staff' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('kost_profiles').select('id, username, full_name, role').order('username');
    if (error) { setErr(error.message); setUsers([]); } else setUsers((data ?? []) as Profile[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  function openNew() { setErr(null); setF({ username: '', full_name: '', password: '', role: 'staff' }); setMode({ kind: 'new' }); }
  function openEdit(u: Profile) { setErr(null); setF({ username: u.username, full_name: u.full_name ?? '', password: '', role: u.role }); setMode({ kind: 'edit', user: u }); }

  async function save() {
    if (!mode) return;
    setBusy(true); setErr(null);
    try {
      if (mode.kind === 'new') {
        await rpc('kost_admin_create_user', { p_username: f.username, p_password: f.password, p_full_name: f.full_name, p_role: f.role });
      } else {
        if (f.password) await rpc('kost_admin_set_password', { p_user: mode.user.id, p_password: f.password });
        await rpc('kost_admin_update_user', { p_user: mode.user.id, p_full_name: f.full_name, p_role: f.role });
      }
      await load(); setMode(null);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function remove() {
    if (mode?.kind !== 'edit' || !confirm(`Διαγραφή χρήστη «${mode.user.username}»;`)) return;
    try { await rpc('kost_admin_delete_user', { p_user: mode.user.id }); await load(); setMode(null); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Χρήστες</h1><div className="muted">Το προσωπικό βλέπει μόνο συνταγές και δοσολογίες — όχι τιμές, κόστη ή κέρδη</div></div>
        <button className="btn-primary" onClick={openNew}>+ Νέος χρήστης</button>
      </div>
      {!mode && err && <div className="alert alert-err" style={{ marginBottom: 14 }}>{err}</div>}
      {!users ? <p className="muted">Φόρτωση…</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Όνομα χρήστη</th><th>Ονοματεπώνυμο</th><th>Ρόλος</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="click" onClick={() => openEdit(u)}>
                  <td><b>{u.username}</b>{u.id === profile?.id && <span className="muted small"> (εσύ)</span>}</td>
                  <td>{u.full_name ?? '—'}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'b-sub' : 'b-info'}`}>{u.role === 'admin' ? 'Διαχειριστής' : 'Προσωπικό'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mode && (
        <Modal title={mode.kind === 'new' ? 'Νέος χρήστης' : `Χρήστης ${mode.user.username}`} onClose={() => setMode(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {mode.kind === 'new' && (
              <label className="field">Όνομα χρήστη (λατινικά, χωρίς κενά)
                <input autoFocus autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
              </label>
            )}
            <label className="field">Ονοματεπώνυμο<input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
            <label className="field">{mode.kind === 'new' ? 'Κωδικός (8+ χαρακτήρες)' : 'Νέος κωδικός (άφησέ το κενό για να μην αλλάξει)'}
              <input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </label>
            <label className="field">Ρόλος
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="staff">Προσωπικό — βλέπει δοσολογίες</option>
                <option value="admin">Διαχειριστής — τα πάντα</option>
              </select>
            </label>
          </div>
          {err && <div className="alert alert-err" style={{ marginTop: 12 }}>{err}</div>}
          <div className="modal-actions">
            {mode.kind === 'edit' && mode.user.id !== profile?.id && <button className="btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Διαγραφή</button>}
            <button onClick={() => setMode(null)}>Άκυρο</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{busy ? '…' : 'Αποθήκευση'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

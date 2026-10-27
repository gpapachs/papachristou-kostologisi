'use client';
import { useState } from 'react';
import { useStore, type Supplier } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { AdminOnly, Modal } from '@/components/Shell';

export default function SuppliersPage() {
  return <AdminOnly><Suppliers /></AdminOnly>;
}

function Suppliers() {
  const { suppliers, ingredients, reload } = useStore();
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit?.name?.trim()) { setErr('Δώσε όνομα'); return; }
    setBusy(true); setErr(null);
    const row = { name: edit.name.trim(), phone: edit.phone?.trim() || null, notes: edit.notes?.trim() || null };
    const sb = supabase();
    const { error } = edit.id
      ? await sb.from('kost_suppliers').update(row).eq('id', edit.id)
      : await sb.from('kost_suppliers').insert(row);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await reload(); setEdit(null);
  }

  async function remove() {
    if (!edit?.id || !confirm(`Διαγραφή «${edit.name}»; Τα υλικά του θα μείνουν χωρίς προμηθευτή.`)) return;
    const { error } = await supabase().from('kost_suppliers').delete().eq('id', edit.id);
    if (error) { setErr(error.message); return; }
    await reload(); setEdit(null);
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Προμηθευτές</h1><div className="muted">Για ομαδοποίηση στην ενημέρωση τιμών</div></div>
        <button className="btn-primary" onClick={() => { setErr(null); setEdit({}); }}>+ Νέος προμηθευτής</button>
      </div>
      {suppliers.length === 0 ? <div className="card muted">Κανένας προμηθευτής ακόμα.</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Όνομα</th><th>Τηλέφωνο</th><th className="num">Υλικά</th><th>Σημειώσεις</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="click" onClick={() => { setErr(null); setEdit(s); }}>
                  <td><b>{s.name}</b></td>
                  <td>{s.phone ?? '—'}</td>
                  <td className="num">{ingredients.filter((i) => i.supplier_id === s.id).length}</td>
                  <td className="muted">{s.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Επεξεργασία προμηθευτή' : 'Νέος προμηθευτής'} onClose={() => setEdit(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="field">Όνομα<input autoFocus value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="field">Τηλέφωνο<input value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <label className="field">Σημειώσεις<input value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
          </div>
          {err && <div className="alert alert-err" style={{ marginTop: 12 }}>{err}</div>}
          <div className="modal-actions">
            {edit.id && <button className="btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Διαγραφή</button>}
            <button onClick={() => setEdit(null)}>Άκυρο</button>
            <button className="btn-primary" onClick={save} disabled={busy}>Αποθήκευση</button>
          </div>
        </Modal>
      )}
    </>
  );
}

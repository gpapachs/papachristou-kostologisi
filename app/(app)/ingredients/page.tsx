'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { eur, recipesUsingIngredient, usableUnitCost, type Ingredient, type PurchaseUnit } from '@/lib/costing';
import { Modal } from '@/components/Shell';

interface Draft { id?: string; name: string; category: string; unit: PurchaseUnit; yield_pct: string; supplier_id: string; notes: string; active: boolean; price: string }

const blank: Draft = { name: '', category: '', unit: 'kg', yield_pct: '100', supplier_id: '', notes: '', active: true, price: '' };

export default function IngredientsPage() {
  const { isAdmin, ingredients, prices, suppliers, recipes, ctx, reload } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const priceMap = useMemo(() => new Map(prices.map((p) => [p.ingredient_id, p])), [prices]);
  const supMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const categories = [...new Set(ingredients.map((i) => i.category).filter(Boolean))].sort() as string[];

  const list = ingredients
    .filter((i) => !cat || i.category === cat)
    .filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));

  function open(i?: Ingredient) {
    setErr(null);
    if (!i) { setEdit({ ...blank, category: cat }); return; }
    setEdit({
      id: i.id, name: i.name, category: i.category ?? '', unit: i.unit, yield_pct: String(i.yield_pct),
      supplier_id: i.supplier_id ?? '', notes: i.notes ?? '', active: i.active,
      price: priceMap.has(i.id) ? String(priceMap.get(i.id)!.price) : '',
    });
  }

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) { setErr('Δώσε όνομα'); return; }
    const y = Number(edit.yield_pct);
    if (!(y > 0 && y <= 100)) { setErr('Η απόδοση πρέπει να είναι 1–100%'); return; }
    setBusy(true); setErr(null);
    const sb = supabase();
    const row = {
      name: edit.name.trim(), category: edit.category.trim() || null, unit: edit.unit, yield_pct: y,
      supplier_id: edit.supplier_id || null, notes: edit.notes.trim() || null, active: edit.active,
    };
    let id = edit.id;
    if (id) {
      const { error } = await sb.from('kost_ingredients').update(row).eq('id', id);
      if (error) { setBusy(false); setErr(error.message); return; }
    } else {
      const { data, error } = await sb.from('kost_ingredients').insert(row).select('id').single();
      if (error || !data) { setBusy(false); setErr(error?.message ?? 'Σφάλμα'); return; }
      id = data.id;
    }
    if (edit.price.trim() !== '') {
      const price = Number(edit.price.replace(',', '.'));
      const prev = priceMap.get(id!)?.price;
      if (!isNaN(price) && price !== prev) {
        const { error } = await sb.from('kost_ingredient_prices').upsert({ ingredient_id: id, price });
        if (error) { setBusy(false); setErr(error.message); return; }
      }
    }
    await reload();
    setBusy(false); setEdit(null);
  }

  async function remove() {
    if (!edit?.id) return;
    const used = recipesUsingIngredient(edit.id, ctx);
    const direct = recipes.filter((r) => used.has(r.id) && (ctx.itemsByRecipe.get(r.id) ?? []).some((i) => i.ingredient_id === edit.id));
    if (direct.length) { setErr(`Χρησιμοποιείται στα: ${direct.map((r) => r.name).join(', ')}. Κάν' το ανενεργό αντί για διαγραφή.`); return; }
    if (!confirm(`Διαγραφή «${edit.name}»;`)) return;
    const { error } = await supabase().from('kost_ingredients').delete().eq('id', edit.id);
    if (error) { setErr(error.message); return; }
    await reload(); setEdit(null);
  }

  const u = edit?.unit ?? 'kg';
  const previewCost = edit && edit.price ? usableUnitCost({ yield_pct: Number(edit.yield_pct) } as Ingredient, Number(edit.price.replace(',', '.'))) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Πρώτες ύλες</h1>
          <div className="muted">{isAdmin ? 'Τιμές αγοράς χωρίς ΦΠΑ, ανά μονάδα αγοράς' : 'Λίστα υλικών'}</div>
        </div>
        {isAdmin && <button className="btn-primary" onClick={() => open()}>+ Νέα πρώτη ύλη</button>}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>Όλες</button>
          {categories.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <span className="spacer" />
        <input className="search" placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="card muted">Καμία πρώτη ύλη ακόμα.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Υλικό</th><th>Κατηγορία</th><th>Μονάδα</th>
                {isAdmin && <><th className="num">Τιμή αγοράς</th><th className="num">Απόδοση</th><th className="num">Ωφέλιμο κόστος</th><th>Προμηθευτής</th></>}
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const p = priceMap.get(i.id);
                return (
                  <tr key={i.id} className={isAdmin ? 'click' : ''} onClick={() => isAdmin && open(i)} style={i.active ? undefined : { opacity: .55 }}>
                    <td><b>{i.name}</b>{!i.active && <span className="badge b-info" style={{ marginLeft: 8 }}>ανενεργό</span>}{i.notes && <div className="muted small">{i.notes}</div>}</td>
                    <td className="muted">{i.category ?? '—'}</td>
                    <td>{i.unit}</td>
                    {isAdmin && (
                      <>
                        <td className="num">{p ? <>{eur(p.price, 3)}<span className="muted small">/{i.unit}</span></> : <span className="badge b-warn">χωρίς τιμή</span>}</td>
                        <td className="num">{i.yield_pct < 100 ? `${i.yield_pct}%` : <span className="muted">100%</span>}</td>
                        <td className="num">{p ? <>{eur(usableUnitCost(i, p.price), 3)}<span className="muted small">/{i.unit}</span></> : '—'}</td>
                        <td className="muted">{i.supplier_id ? supMap.get(i.supplier_id) : '—'}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <Modal title={edit.id ? 'Επεξεργασία πρώτης ύλης' : 'Νέα πρώτη ύλη'} onClose={() => setEdit(null)}>
          <div className="form-grid">
            <label className="field" style={{ gridColumn: '1 / -1' }}>Όνομα
              <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="π.χ. Χοιρινός λαιμός" />
            </label>
            <label className="field">Κατηγορία
              <input list="ingcats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="π.χ. Κρέατα" />
              <datalist id="ingcats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="field">Μονάδα αγοράς
              <select value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as PurchaseUnit })}>
                <option value="kg">κιλό (kg)</option><option value="lt">λίτρο (lt)</option><option value="τεμ">τεμάχιο</option>
              </select>
            </label>
            <label className="field">Τιμή € / {u} (χωρίς ΦΠΑ)
              <input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} placeholder="0,00" />
            </label>
            <label className="field">Απόδοση %
              <input type="number" min="1" max="100" step="any" value={edit.yield_pct} onChange={(e) => setEdit({ ...edit, yield_pct: e.target.value })} />
            </label>
            <label className="field">Προμηθευτής
              <select value={edit.supplier_id} onChange={(e) => setEdit({ ...edit, supplier_id: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ justifyContent: 'flex-end' }}>
              <span className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} style={{ width: 'auto' }} /> Ενεργό
              </span>
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>Σημειώσεις
              <input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </label>
          </div>
          <p className="muted small">
            <b>Απόδοση</b>: πόσο μένει αξιοποιήσιμο μετά από καθάρισμα/κόκαλο/ψήσιμο. Π.χ. αν από 1 kg μένουν 800 g, βάλε 80%.
            {previewCost != null && !isNaN(previewCost) && <> Ωφέλιμο κόστος: <b>{eur(previewCost, 3)}/{u}</b>.</>}
          </p>
          {err && <div className="alert alert-err">{err}</div>}
          <div className="modal-actions">
            {edit.id && <button className="btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Διαγραφή</button>}
            <button onClick={() => setEdit(null)}>Άκυρο</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

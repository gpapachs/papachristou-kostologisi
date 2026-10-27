'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { buildContext, costRecipe, eur, pricing, recipesUsingIngredient } from '@/lib/costing';
import { AdminOnly, FoodCostBadge } from '@/components/Shell';

interface HistoryRow { id: number; ingredient_id: string; old_price: number | null; new_price: number; changed_at: string }

const parse = (s: string) => Number(s.replace(',', '.'));

export default function PricesPage() {
  return <AdminOnly><Prices /></AdminOnly>;
}

function Prices() {
  const { ingredients, prices, suppliers, recipes, items, ctx, reload } = useStore();
  const [tab, setTab] = useState<'update' | 'history'>('update');
  const [supplier, setSupplier] = useState('');
  const [q, setQ] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const priceMap = useMemo(() => new Map(prices.map((p) => [p.ingredient_id, p])), [prices]);
  const ingMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const changes = useMemo(() => Object.entries(edits)
    .filter(([, v]) => v.trim() !== '' && !isNaN(parse(v)) && parse(v) >= 0)
    .map(([id, v]) => ({ id, price: parse(v), old: priceMap.get(id)?.price ?? null }))
    .filter((c) => c.price !== c.old), [edits, priceMap]);

  // Επίπτωση στα πιάτα
  const impact = useMemo(() => {
    if (!changes.length) return [];
    const newPrices = new Map(prices.map((p) => [p.ingredient_id, p.price]));
    for (const c of changes) newPrices.set(c.id, c.price);
    const after = buildContext(ingredients, [...newPrices].map(([ingredient_id, price]) => ({ ingredient_id, price })), recipes, items);
    const affected = new Set<string>();
    for (const c of changes) for (const r of recipesUsingIngredient(c.id, ctx)) affected.add(r);
    const m1 = new Map(), m2 = new Map();
    return recipes.filter((r) => affected.has(r.id) && !r.is_sub && r.active).map((r) => {
      const before = costRecipe(r.id, ctx, m1).perUnit;
      const aft = costRecipe(r.id, after, m2).perUnit;
      return { r, before, after: aft, pb: pricing(r, before), pa: pricing(r, aft) };
    }).sort((a, b) => (b.after - b.before) - (a.after - a.before));
  }, [changes, prices, ingredients, recipes, items, ctx]);

  const list = ingredients
    .filter((i) => i.active)
    .filter((i) => !supplier || (supplier === '_none' ? !i.supplier_id : i.supplier_id === supplier))
    .filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function saveAll() {
    if (!changes.length) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase().from('kost_ingredient_prices').upsert(changes.map((c) => ({ ingredient_id: c.id, price: c.price })));
    if (error) { setBusy(false); setMsg({ type: 'err', text: error.message }); return; }
    await reload();
    setEdits({});
    setBusy(false);
    setMsg({ type: 'ok', text: `Ενημερώθηκαν ${changes.length} τιμές — όλα τα πιάτα ξαναϋπολογίστηκαν.` });
  }

  const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('el-GR') : '—');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ενημέρωση τιμών</h1>
          <div className="muted">Πέρνα τις νέες τιμές από τα τιμολόγια — βλέπεις αμέσως πώς επηρεάζουν τα πιάτα</div>
        </div>
        {tab === 'update' && (
          <button className="btn-primary" disabled={!changes.length || busy} onClick={saveAll}>
            {busy ? 'Αποθήκευση…' : `Αποθήκευση${changes.length ? ` (${changes.length})` : ''}`}
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={tab === 'update' ? 'on' : ''} onClick={() => setTab('update')}>Νέες τιμές</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Ιστορικό αλλαγών</button>
      </div>

      {msg && <div className={`alert ${msg.type === 'ok' ? 'alert-ok' : 'alert-err'}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      {tab === 'history' ? <History ingMap={ingMap} /> : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Όλοι οι προμηθευτές</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="_none">Χωρίς προμηθευτή</option>
            </select>
            <input className="search" placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />
            {changes.length > 0 && <button className="btn-ghost" onClick={() => setEdits({})}>Καθαρισμός αλλαγών</button>}
          </div>

          <div className="table-wrap" style={{ marginBottom: 20 }}>
            <table>
              <thead>
                <tr><th>Υλικό</th><th className="num">Τρέχουσα</th><th className="num">Ενημ.</th><th className="num">Νέα τιμή</th><th className="num">Μεταβολή</th></tr>
              </thead>
              <tbody>
                {list.map((i) => {
                  const cur = priceMap.get(i.id);
                  const v = edits[i.id] ?? '';
                  const nv = v.trim() === '' ? null : parse(v);
                  const delta = nv != null && cur && cur.price > 0 && !isNaN(nv) ? ((nv - cur.price) / cur.price) * 100 : null;
                  return (
                    <tr key={i.id}>
                      <td><b>{i.name}</b> <span className="muted small">/{i.unit}</span></td>
                      <td className="num">{cur ? eur(cur.price, 3) : <span className="badge b-warn">—</span>}</td>
                      <td className="num muted small">{fmtDate(cur?.updated_at)}</td>
                      <td className="num">
                        <input className="input-sm price-input" inputMode="decimal" value={v} placeholder={cur ? String(cur.price).replace('.', ',') : '0,00'}
                          onChange={(e) => setEdits({ ...edits, [i.id]: e.target.value })} />
                      </td>
                      <td className="num">
                        {delta != null && Math.abs(delta) > 0.001 && (
                          <span className={`badge ${delta > 0 ? 'b-bad' : 'b-ok'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={5} className="muted">Κανένα υλικό.</td></tr>}
              </tbody>
            </table>
          </div>

          {changes.length > 0 && (
            <div className="card">
              <h2>Επίπτωση στα πιάτα</h2>
              {impact.length === 0 ? <p className="muted" style={{ margin: 0 }}>Κανένα ενεργό πιάτο δεν χρησιμοποιεί αυτά τα υλικά.</p> : (
                <div className="table-wrap" style={{ boxShadow: 'none' }}>
                  <table>
                    <thead><tr><th>Πιάτο</th><th className="num">Κόστος πριν</th><th className="num">Κόστος μετά</th><th className="num">Food cost πριν</th><th className="num">Food cost μετά</th><th className="num">Προτεινόμενη τιμή</th></tr></thead>
                    <tbody>
                      {impact.map(({ r, before, after, pb, pa }) => (
                        <tr key={r.id}>
                          <td><Link href={`/recipes/edit?id=${r.id}`} style={{ color: 'var(--accent)' }}>{r.name}</Link></td>
                          <td className="num">{eur(before)}</td>
                          <td className="num"><b>{eur(after)}</b></td>
                          <td className="num"><FoodCostBadge value={pb.foodCostPct} target={r.target_food_cost} /></td>
                          <td className="num"><FoodCostBadge value={pa.foodCostPct} target={r.target_food_cost} /></td>
                          <td className="num">{eur(pa.suggestedPrice)} <span className="muted small">(τώρα {eur(r.selling_price)})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function History({ ingMap }: { ingMap: Map<string, { name: string; unit: string }> }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase().from('kost_price_history').select('*').order('changed_at', { ascending: false }).limit(300)
      .then(({ data, error }) => { if (error) setErr(error.message); else setRows((data ?? []) as HistoryRow[]); });
  }, []);
  if (err) return <div className="alert alert-err">{err}</div>;
  if (!rows) return <p className="muted">Φόρτωση…</p>;
  if (!rows.length) return <div className="card muted">Δεν υπάρχουν αλλαγές ακόμα.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Ημερομηνία</th><th>Υλικό</th><th className="num">Παλιά</th><th className="num">Νέα</th><th className="num">Μεταβολή</th></tr></thead>
        <tbody>
          {rows.map((h) => {
            const ing = ingMap.get(h.ingredient_id);
            const oldP = h.old_price == null ? null : Number(h.old_price);
            const newP = Number(h.new_price);
            const d = oldP && oldP > 0 ? ((newP - oldP) / oldP) * 100 : null;
            return (
              <tr key={h.id}>
                <td className="muted">{new Date(h.changed_at).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{ing?.name ?? '(διαγραμμένο)'} <span className="muted small">/{ing?.unit}</span></td>
                <td className="num">{eur(oldP, 3)}</td>
                <td className="num">{eur(newP, 3)}</td>
                <td className="num">{d == null ? <span className="muted small">αρχική</span> : <span className={`badge ${d > 0 ? 'b-bad' : 'b-ok'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

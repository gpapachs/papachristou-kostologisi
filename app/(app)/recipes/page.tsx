'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { costRecipe, eur, pricing } from '@/lib/costing';
import { FoodCostBadge } from '@/components/Shell';

export default function RecipesPage() {
  const { isAdmin, recipes, items, ctx } = useStore();
  const router = useRouter();
  const [tab, setTab] = useState<'dish' | 'sub'>('dish');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const list = useMemo(() => {
    const memo = new Map();
    const needle = q.trim().toLowerCase();
    return recipes
      .filter((r) => (tab === 'sub' ? r.is_sub : !r.is_sub))
      .filter((r) => showInactive || r.active)
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.category ?? '').toLowerCase().includes(needle))
      .map((r) => {
        const c = isAdmin ? costRecipe(r.id, ctx, memo) : null;
        return { r, c, p: c ? pricing(r, c.perUnit) : null, n: items.filter((i) => i.recipe_id === r.id).length };
      })
      .sort((a, b) => (a.r.category ?? 'ω').localeCompare(b.r.category ?? 'ω', 'el') || a.r.name.localeCompare(b.r.name, 'el'));
  }, [recipes, items, ctx, tab, q, isAdmin, showInactive]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Συνταγές</h1>
          <div className="muted">{isAdmin ? 'Δοσολογίες, κόστος και τιμές' : 'Δοσολογίες ανά μερίδα'}</div>
        </div>
        {isAdmin && <Link href={`/recipes/edit?id=new${tab === 'sub' ? '&sub=1' : ''}`} className="btn btn-primary">+ Νέα {tab === 'sub' ? 'ενδιάμεση' : 'συνταγή'}</Link>}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={tab === 'dish' ? 'on' : ''} onClick={() => setTab('dish')}>Πιάτα</button>
          <button className={tab === 'sub' ? 'on' : ''} onClick={() => setTab('sub')}>Ενδιάμεσα (σάλτσες, μαρινάδες…)</button>
        </div>
        <span className="spacer" />
        {isAdmin && (
          <label className="row small muted" style={{ gap: 6 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: 'auto' }} /> ανενεργές
          </label>
        )}
        <input className="search" placeholder="Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="card muted">Δεν υπάρχουν {tab === 'sub' ? 'ενδιάμεσα παρασκευάσματα' : 'συνταγές'} ακόμα.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Όνομα</th><th>Κατηγορία</th>
                <th className="num">{tab === 'sub' ? 'Παρτίδα' : 'Μερίδες'}</th><th className="num">Υλικά</th>
                {isAdmin && <th className="num">{tab === 'sub' ? 'Κόστος / μονάδα' : 'Κόστος μερίδας'}</th>}
                {isAdmin && tab === 'dish' && <th className="num">Food cost</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(({ r, c, p, n }) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/recipes/edit?id=${r.id}`)}>
                  <td><b>{r.name}</b>{!r.active && <span className="badge b-info" style={{ marginLeft: 8 }}>ανενεργή</span>}</td>
                  <td className="muted">{r.category ?? '—'}</td>
                  <td className="num">{r.yield_qty} {r.yield_unit}</td>
                  <td className="num">{n}</td>
                  {isAdmin && c && <td className="num">{eur(c.perUnit)}{tab === 'sub' && <span className="muted small"> /{r.yield_unit}</span>}{!c.complete && <div className="problem">ελλείψεις</div>}</td>}
                  {isAdmin && tab === 'dish' && p && <td className="num"><FoodCostBadge value={p.foodCostPct} target={r.target_food_cost} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

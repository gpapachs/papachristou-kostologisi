'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { costRecipe, eur, pct, pricing } from '@/lib/costing';
import { FoodCostBadge } from '@/components/Shell';

type SortKey = 'name' | 'fc' | 'margin';

export default function Dashboard() {
  const { isAdmin, recipes, ingredients, prices, ctx } = useStore();
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>('fc');
  const [cat, setCat] = useState('');

  useEffect(() => { if (!isAdmin) router.replace('/recipes'); }, [isAdmin, router]);

  const rows = useMemo(() => {
    const memo = new Map();
    return recipes.filter((r) => !r.is_sub && r.active).map((r) => {
      const c = costRecipe(r.id, ctx, memo);
      return { r, c, p: pricing(r, c.perUnit) };
    });
  }, [recipes, ctx]);

  if (!isAdmin) return null;

  const categories = [...new Set(rows.map((x) => x.r.category).filter(Boolean))] as string[];
  const shown = rows
    .filter((x) => !cat || x.r.category === cat)
    .sort((a, b) =>
      sort === 'name' ? a.r.name.localeCompare(b.r.name, 'el')
      : sort === 'fc' ? (b.p.foodCostPct ?? -1) - (a.p.foodCostPct ?? -1)
      : (b.p.margin ?? -1e9) - (a.p.margin ?? -1e9));

  const priced = rows.filter((x) => x.p.foodCostPct != null);
  const avg = priced.length ? priced.reduce((s, x) => s + (x.p.foodCostPct ?? 0), 0) / priced.length : null;
  const over = rows.filter((x) => x.p.overTarget).length;
  const priceSet = new Set(prices.map((p) => p.ingredient_id));
  const noPrice = ingredients.filter((i) => i.active && !priceSet.has(i.id)).length;
  const incomplete = rows.filter((x) => !x.c.complete).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Επισκόπηση</h1>
          <div className="muted">Food cost όλων των πιάτων με τις τρέχουσες τιμές αγοράς</div>
        </div>
        <Link href="/recipes/edit?id=new" className="btn btn-primary">+ Νέα συνταγή</Link>
      </div>

      <div className="grid-stats">
        <div className="stat"><div className="label">Πιάτα</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label">Μέσο food cost</div><div className="value">{pct(avg)}</div></div>
        <div className={`stat ${over ? 'stat-bad' : ''}`}>
          <div className="label">Πάνω από τον στόχο</div><div className="value">{over}</div>
        </div>
        <div className={`stat ${noPrice ? 'stat-warn' : ''}`}>
          <div className="label">Υλικά χωρίς τιμή</div><div className="value">{noPrice}</div>
        </div>
      </div>

      {incomplete > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          {incomplete} πιάτα έχουν ελλείψεις (υλικό χωρίς τιμή ή λάθος μονάδα) — το κόστος τους είναι πιθανώς χαμηλότερο από το πραγματικό.
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>Όλα</button>
          {categories.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <span className="spacer" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ width: 'auto' }}>
          <option value="fc">Ταξινόμηση: Food cost ↓</option>
          <option value="margin">Ταξινόμηση: Μικτό κέρδος ↓</option>
          <option value="name">Ταξινόμηση: Όνομα</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <h2>Ξεκίνα εδώ</h2>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Πρόσθεσε <Link href="/ingredients" style={{ color: 'var(--accent)' }}>πρώτες ύλες</Link> με τιμή αγοράς.</li>
            <li>Φτιάξε τις <Link href="/recipes" style={{ color: 'var(--accent)' }}>συνταγές</Link> με τη δοσολογία ανά μερίδα.</li>
            <li>Βάλε τιμή καταλόγου — εδώ θα δεις food cost και κέρδος.</li>
          </ol>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Πιάτο</th><th className="num">Κόστος μερίδας</th><th className="num">Τιμή καταλόγου</th>
                <th className="num">Food cost</th><th className="num">Μικτό κέρδος</th><th className="num">Προτεινόμενη τιμή</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r, c, p }) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/recipes/edit?id=${r.id}`)}>
                  <td>
                    <b>{r.name}</b>
                    <div className="muted small">{r.category ?? '—'}{!c.complete && <span className="problem"> · ελλείψεις</span>}</div>
                  </td>
                  <td className="num">{eur(c.perUnit)}</td>
                  <td className="num">{eur(r.selling_price)}</td>
                  <td className="num"><FoodCostBadge value={p.foodCostPct} target={r.target_food_cost} /></td>
                  <td className="num">{eur(p.margin)}</td>
                  <td className="num muted">{eur(p.suggestedPrice)} <span className="small">({r.target_food_cost}%)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import {
  buildContext, compatibleUnits, costRecipe, eur, pct, pricing,
  type ItemUnit, type Recipe, type RecipeItem, type YieldUnit,
} from '@/lib/costing';
import { FoodCostBadge } from '@/components/Shell';

interface DraftLine { key: string; kind: 'ing' | 'sub'; ref: string; qty: string; unit: ItemUnit; note: string }

const DRAFT_ID = '__draft__';
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

const emptyRecipe = (isSub: boolean): Recipe => ({
  id: DRAFT_ID, name: '', category: null, is_sub: isSub,
  yield_qty: 1, yield_unit: isSub ? 'kg' : 'μερίδα',
  selling_price: null, vat_rate: 13, target_food_cost: 30, instructions: null, active: true,
});

const fmtQty = (v: number) => v.toLocaleString('el-GR', { maximumFractionDigits: 3 });

export default function RecipeEditor() {
  const params = useSearchParams();
  const id = params.get('id') || 'new';
  const isNew = id === 'new';
  const wantSub = params.has('sub');
  const { isAdmin, recipes, items, ingredients, prices, ctx, reload } = useStore();
  const router = useRouter();

  const existing = recipes.find((r) => r.id === id);
  const [form, setForm] = useState<Recipe | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [scale, setScale] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // αρχικοποίηση φόρμας (και όταν αλλάζει η συνταγή στο URL)
  useEffect(() => {
    if (loadedFor === id) return;
    setMsg(null); setScale('');
    if (isNew) {
      setLoadedFor(id);
      setForm(emptyRecipe(wantSub));
      setLines([]);
    } else if (existing) {
      setLoadedFor(id);
      setForm({ ...existing });
      setLines(items.filter((i) => i.recipe_id === existing.id).sort((a, b) => a.sort - b.sort).map((i) => ({
        key: newKey(), kind: i.ingredient_id ? 'ing' : 'sub', ref: (i.ingredient_id ?? i.sub_recipe_id)!,
        qty: String(i.qty), unit: i.unit, note: i.note ?? '',
      })));
    }
  }, [id, loadedFor, isNew, wantSub, existing, items]);

  // ζωντανός υπολογισμός με το πρόχειρο
  const live = useMemo(() => {
    if (!form) return null;
    const rid = isNew ? DRAFT_ID : form.id;
    const draftItems: RecipeItem[] = lines
      .filter((l) => l.ref && Number(l.qty) > 0)
      .map((l, i) => ({
        id: l.key, recipe_id: rid, ingredient_id: l.kind === 'ing' ? l.ref : null, sub_recipe_id: l.kind === 'sub' ? l.ref : null,
        qty: Number(l.qty), unit: l.unit, note: l.note || null, sort: i,
      }));
    const otherRecipes = recipes.filter((r) => r.id !== rid);
    const draftRecipe: Recipe = { ...form, id: rid, yield_qty: Number(form.yield_qty) || 1 };
    const c2 = buildContext(ingredients, prices, [...otherRecipes, draftRecipe], [...items.filter((i) => i.recipe_id !== rid), ...draftItems]);
    const cost = costRecipe(rid, c2);
    return { cost, price: pricing(draftRecipe, cost.perUnit), byKey: new Map(cost.lines.map((l) => [l.item.id, l])) };
  }, [form, lines, recipes, items, ingredients, prices, isNew]);

  if (!isNew && !existing) {
    return <div className="card">Η συνταγή δεν βρέθηκε. <Link href="/recipes" style={{ color: 'var(--accent)' }}>Πίσω</Link></div>;
  }
  if (!form || !live) return null;

  // ---------- Προβολή για προσωπικό ----------
  if (!isAdmin) return <StaffView recipe={form} lines={lines} scale={scale} setScale={setScale} />;

  // ---------- Επεξεργασία (admin) ----------
  const set = <K extends keyof Recipe>(k: K, v: Recipe[K]) => setForm({ ...form, [k]: v });
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const recById = new Map(recipes.map((r) => [r.id, r]));
  const subOptions = recipes.filter((r) => r.is_sub && r.id !== form.id);
  const categories = [...new Set(recipes.map((r) => r.category).filter(Boolean))] as string[];

  function baseUnitOf(l: DraftLine) {
    if (l.kind === 'ing') return ingById.get(l.ref)?.unit;
    return recById.get(l.ref)?.yield_unit;
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const n = { ...l, ...patch };
      if (patch.ref !== undefined || patch.kind !== undefined) {
        const base = n.kind === 'ing' ? ingById.get(n.ref)?.unit : recById.get(n.ref)?.yield_unit;
        if (base) {
          const allowed = compatibleUnits(base);
          if (!allowed.includes(n.unit)) n.unit = base === 'kg' ? 'g' : base === 'lt' ? 'ml' : allowed[0];
        }
      }
      return n;
    }));
  }

  function move(key: string, dir: -1 | 1) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls]; [c[i], c[j]] = [c[j], c[i]]; return c;
    });
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) { setMsg({ type: 'err', text: 'Δώσε όνομα' }); return; }
    const bad = lines.find((l) => !l.ref || !(Number(l.qty) > 0));
    if (bad) { setMsg({ type: 'err', text: 'Κάθε γραμμή χρειάζεται υλικό και ποσότητα > 0' }); return; }
    setSaving(true); setMsg(null);
    const sb = supabase();
    const payload = {
      name: form.name.trim(), category: form.category?.trim() || null, is_sub: form.is_sub,
      yield_qty: Number(form.yield_qty) || 1, yield_unit: form.yield_unit,
      selling_price: form.is_sub || form.selling_price == null || String(form.selling_price) === '' ? null : Number(form.selling_price),
      vat_rate: Number(form.vat_rate), target_food_cost: Number(form.target_food_cost),
      instructions: form.instructions?.trim() || null, active: form.active, updated_at: new Date().toISOString(),
    };
    let rid = form.id;
    if (isNew) {
      const { data, error } = await sb.from('kost_recipes').insert(payload).select('id').single();
      if (error || !data) { setSaving(false); setMsg({ type: 'err', text: error?.message ?? 'Σφάλμα' }); return; }
      rid = data.id;
    } else {
      const { error } = await sb.from('kost_recipes').update(payload).eq('id', rid);
      if (error) { setSaving(false); setMsg({ type: 'err', text: error.message }); return; }
      const { error: dErr } = await sb.from('kost_recipe_items').delete().eq('recipe_id', rid);
      if (dErr) { setSaving(false); setMsg({ type: 'err', text: dErr.message }); return; }
    }
    if (lines.length) {
      const { error } = await sb.from('kost_recipe_items').insert(lines.map((l, i) => ({
        recipe_id: rid, ingredient_id: l.kind === 'ing' ? l.ref : null, sub_recipe_id: l.kind === 'sub' ? l.ref : null,
        qty: Number(l.qty), unit: l.unit, note: l.note.trim() || null, sort: i,
      })));
      if (error) { setSaving(false); setMsg({ type: 'err', text: error.message }); return; }
    }
    await reload();
    setSaving(false);
    if (isNew) router.replace(`/recipes/edit?id=${rid}`);
    else setMsg({ type: 'ok', text: 'Αποθηκεύτηκε' });
  }

  async function duplicate() {
    if (!form) return;
    const sb = supabase();
    const { data, error } = await sb.from('kost_recipes').insert({
      name: `${form.name} (αντίγραφο)`, category: form.category, is_sub: form.is_sub, yield_qty: form.yield_qty,
      yield_unit: form.yield_unit, selling_price: form.selling_price, vat_rate: form.vat_rate,
      target_food_cost: form.target_food_cost, instructions: form.instructions, active: form.active,
    }).select('id').single();
    if (error || !data) { setMsg({ type: 'err', text: error?.message ?? 'Σφάλμα' }); return; }
    if (lines.length) {
      await sb.from('kost_recipe_items').insert(lines.map((l, i) => ({
        recipe_id: data.id, ingredient_id: l.kind === 'ing' ? l.ref : null, sub_recipe_id: l.kind === 'sub' ? l.ref : null,
        qty: Number(l.qty), unit: l.unit, note: l.note || null, sort: i,
      })));
    }
    await reload();
    router.push(`/recipes/edit?id=${data.id}`);
  }

  async function remove() {
    if (!form || !confirm(`Διαγραφή «${form.name}»;`)) return;
    const used = items.filter((i) => i.sub_recipe_id === form.id).map((i) => recById.get(i.recipe_id)?.name);
    if (used.length) { setMsg({ type: 'err', text: `Χρησιμοποιείται στα: ${used.join(', ')}. Αφαίρεσέ την από εκεί πρώτα ή κάν' την ανενεργή.` }); return; }
    const { error } = await supabase().from('kost_recipes').delete().eq('id', form.id);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    await reload();
    router.replace('/recipes');
  }

  const { cost, price } = live;
  const usedIn = !isNew ? items.filter((i) => i.sub_recipe_id === form.id).map((i) => recById.get(i.recipe_id)).filter(Boolean) as Recipe[] : [];
  const fcPct = price.foodCostPct;
  const meterColor = fcPct == null ? 'var(--line)' : fcPct <= form.target_food_cost ? 'var(--ok)' : fcPct <= form.target_food_cost + 5 ? 'var(--warn)' : 'var(--bad)';

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/recipes" className="muted small">← Συνταγές</Link>
          <h1>{isNew ? (form.is_sub ? 'Νέο ενδιάμεσο' : 'Νέα συνταγή') : form.name || 'Συνταγή'}</h1>
          {form.is_sub && <span className="badge b-sub">Ενδιάμεσο παρασκεύασμα</span>}
        </div>
        <div className="row no-print">
          {!isNew && <button onClick={duplicate}>Αντίγραφο</button>}
          {!isNew && <button className="btn-danger" onClick={remove}>Διαγραφή</button>}
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.type === 'ok' ? 'alert-ok' : 'alert-err'}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      {/* Σύνοψη κόστους */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cost-bar">
          <div>
            <div className="muted small">Κόστος παρτίδας</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{eur(cost.total)}</div>
          </div>
          <div>
            <div className="muted small">Κόστος ανά {form.yield_unit}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{eur(cost.perUnit)}</div>
          </div>
          {!form.is_sub && (
            <>
              <div>
                <div className="muted small">Food cost (στόχος {form.target_food_cost}%)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{pct(fcPct)}</div>
                <div className="meter" title={`Στόχος ${form.target_food_cost}%`}>
                  <div style={{ width: `${Math.min(100, (fcPct ?? 0) * 2)}%`, background: meterColor }} />
                  <i style={{ left: `${Math.min(100, Number(form.target_food_cost) * 2)}%` }} />
                </div>
              </div>
              <div>
                <div className="muted small">Μικτό κέρδος / μερίδα</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{eur(price.margin)}</div>
                <div className="muted small">καθαρή τιμή {eur(price.netPrice)}</div>
              </div>
              <div>
                <div className="muted small">Προτεινόμενη τιμή (με ΦΠΑ)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{eur(price.suggestedPrice)}</div>
                <button className="btn-ghost small" style={{ padding: 0, color: 'var(--accent)' }}
                  onClick={() => set('selling_price', price.suggestedPrice)}>Χρήση αυτής →</button>
              </div>
            </>
          )}
        </div>
        {!cost.complete && lines.length > 0 && <div className="problem" style={{ marginTop: 10 }}>Κάποιες γραμμές δεν κοστολογούνται — δες παρακάτω.</div>}
      </div>

      {/* Στοιχεία */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Στοιχεία</h2>
        <div className="form-grid">
          <label className="field" style={{ gridColumn: 'span 2' }}>Όνομα
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="π.χ. Μερίδα σουβλάκι χοιρινό" />
          </label>
          <label className="field">Κατηγορία
            <input list="cats" value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="π.χ. Ψητά" />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">Τύπος
            <select value={form.is_sub ? 'sub' : 'dish'} onChange={(e) => {
              const sub = e.target.value === 'sub';
              setForm({ ...form, is_sub: sub, yield_unit: sub ? (form.yield_unit === 'μερίδα' ? 'kg' : form.yield_unit) : 'μερίδα' });
            }}>
              <option value="dish">Πιάτο καταλόγου</option>
              <option value="sub">Ενδιάμεσο (σάλτσα, μαρινάδα…)</option>
            </select>
          </label>
          <label className="field">{form.is_sub ? 'Η παρτίδα βγάζει' : 'Μερίδες που βγάζει'}
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="number" step="any" min="0" value={form.yield_qty} onChange={(e) => set('yield_qty', e.target.value as unknown as number)} />
              {form.is_sub ? (
                <select value={form.yield_unit} onChange={(e) => set('yield_unit', e.target.value as YieldUnit)} style={{ width: 90 }}>
                  <option value="kg">kg</option><option value="lt">lt</option><option value="τεμ">τεμ</option><option value="μερίδα">μερίδα</option>
                </select>
              ) : <span className="muted">μερ.</span>}
            </div>
          </label>
          {!form.is_sub && (
            <>
              <label className="field">Τιμή καταλόγου (με ΦΠΑ)
                <input type="number" step="0.10" min="0" value={form.selling_price ?? ''} onChange={(e) => set('selling_price', e.target.value === '' ? null : (e.target.value as unknown as number))} />
              </label>
              <label className="field">ΦΠΑ %
                <select value={form.vat_rate} onChange={(e) => set('vat_rate', Number(e.target.value))}>
                  <option value={13}>13% (φαγητό)</option><option value={24}>24% (ποτά)</option><option value={6}>6%</option><option value={0}>0%</option>
                </select>
              </label>
              <label className="field">Στόχος food cost %
                <input type="number" step="1" min="1" max="100" value={form.target_food_cost} onChange={(e) => set('target_food_cost', e.target.value as unknown as number)} />
              </label>
            </>
          )}
          <label className="field" style={{ justifyContent: 'flex-end' }}>
            <span className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} style={{ width: 'auto' }} /> Ενεργή
            </span>
          </label>
        </div>
      </div>

      {/* Υλικά */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="row" style={{ padding: '16px 18px 8px' }}>
          <h2 style={{ margin: 0 }}>Υλικά {form.is_sub ? 'παρτίδας' : `για ${form.yield_qty} μερίδ${Number(form.yield_qty) === 1 ? 'α' : 'ες'}`}</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th style={{ width: 54 }}></th><th>Υλικό</th><th className="num">Ποσότητα</th><th>Μονάδα</th><th>Σημείωση</th><th className="num">Κόστος</th><th className="num">%</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const base = baseUnitOf(l);
                const units = base ? compatibleUnits(base) : (['g', 'kg', 'ml', 'lt', 'τεμ'] as ItemUnit[]);
                const lc = live.byKey.get(l.key);
                return (
                  <tr key={l.key}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-ghost icon-btn" onClick={() => move(l.key, -1)} aria-label="Πάνω">↑</button>
                      <button className="btn-ghost icon-btn" onClick={() => move(l.key, 1)} aria-label="Κάτω">↓</button>
                    </td>
                    <td style={{ minWidth: 220 }}>
                      <select className="input-sm" value={`${l.kind}:${l.ref}`} onChange={(e) => {
                        const [kind, ref] = e.target.value.split(':') as ['ing' | 'sub', string];
                        updateLine(l.key, { kind, ref });
                      }}>
                        <option value="ing:">— διάλεξε —</option>
                        <optgroup label="Πρώτες ύλες">
                          {ingredients.filter((i) => i.active || i.id === l.ref).map((i) => <option key={i.id} value={`ing:${i.id}`}>{i.name} ({i.unit})</option>)}
                        </optgroup>
                        {subOptions.length > 0 && (
                          <optgroup label="Ενδιάμεσα">
                            {subOptions.map((r) => <option key={r.id} value={`sub:${r.id}`}>{r.name} ({r.yield_unit})</option>)}
                          </optgroup>
                        )}
                      </select>
                      {lc?.problem && <div className="problem">{lc.problem}</div>}
                    </td>
                    <td className="num"><input className="input-sm qty-input" type="number" step="any" min="0" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} /></td>
                    <td><select className="input-sm" style={{ width: 90 }} value={l.unit} onChange={(e) => updateLine(l.key, { unit: e.target.value as ItemUnit })}>
                      {units.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select></td>
                    <td><input className="input-sm" value={l.note} onChange={(e) => updateLine(l.key, { note: e.target.value })} placeholder="π.χ. ωμό βάρος" /></td>
                    <td className="num">{eur(lc?.cost ?? null, 3)}</td>
                    <td className="num muted">{lc?.cost != null && cost.total > 0 ? `${((lc.cost / cost.total) * 100).toFixed(0)}%` : ''}</td>
                    <td><button className="btn-ghost icon-btn" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Αφαίρεση">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
            {lines.length > 0 && (
              <tfoot><tr><td></td><td colSpan={4}>Σύνολο</td><td className="num">{eur(cost.total, 3)}</td><td></td><td></td></tr></tfoot>
            )}
          </table>
        </div>
        <div style={{ padding: 14 }}>
          <button onClick={() => setLines([...lines, { key: newKey(), kind: 'ing', ref: '', qty: '', unit: 'g', note: '' }])}>+ Προσθήκη υλικού</button>
          {ingredients.length === 0 && <span className="muted small" style={{ marginLeft: 10 }}>Πρώτα πρόσθεσε <Link href="/ingredients" style={{ color: 'var(--accent)' }}>πρώτες ύλες</Link>.</span>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Οδηγίες εκτέλεσης</h2>
        <textarea value={form.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} placeholder="Βήματα, χρόνοι ψησίματος, σερβίρισμα… (τα βλέπει και το προσωπικό)" />
      </div>

      {usedIn.length > 0 && (
        <div className="card muted small">Χρησιμοποιείται σε: {[...new Set(usedIn.map((r) => r.name))].join(', ')}</div>
      )}
    </>
  );
}

/** Καρτέλα συνταγής για το προσωπικό — δοσολογίες χωρίς κόστη. */
function StaffView({ recipe, lines, scale, setScale }: { recipe: Recipe; lines: DraftLine[]; scale: string; setScale: (v: string) => void }) {
  const { ingredients, recipes } = useStore();
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const recById = new Map(recipes.map((r) => [r.id, r]));
  const baseQty = Number(recipe.yield_qty) || 1;
  const target = Number(scale) > 0 ? Number(scale) : baseQty;
  const factor = target / baseQty;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/recipes" className="muted small no-print">← Συνταγές</Link>
          <h1>{recipe.name}</h1>
          <div className="muted">{recipe.category ?? ''}{recipe.is_sub && ' · ενδιάμεσο παρασκεύασμα'}</div>
        </div>
        <div className="row no-print">
          <label className="row small muted" style={{ gap: 6 }}>
            Για
            <input type="number" min="0" step="any" value={scale} placeholder={String(baseQty)} onChange={(e) => setScale(e.target.value)} style={{ width: 80 }} />
            {recipe.yield_unit}
          </label>
          <button onClick={() => window.print()}>Εκτύπωση</button>
        </div>
      </div>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>Υλικό</th><th className="num">Ποσότητα</th><th>Σημείωση</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const name = l.kind === 'ing' ? ingById.get(l.ref)?.name : recById.get(l.ref)?.name;
              return (
                <tr key={l.key}>
                  <td>{l.kind === 'sub' ? <Link href={`/recipes/edit?id=${l.ref}`} style={{ color: 'var(--accent)' }}>{name}</Link> : name}</td>
                  <td className="num"><b>{fmtQty(Number(l.qty) * factor)}</b> {l.unit}</td>
                  <td className="muted">{l.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Ποσότητες για {fmtQty(target)} {recipe.yield_unit}.</p>
      {recipe.instructions && (
        <div className="card"><h2>Οδηγίες</h2><div style={{ whiteSpace: 'pre-wrap' }}>{recipe.instructions}</div></div>
      )}
    </>
  );
}

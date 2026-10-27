'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import { buildContext, type CostContext, type Ingredient, type Recipe, type RecipeItem } from './costing';

export interface Profile { id: string; username: string; full_name: string | null; role: 'admin' | 'staff' }
export interface Supplier { id: string; name: string; phone: string | null; notes: string | null }
export interface PriceRow { ingredient_id: string; price: number; updated_at: string }

interface Store {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  ingredients: Ingredient[];
  prices: PriceRow[];
  suppliers: Supplier[];
  recipes: Recipe[];
  items: RecipeItem[];
  ctx: CostContext;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore εκτός AppProvider');
  return s;
}

const num = <T extends object>(rows: T[] | null, keys: (keyof T)[]): T[] =>
  (rows ?? []).map((r) => {
    const o = { ...r } as Record<string, unknown>;
    for (const k of keys) if (o[k as string] != null) o[k as string] = Number(o[k as string]);
    return o as T;
  });

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [items, setItems] = useState<RecipeItem[]>([]);

  const loadData = useCallback(async (admin: boolean) => {
    const sb = supabase();
    const [ing, sup, rec, itm, pr] = await Promise.all([
      sb.from('kost_ingredients').select('*').order('name'),
      sb.from('kost_suppliers').select('*').order('name'),
      sb.from('kost_recipes').select('*').order('name'),
      sb.from('kost_recipe_items').select('*'),
      admin ? sb.from('kost_ingredient_prices').select('*') : Promise.resolve({ data: [], error: null }),
    ]);
    const firstErr = [ing, sup, rec, itm, pr].find((r) => r.error)?.error;
    if (firstErr) { setError(firstErr.message); return; }
    setError(null);
    setIngredients(num(ing.data as Ingredient[], ['yield_pct']));
    setSuppliers((sup.data ?? []) as Supplier[]);
    setRecipes(num(rec.data as Recipe[], ['yield_qty', 'selling_price', 'vat_rate', 'target_food_cost']));
    setItems(num(itm.data as RecipeItem[], ['qty', 'sort']));
    setPrices(num(pr.data as PriceRow[], ['price']));
  }, []);

  useEffect(() => {
    const sb = supabase();
    let cancelled = false;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (!data.session) { router.replace('/login'); return; }
      setSession(data.session);
      const { data: p, error: pErr } = await sb.from('kost_profiles').select('*').eq('id', data.session.user.id).maybeSingle();
      if (cancelled) return;
      if (pErr || !p) {
        setError(pErr?.message ?? 'Ο λογαριασμός δεν έχει πρόσβαση σε αυτή την εφαρμογή.');
        setLoading(false);
        return;
      }
      setProfile(p as Profile);
      await loadData(p.role === 'admin');
      if (!cancelled) setLoading(false);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
      else if (s) setSession(s);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router, loadData]);

  const isAdmin = profile?.role === 'admin';
  const reload = useCallback(() => loadData(isAdmin), [loadData, isAdmin]);
  const signOut = useCallback(async () => { await supabase().auth.signOut(); router.replace('/login'); }, [router]);
  const ctx = useMemo(() => buildContext(ingredients, prices, recipes, items), [ingredients, prices, recipes, items]);

  const value: Store = {
    session, profile, isAdmin, loading, error,
    ingredients, prices, suppliers, recipes, items, ctx, reload, signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Κλήση συνάρτησης της βάσης (rpc) — πετάει Error με το ελληνικό μήνυμα της βάσης. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

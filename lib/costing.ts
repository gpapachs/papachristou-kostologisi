// Καθαρή λογική κοστολόγησης — χωρίς εξαρτήσεις, για να ελέγχεται εύκολα.

export type PurchaseUnit = 'kg' | 'lt' | 'τεμ';
export type YieldUnit = 'μερίδα' | 'kg' | 'lt' | 'τεμ';
export type ItemUnit = 'g' | 'kg' | 'ml' | 'lt' | 'τεμ' | 'μερίδα';

export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  unit: PurchaseUnit;
  yield_pct: number;
  supplier_id: string | null;
  notes: string | null;
  active: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  category: string | null;
  is_sub: boolean;
  yield_qty: number;
  yield_unit: YieldUnit;
  selling_price: number | null;
  vat_rate: number;
  target_food_cost: number;
  instructions: string | null;
  active: boolean;
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  qty: number;
  unit: ItemUnit;
  note: string | null;
  sort: number;
}

/** Οικογένεια μονάδας και συντελεστής προς τη βασική μονάδα (kg, lt, τεμ, μερίδα). */
const UNIT_INFO: Record<ItemUnit, { family: string; factor: number }> = {
  g: { family: 'mass', factor: 0.001 },
  kg: { family: 'mass', factor: 1 },
  ml: { family: 'vol', factor: 0.001 },
  lt: { family: 'vol', factor: 1 },
  τεμ: { family: 'count', factor: 1 },
  μερίδα: { family: 'portion', factor: 1 },
};

export function unitFamily(u: ItemUnit | PurchaseUnit | YieldUnit): string {
  return UNIT_INFO[u as ItemUnit].family;
}

/** Μονάδες που επιτρέπονται σε γραμμή συνταγής για υλικό/υπο-συνταγή με τη δοσμένη βασική μονάδα. */
export function compatibleUnits(base: PurchaseUnit | YieldUnit): ItemUnit[] {
  const fam = unitFamily(base);
  return (Object.keys(UNIT_INFO) as ItemUnit[]).filter((u) => UNIT_INFO[u].family === fam);
}

/** Μετατρέπει ποσότητα στη βασική μονάδα. Επιστρέφει null αν οι μονάδες δεν ταιριάζουν. */
export function toBase(qty: number, unit: ItemUnit, base: PurchaseUnit | YieldUnit): number | null {
  const a = UNIT_INFO[unit];
  if (!a || a.family !== unitFamily(base)) return null;
  return qty * a.factor;
}

export interface LineCost {
  item: RecipeItem;
  name: string;
  cost: number | null; // null = λείπει τιμή ή λάθος μονάδα
  problem?: string;
}

export interface RecipeCost {
  total: number;          // κόστος ολόκληρης της παρτίδας
  perUnit: number;        // ανά μερίδα / kg / lt / τεμ
  lines: LineCost[];
  complete: boolean;      // false αν κάποια γραμμή δεν κοστολογήθηκε
}

export interface CostContext {
  ingredients: Map<string, Ingredient>;
  prices: Map<string, number>;           // ingredient_id -> τιμή ανά μονάδα αγοράς
  recipes: Map<string, Recipe>;
  itemsByRecipe: Map<string, RecipeItem[]>;
}

export function buildContext(
  ingredients: Ingredient[],
  prices: { ingredient_id: string; price: number }[],
  recipes: Recipe[],
  items: RecipeItem[],
): CostContext {
  const itemsByRecipe = new Map<string, RecipeItem[]>();
  for (const it of items) {
    const arr = itemsByRecipe.get(it.recipe_id) ?? [];
    arr.push(it);
    itemsByRecipe.set(it.recipe_id, arr);
  }
  for (const arr of itemsByRecipe.values()) arr.sort((a, b) => a.sort - b.sort);
  return {
    ingredients: new Map(ingredients.map((i) => [i.id, i])),
    prices: new Map(prices.map((p) => [p.ingredient_id, Number(p.price)])),
    recipes: new Map(recipes.map((r) => [r.id, r])),
    itemsByRecipe,
  };
}

/** Κόστος ανά ωφέλιμη μονάδα υλικού (λαμβάνει υπόψη την απόδοση). */
export function usableUnitCost(ing: Ingredient, price: number | undefined): number | null {
  if (price === undefined || price === null || isNaN(price)) return null;
  const y = Number(ing.yield_pct) || 100;
  return price / (y / 100);
}

export function costRecipe(
  recipeId: string,
  ctx: CostContext,
  memo: Map<string, RecipeCost> = new Map(),
  stack: Set<string> = new Set(),
): RecipeCost {
  const cached = memo.get(recipeId);
  if (cached) return cached;
  const recipe = ctx.recipes.get(recipeId);
  if (!recipe) return { total: 0, perUnit: 0, lines: [], complete: false };

  stack.add(recipeId);
  const lines: LineCost[] = [];
  for (const item of ctx.itemsByRecipe.get(recipeId) ?? []) {
    const qty = Number(item.qty);
    if (item.ingredient_id) {
      const ing = ctx.ingredients.get(item.ingredient_id);
      if (!ing) { lines.push({ item, name: '(διαγραμμένο υλικό)', cost: null, problem: 'Δεν βρέθηκε' }); continue; }
      const unitCost = usableUnitCost(ing, ctx.prices.get(ing.id));
      const base = toBase(qty, item.unit, ing.unit);
      if (base === null) { lines.push({ item, name: ing.name, cost: null, problem: `Η μονάδα ${item.unit} δεν ταιριάζει με ${ing.unit}` }); continue; }
      if (unitCost === null) { lines.push({ item, name: ing.name, cost: null, problem: 'Χωρίς τιμή αγοράς' }); continue; }
      lines.push({ item, name: ing.name, cost: base * unitCost });
    } else if (item.sub_recipe_id) {
      const sub = ctx.recipes.get(item.sub_recipe_id);
      if (!sub) { lines.push({ item, name: '(διαγραμμένη συνταγή)', cost: null, problem: 'Δεν βρέθηκε' }); continue; }
      if (stack.has(sub.id)) { lines.push({ item, name: sub.name, cost: null, problem: 'Κυκλική αναφορά συνταγών' }); continue; }
      const subCost = costRecipe(sub.id, ctx, memo, stack);
      const base = toBase(qty, item.unit, sub.yield_unit);
      if (base === null) { lines.push({ item, name: sub.name, cost: null, problem: `Η μονάδα ${item.unit} δεν ταιριάζει με ${sub.yield_unit}` }); continue; }
      lines.push({
        item, name: sub.name, cost: base * subCost.perUnit,
        problem: subCost.complete ? undefined : 'Η υπο-συνταγή έχει ελλείψεις',
      });
    }
  }
  stack.delete(recipeId);

  const total = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  const result: RecipeCost = {
    total,
    perUnit: total / (Number(recipe.yield_qty) || 1),
    lines,
    complete: lines.length > 0 && lines.every((l) => l.cost !== null && !l.problem),
  };
  memo.set(recipeId, result);
  return result;
}

export interface Pricing {
  netPrice: number | null;        // τιμή πώλησης χωρίς ΦΠΑ
  foodCostPct: number | null;     // κόστος / καθαρή τιμή
  margin: number | null;          // μικτό κέρδος ανά μερίδα (χωρίς ΦΠΑ)
  suggestedPrice: number;         // τιμή με ΦΠΑ για να πιάσει τον στόχο
  overTarget: boolean;
}

export function pricing(recipe: Recipe, costPerPortion: number): Pricing {
  const vat = Number(recipe.vat_rate) / 100;
  const target = Number(recipe.target_food_cost) / 100 || 0.3;
  const gross = recipe.selling_price == null ? null : Number(recipe.selling_price);
  const net = gross == null ? null : gross / (1 + vat);
  const pct = net && net > 0 ? (costPerPortion / net) * 100 : null;
  return {
    netPrice: net,
    foodCostPct: pct,
    margin: net == null ? null : net - costPerPortion,
    suggestedPrice: roundPrice((costPerPortion / target) * (1 + vat)),
    overTarget: pct !== null && pct > Number(recipe.target_food_cost),
  };
}

/** Στρογγυλεύει προς τα πάνω στα 10 λεπτά — πρακτικό για κατάλογο. */
export function roundPrice(v: number): number {
  return Math.ceil(v * 10 - 1e-9) / 10;
}

/** Ποιες συνταγές επηρεάζονται (άμεσα ή μέσω υπο-συνταγής) από ένα υλικό. */
export function recipesUsingIngredient(ingredientId: string, ctx: CostContext): Set<string> {
  const direct = new Set<string>();
  for (const [rid, items] of ctx.itemsByRecipe) {
    if (items.some((i) => i.ingredient_id === ingredientId)) direct.add(rid);
  }
  const result = new Set(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [rid, items] of ctx.itemsByRecipe) {
      if (result.has(rid)) continue;
      if (items.some((i) => i.sub_recipe_id && result.has(i.sub_recipe_id))) { result.add(rid); changed = true; }
    }
  }
  return result;
}

export const eur = (v: number | null | undefined, digits = 2) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : `${v.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%`;

'use client';
import { Suspense } from 'react';
import RecipeEditor from './editor';

// Η συνταγή επιλέγεται με ?id=… ώστε η σελίδα να είναι στατική (GitHub Pages).
export default function RecipeEditPage() {
  return (
    <Suspense fallback={<p className="muted">Φόρτωση…</p>}>
      <RecipeEditor />
    </Suspense>
  );
}

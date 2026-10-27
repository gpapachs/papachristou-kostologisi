'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { APP_VERSION } from '@/lib/version';

const NAV = [
  { href: '/', label: 'Επισκόπηση', admin: true, icon: '◧' },
  { href: '/recipes', label: 'Συνταγές', admin: false, icon: '☰' },
  { href: '/ingredients', label: 'Πρώτες ύλες', admin: false, icon: '◍' },
  { href: '/prices', label: 'Ενημέρωση τιμών', admin: true, icon: '€' },
  { href: '/suppliers', label: 'Προμηθευτές', admin: true, icon: '⛟' },
  { href: '/users', label: 'Χρήστες', admin: true, icon: '◉' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, loading, error, signOut } = useStore();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="auth-wrap"><p className="muted">Φόρτωση…</p></div>;
  if (!profile) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <div className="alert alert-err">{error ?? 'Δεν υπάρχει πρόσβαση.'}</div>
          <button style={{ marginTop: 12 }} onClick={signOut}>Αποσύνδεση</button>
        </div>
      </div>
    );
  }

  const links = NAV.filter((n) => isAdmin || !n.admin);
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <div className="brand-mark">€</div>
          <div><b>Κοστολόγηση</b><span>Ψητοπωλείο Παπαχρήστου</span></div>
        </div>
        <nav className="nav">
          {links.map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>
              <span aria-hidden style={{ width: 18, textAlign: 'center' }}>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div><b>{profile.full_name || profile.username}</b></div>
          <div className="muted">{isAdmin ? 'Διαχειριστής' : 'Προσωπικό'} · v{APP_VERSION}</div>
          <button className="btn-ghost" style={{ padding: '6px 0', marginTop: 6 }} onClick={signOut}>Αποσύνδεση</button>
        </div>
      </aside>
      <div>
        <div className="topbar">
          <b>Κοστολόγηση</b>
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Μενού">☰</button>
        </div>
        <main className="main">
          {error && <div className="alert alert-err" style={{ marginBottom: 16 }}>{error}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useStore();
  if (!isAdmin) return <div className="alert alert-info">Αυτή η σελίδα είναι μόνο για τον διαχειριστή.</div>;
  return <>{children}</>;
}

/** Ετικέτα χρώματος για το food cost σε σχέση με τον στόχο. */
export function FoodCostBadge({ value, target }: { value: number | null; target: number }) {
  if (value == null) return <span className="badge b-info">χωρίς τιμή</span>;
  const cls = value <= target ? 'b-ok' : value <= target + 5 ? 'b-warn' : 'b-bad';
  return <span className={`badge ${cls}`}>{value.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%</span>;
}

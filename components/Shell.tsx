'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { APP_VERSION } from '@/lib/version';

// Εικονίδια γραμμής 20×20, ίδιο πάχος παντού.
const ICONS: Record<string, React.ReactNode> = {
  overview: <><path d="M3 17V9" /><path d="M8 17V4" /><path d="M13 17v-6" /><path d="M18 17V7" /></>,
  recipes: <><path d="M5 3h8l3 3v11H5z" /><path d="M8 9h5M8 12h5M8 15h3" /></>,
  ingredients: <><path d="M10 17c-4 0-6-3-6-6 0-4 3-7 6-8 3 1 6 4 6 8 0 3-2 6-6 6z" /><path d="M10 6v11" /></>,
  prices: <><path d="M14 5.5A5 5 0 1 0 14 14.5" /><path d="M4 9h7M4 11.5h6" /></>,
  suppliers: <><path d="M2 6h10v8H2z" /><path d="M12 9h3l3 3v2h-6" /><circle cx="6" cy="15" r="1.5" /><circle cx="15" cy="15" r="1.5" /></>,
  users: <><circle cx="10" cy="7" r="3" /><path d="M4 17c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" /></>,
  menu: <><path d="M3 6h14M3 10h14M3 14h14" /></>,
  logout: <><path d="M8 4H4v12h4" /><path d="M12 7l3 3-3 3" /><path d="M7 10h8" /></>,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const NAV = [
  { href: '/', label: 'Επισκόπηση', admin: true, icon: 'overview' },
  { href: '/recipes', label: 'Συνταγές', admin: false, icon: 'recipes' },
  { href: '/ingredients', label: 'Πρώτες ύλες', admin: false, icon: 'ingredients' },
  { href: '/prices', label: 'Ενημέρωση τιμών', admin: true, icon: 'prices' },
  { href: '/suppliers', label: 'Προμηθευτές', admin: true, icon: 'suppliers' },
  { href: '/users', label: 'Χρήστες', admin: true, icon: 'users' },
];

/** Το σήμα: μια φλόγα κάρβουνου μέσα σε τετράγωνο. */
export function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2.5c.6 2.6 3.8 4.4 3.8 8.1A3.8 3.8 0 0 1 6.2 10.6c0-1.6.8-2.7 1.6-3.5.2 1.4.9 2.2 1.6 2.4C9 7.3 9.2 4.6 10 2.5z" fill="currentColor" />
        <path d="M5 16.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

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
  const name = profile.full_name || profile.username;

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <BrandMark />
          <div><b>Κοστολόγηση</b><span>Ψητοπωλείο Παπαχρήστου</span></div>
        </div>
        <nav className="nav">
          {links.map((n) => (
            <Link key={n.href} href={n.href} className={isActive(n.href) ? 'active' : ''}>
              <Icon name={n.icon} />{n.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
          <div className="who">
            <b>{name}</b>
            <span>{isAdmin ? 'Διαχειριστής' : 'Προσωπικό'}</span>
            <span>v{APP_VERSION}</span>
          </div>
          <button className="side-btn" onClick={signOut} aria-label="Αποσύνδεση" title="Αποσύνδεση"><Icon name="logout" size={18} /></button>
        </div>
      </aside>
      <div className="content">
        <div className="topbar">
          <div className="row" style={{ gap: 10 }}><BrandMark /><b>Κοστολόγηση</b></div>
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Μενού"><Icon name="menu" /></button>
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

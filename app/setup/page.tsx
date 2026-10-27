'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { usernameToEmail } from '@/lib/auth';

export default function SetupPage() {
  const router = useRouter();
  const [state, setState] = useState<'check' | 'form' | 'error'>('check');
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ full_name: '', username: '', password: '', password2: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase().rpc('kost_setup_needed').then(({ data, error }: { data: boolean | null; error: { message: string } | null }) => {
      if (error) { setState('error'); setMsg(error.message); }
      else if (data) setState('form');
      else router.replace('/login');
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.password2) { setMsg('Οι κωδικοί δεν ταιριάζουν'); return; }
    setBusy(true); setMsg('');
    const sb = supabase();
    const { error } = await sb.rpc('kost_setup_admin', { p_username: f.username, p_password: f.password, p_full_name: f.full_name });
    if (error) { setBusy(false); setMsg(error.message); return; }
    const { error: loginErr } = await sb.auth.signInWithPassword({ email: usernameToEmail(f.username), password: f.password });
    if (loginErr) { setBusy(false); setMsg('Ο λογαριασμός φτιάχτηκε — συνδέσου από τη σελίδα σύνδεσης.'); return; }
    router.replace('/');
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Αρχική ρύθμιση</h1>
        {state === 'check' && <p className="muted">Έλεγχος…</p>}
        {state === 'error' && <div className="alert alert-err">Δεν μπόρεσα να μιλήσω με τη βάση: {msg}</div>}
        {state === 'form' && (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <p className="muted small" style={{ margin: 0 }}>Φτιάξε τον λογαριασμό διαχειριστή. Αυτή η σελίδα κλειδώνει μόλις δημιουργηθεί.</p>
            <label className="field">Ονοματεπώνυμο<input value={f.full_name} onChange={set('full_name')} /></label>
            <label className="field">Όνομα χρήστη (λατινικά)<input value={f.username} onChange={set('username')} autoCapitalize="none" required /></label>
            <label className="field">Κωδικός (8+ χαρακτήρες)<input type="password" value={f.password} onChange={set('password')} required /></label>
            <label className="field">Επανάληψη κωδικού<input type="password" value={f.password2} onChange={set('password2')} required /></label>
            {msg && <div className="alert alert-err">{msg}</div>}
            <button className="btn-primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Δημιουργία…' : 'Δημιουργία διαχειριστή'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

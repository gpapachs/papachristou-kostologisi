'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { usernameToEmail } from '@/lib/auth';
import { APP_VERSION } from '@/lib/version';
import { BrandMark } from '@/components/Shell';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase().rpc('kost_setup_needed').then(({ data }: { data: boolean | null }) => { if (data) router.replace('/setup'); });
    supabase().auth.getSession().then(({ data }) => { if (data.session) router.replace('/'); });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInWithPassword({ email: usernameToEmail(username), password });
    setBusy(false);
    if (error) { setErr('Λάθος όνομα χρήστη ή κωδικός'); return; }
    router.replace('/');
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand">
          <BrandMark />
          <div><b>Κοστολόγηση</b><span>Ψητοπωλείο Παπαχρήστου</span></div>
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          <label className="field">Όνομα χρήστη
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" required />
          </label>
          <label className="field">Κωδικός
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {err && <div className="alert alert-err">{err}</div>}
          <button className="btn-primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Σύνδεση…' : 'Σύνδεση'}</button>
        </div>
        <p className="muted small" style={{ textAlign: 'center', marginBottom: 0 }}>v{APP_VERSION}</p>
      </form>
    </div>
  );
}

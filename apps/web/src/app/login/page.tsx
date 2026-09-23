import { redirect } from 'next/navigation';
import { brand } from '../../lib/brand';
import { database } from '../../lib/supabase';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const db = await database();
  const { data: userData } = await db.auth.getUser();
  if (userData.user) {
    const { data: members } = await db
      .from('project_members')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .eq('active', true)
      .limit(1);
    if (members?.length) redirect('/planner');
  }
  const { error } = await searchParams;
  return (
    <main className="login-shell">
      <div className="utility">PROJECT EXECUTION &amp; MONITORING · {brand.institution}</div>
      <section className="panel login-panel">
        <div className="brand">{brand.name}</div>
        <p className="eyebrow">SYNTHETIC DEMONSTRATION</p>
        <h1>Sign in to your workspace</h1>
        <p>Your account controls which projects and assignments you can view.</p>
        {error && (
          <p role="alert" className="login-error">
            {error === 'no-access'
              ? 'This account has no active project membership. Contact your project administrator.'
              : 'Sign-in failed. Check your email and password, then try again.'}
          </p>
        )}
        <form method="post" action="/api/auth/login">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
          <button className="button primary" type="submit">
            Sign in
          </button>
        </form>
        <p className="muted">
          Accounts are provisioned by an administrator. This is not an official Oil India service.
        </p>
      </section>
    </main>
  );
}

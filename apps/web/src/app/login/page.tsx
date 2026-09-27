import { redirect } from 'next/navigation';
import { brand } from '../../lib/brand';
import { database } from '../../lib/supabase';
import { demoAccounts } from '../../lib/demo-accounts';
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
  const demos = demoAccounts();
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
        {demos.length > 0 && (
          <section className="demo-access" aria-labelledby="demo-access-heading">
            <h2 id="demo-access-heading">Exploring this demonstration?</h2>
            <p className="demo-access-intro">
              Open a prepared account, or sign in with it above. Each role sees a different part of
              the project, which is the point worth comparing.
            </p>
            <ul className="demo-account-list">
              {demos.map((account) => (
                <li key={account.email}>
                  <form method="post" action="/api/auth/login">
                    <input type="hidden" name="email" value={account.email} />
                    <input type="hidden" name="password" value={account.password} />
                    <button className="button demo-open" type="submit">
                      Open as {account.role.toLowerCase()}
                    </button>
                  </form>
                  <div className="demo-credentials">
                    {account.note && <span className="demo-note">{account.note}</span>}
                    <code>{account.email}</code>
                    <code>{account.password}</code>
                  </div>
                </li>
              ))}
            </ul>
            <p className="demo-access-warning">
              Synthetic project data only. These sign-ins are published deliberately, so treat
              anything recorded here as public and expect the workspace to be reset.
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

'use client';
import { clearUserDrafts } from '../lib/field-draft';
export function SignOut({ userId }: { userId: string }) {
  return (
    <form
      action="/api/auth/logout"
      method="post"
      onSubmit={() => {
        try {
          clearUserDrafts(userId);
        } catch {}
      }}
    >
      <button className="text-button" type="submit">
        Sign out
      </button>
    </form>
  );
}

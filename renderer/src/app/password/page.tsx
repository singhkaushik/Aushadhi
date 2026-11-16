import { changeOwnPassword } from "../users/actions";

export default async function Password({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  return (
    <div className="max-w-sm">
      <h1 className="h1">Change Password</h1>
      {ok && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">Password changed.</div>}
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err === "1" ? "Current password is wrong." : "New passwords must match and be at least 4 characters."}</div>}
      <form action={changeOwnPassword} className="card space-y-3">
        <div><label className="label">Current password</label><input name="current" type="password" required className="input" /></div>
        <div><label className="label">New password</label><input name="password" type="password" required className="input" /></div>
        <div><label className="label">Confirm new password</label><input name="confirm" type="password" required className="input" /></div>
        <button className="btn">Change</button>
      </form>
    </div>
  );
}

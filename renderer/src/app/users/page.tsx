import { db } from "@/lib/db";
import { addUser, updateUser } from "./actions";

export default function Users() {
  const users = db().prepare("SELECT id, username, role, active FROM users ORDER BY username").all() as {
    id: number; username: string; role: string; active: number;
  }[];
  const roles = ["admin", "billing", "viewer"];
  return (
    <div className="max-w-3xl">
      <h1 className="h1">Users</h1>
      <p className="mb-3 text-sm text-slate-600">
        <b>Admin</b>: everything. <b>Billing</b>: create/edit bills and masters; cannot delete, import, restore or change settings. <b>Viewer</b>: read-only.
      </p>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Username</th><th>Role</th><th>Active</th><th>New password</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td colSpan={5} className="p-0">
                  <form action={updateUser} className="grid grid-cols-[1fr_8rem_4rem_10rem_5rem] items-center gap-2 px-2 py-1">
                    <input type="hidden" name="id" value={u.id} />
                    <span>{u.username}</span>
                    <select name="role" defaultValue={u.role} className="input">{roles.map((r) => <option key={r}>{r}</option>)}</select>
                    <input type="checkbox" name="active" defaultChecked={!!u.active} />
                    <input name="password" type="password" placeholder="(unchanged)" className="input" />
                    <button className="btn-sec">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-6 mb-2 font-semibold text-slate-700">Add User</h2>
      <form action={addUser} className="card flex items-end gap-2">
        <div><label className="label">Username</label><input name="username" required className="input" /></div>
        <div><label className="label">Password</label><input name="password" type="password" required className="input" /></div>
        <div><label className="label">Role</label><select name="role" className="input">{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
        <button className="btn">Add</button>
      </form>
    </div>
  );
}

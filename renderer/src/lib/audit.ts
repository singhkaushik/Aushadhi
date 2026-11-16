import { db } from "./db";

export function audit(
  user: string | null | undefined,
  action: "create" | "edit" | "delete",
  entity: string,
  entityId: number | null,
  detail = "",
) {
  db()
    .prepare("INSERT INTO audit_log (user, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .run(user || "system", action, entity, entityId, detail);
}

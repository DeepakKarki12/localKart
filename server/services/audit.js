import { AuditLog } from "../models/marketplace.js";
export async function audit(user, action, target, metadata = {}, session) {
  await AuditLog.create(
    [
      {
        actorId: user.id,
        action,
        targetType: target.constructor.modelName,
        targetId: target._id,
        metadata,
      },
    ],
    { session },
  );
}

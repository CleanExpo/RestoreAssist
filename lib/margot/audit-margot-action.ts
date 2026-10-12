import { prisma } from "@/lib/prisma";
import {
  classifyMargotAction,
  type MargotActionClass,
} from "./action-classifier";

export async function auditMargotAction(args: {
  inspectionId: string;
  userId: string;
  actionKey: string;
  detail?: Record<string, unknown>;
}): Promise<MargotActionClass> {
  const actionClass = classifyMargotAction(args.actionKey);
  try {
    await prisma.auditLog.create({
      data: {
        inspectionId: args.inspectionId,
        userId: args.userId,
        action: `MARGOT_${args.actionKey.toUpperCase()}`,
        changes: JSON.stringify({
          actionClass,
          ...args.detail,
        }),
      },
    });
  } catch (err) {
    console.error("[margot/audit]", err);
  }
  return actionClass;
}

import { z } from "zod";
import type { AccountControl } from "./infrai_account_client.js";

export const deletionRequestSchema = z.object({
  userId: z.string().min(1),
  credentialId: z.string().min(1),
  confirmation: z.literal("DELETE"),
});

export type DeletionRequest = z.infer<typeof deletionRequestSchema>;

export type TenantData = {
  userId: string;
  maintenanceRequests: Array<{ id: string; summary: string }>;
  documents: Array<{ id: string; name: string }>;
  inspectionReminders: Array<{ id: string; scheduledFor: string }>;
};

export interface TenantRepository {
  erase(userId: string): Promise<{ maintenanceRequests: number; documents: number; inspectionReminders: number }>;
}

export type DeletionReceipt = {
  userId: string;
  status: "deleted";
  revokedSessions: number;
  revokedCredentialId: string;
  erased: { maintenanceRequests: number; documents: number; inspectionReminders: number };
};

export async function deleteTenantAccount(
  input: DeletionRequest,
  accountControl: AccountControl,
  tenants: TenantRepository,
): Promise<DeletionReceipt> {
  const sessionIds = await accountControl.listSessions(input.userId);
  for (const sessionId of sessionIds) {
    await accountControl.revokeSession(sessionId);
  }

  await accountControl.revokeCredential(input.credentialId);
  const erased = await tenants.erase(input.userId);

  return {
    userId: input.userId,
    status: "deleted",
    revokedSessions: sessionIds.length,
    revokedCredentialId: input.credentialId,
    erased,
  };
}

export class MemoryTenantRepository implements TenantRepository {
  private readonly records: Map<string, TenantData>;

  constructor(records: Map<string, TenantData>) {
    this.records = records;
  }

  async erase(userId: string) {
    const record = this.records.get(userId);
    if (!record) return { maintenanceRequests: 0, documents: 0, inspectionReminders: 0 };
    this.records.delete(userId);
    return {
      maintenanceRequests: record.maintenanceRequests.length,
      documents: record.documents.length,
      inspectionReminders: record.inspectionReminders.length,
    };
  }

  has(userId: string): boolean {
    return this.records.has(userId);
  }
}

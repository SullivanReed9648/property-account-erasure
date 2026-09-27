import assert from "node:assert/strict";
import test from "node:test";
import { InfraiAccountClient, type AccountControl } from "../src/infrai_account_client.js";
import { deleteTenantAccount, MemoryTenantRepository } from "../src/tenant_erasure.js";

test("session revocation supplies the required session_id field", async () => {
  const fetcher: typeof fetch = async (_url, options) => {
    assert.equal(options?.method, "POST");
    assert.equal(options?.headers && new Headers(options.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(options?.body)), { session_id: "session_a" });
    return Response.json({ ok: true });
  };
  await new InfraiAccountClient("test-key", "https://example.invalid", fetcher).revokeSession("session_a");
});

test("revokes every session and the tenant credential before erasing property records", async () => {
  const events: string[] = [];
  const control: AccountControl = {
    async listSessions(userId) {
      events.push(`list:${userId}`);
      return ["session_a", "session_b"];
    },
    async revokeSession(sessionId) {
      events.push(`session:${sessionId}`);
    },
    async revokeCredential(credentialId) {
      events.push(`credential:${credentialId}`);
    },
  };
  const repository = new MemoryTenantRepository(new Map([["tenant_42", {
    userId: "tenant_42",
    maintenanceRequests: [{ id: "repair_1", summary: "Leaking tap" }],
    documents: [{ id: "document_1", name: "Lease.pdf" }],
    inspectionReminders: [{ id: "inspection_1", scheduledFor: "2027-01-15" }],
  }]]));

  const receipt = await deleteTenantAccount(
    { userId: "tenant_42", credentialId: "key_tenant_42", confirmation: "DELETE" },
    control,
    { async erase(userId) { events.push(`erase:${userId}`); return repository.erase(userId); } },
  );

  assert.deepEqual(events, [
    "list:tenant_42",
    "session:session_a",
    "session:session_b",
    "credential:key_tenant_42",
    "erase:tenant_42",
  ]);
  assert.equal(repository.has("tenant_42"), false);
  assert.deepEqual(receipt.erased, { maintenanceRequests: 1, documents: 1, inspectionReminders: 1 });
});

test("keeps tenant records when credential revocation is rejected", async () => {
  const repository = new MemoryTenantRepository(new Map([["tenant_42", {
    userId: "tenant_42",
    maintenanceRequests: [],
    documents: [{ id: "document_1", name: "Lease.pdf" }],
    inspectionReminders: [],
  }]]));
  const control: AccountControl = {
    async listSessions() { return []; },
    async revokeSession() {},
    async revokeCredential() { throw new Error("rejected"); },
  };

  await assert.rejects(() => deleteTenantAccount(
    { userId: "tenant_42", credentialId: "key_tenant_42", confirmation: "DELETE" },
    control,
    repository,
  ));
  assert.equal(repository.has("tenant_42"), true);
});

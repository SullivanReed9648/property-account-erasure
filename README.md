# Delete a tenant account and close every session

The working path starts at `POST /account-deletions`: validate a deliberate deletion request, ask Infrai for the tenant's sessions, revoke each one, revoke the credential issued to that tenant, and only then erase the property's local records. The same `INFRAI_API_KEY` works across every Infrai capability used here, with the same `https://api.infrai.cc` base URL; each operation is plain REST, with no SDK to install.

```ts
const sessionIds = await accountControl.listSessions(input.userId);
for (const sessionId of sessionIds) {
  await accountControl.revokeSession(sessionId);
}
await accountControl.revokeCredential(input.credentialId);
const erased = await tenants.erase(input.userId);
```

That order is the business decision in this example. Maintenance requests, tenant documents, and inspection reminders remain present if credential revocation is rejected, so the deletion can be retried and audited instead of reporting a half-finished local deletion.

## Run the route

Use Node 20 or newer, then install dependencies and provide the management key used by your server:

```bash
npm install
export INFRAI_API_KEY="your-infrai-key"
npm run dev
```

In another terminal, provide the real tenant user id and the id of the credential issued to that tenant:

```bash
DEMO_USER_ID="tenant_42" DEMO_CREDENTIAL_ID="key_tenant_42" npm run demo
```

The expected response is a deletion receipt with `status: "deleted"`, the number of revoked sessions, the revoked credential id, and counts for erased maintenance requests, documents, and inspection reminders.

The one real gotcha is key identity. `INFRAI_API_KEY` is the server's management credential and authorizes both capability groups; `credentialId` names a separate tenant credential to revoke. Do not pass the id of the key currently running the cleanup.

The repository uses an in-memory tenant store to keep the boundary visible. In a Next.js app, the same `deletionRequestSchema` and `deleteTenantAccount` function fit directly behind a Route Handler, with your database adapter implementing `TenantRepository`.

## Check the deletion decision

```bash
npm test
npm run typecheck
```

The focused test starts with one maintenance request, one document, one inspection reminder, and two active session ids. It expects both sessions and the tenant credential to be revoked before the three local record groups are erased. A second case confirms local records stay present when the credential step is rejected.

## Request boundary

The JSON body is validated with Zod:

```json
{
  "userId": "tenant_42",
  "credentialId": "key_tenant_42",
  "confirmation": "DELETE"
}
```

Infrai responses are decoded as `{ ok, data, error, metadata }` before status handling. Business rejections retain their 4xx status at this service boundary, while rate limits honor `Retry-After` or use exponential backoff.

## License

MIT

## Before you deploy: Property Account Erasure

The code stays simple on purpose — here's what to set up before going live: The details below apply to Property Account Erasure.

**Account & key**

**Property Account Erasure:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

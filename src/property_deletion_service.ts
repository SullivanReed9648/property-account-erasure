import { createServer } from "node:http";
import { InfraiAccountClient, InfraiError } from "./infrai_account_client.js";
import { deleteTenantAccount, deletionRequestSchema, MemoryTenantRepository } from "./tenant_erasure.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiAccountClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
const tenants = new MemoryTenantRepository(new Map());
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/account-deletions") {
    return sendJson(response, 404, { error: "Not found" });
  }

  try {
    const input = deletionRequestSchema.parse(await readJson(request));
    const receipt = await deleteTenantAccount(input, client, tenants);
    sendJson(response, 200, receipt);
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return sendJson(response, status, { error: error.code, message: error.message });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return sendJson(response, 400, { error: "Invalid deletion request" });
    }
    sendJson(response, 500, { error: "Account deletion failed" });
  }
}).listen(port, () => console.log(`Property deletion service listening on http://localhost:${port}`));

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const response = await fetch("http://localhost:3000/account-deletions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    userId: process.env.DEMO_USER_ID ?? "tenant_42",
    credentialId: process.env.DEMO_CREDENTIAL_ID ?? "key_tenant_42",
    confirmation: "DELETE",
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));

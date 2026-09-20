import "dotenv/config";

import { eq } from "drizzle-orm";

import { getAuth } from "../src/auth";
import {
  assertTrellisOAuthClientIsUnique,
  createTrellisOAuthClientRegistration,
  isTrellisOAuthTarget,
} from "../src/server/auth/trellis-oauth-client";
import { canManageOAuthClients } from "../src/server/auth/oauth-provider-config";
import { db } from "../src/server/db";
import { oauthClients } from "../src/server/db/schema";

async function main() {
  const target = process.argv[2];
  if (!isTrellisOAuthTarget(target)) {
    throw new Error(
      "Usage: npm run oauth:provision:trellis -- <local|production>",
    );
  }

  const cookie = process.env.OAUTH_PROVISION_ADMIN_COOKIE;
  if (!cookie) {
    throw new Error(
      "OAUTH_PROVISION_ADMIN_COOKIE must contain a signed-in Sharply admin Cookie header.",
    );
  }

  const headers = new Headers({ cookie });
  const session = await getAuth().api.getSession({ headers });
  if (!session || !canManageOAuthClients(session.user)) {
    throw new Error(
      "OAUTH_PROVISION_ADMIN_COOKIE must belong to a Sharply ADMIN or SUPERADMIN.",
    );
  }

  const registration = createTrellisOAuthClientRegistration(target);
  const { spec } = registration;
  const duplicate = await db.query.oauthClients.findFirst({
    where: eq(oauthClients.name, spec.name),
    columns: { id: true },
  });
  assertTrellisOAuthClientIsUnique(duplicate?.id, spec.name);

  const created = await getAuth().api.createOAuthClient({
    headers,
    body: registration.body,
  });

  await db
    .update(oauthClients)
    .set({ skipConsent: registration.skipConsent })
    .where(eq(oauthClients.clientId, created.client_id));

  console.log(
    JSON.stringify(
      {
        client: spec.name,
        redirect_uri: spec.redirectUri,
        client_id: created.client_id,
        client_secret: created.client_secret,
        warning: "Copy the client secret now; it cannot be recovered later.",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

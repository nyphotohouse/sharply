import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/auth";
import { requireRole } from "~/lib/auth/auth-helpers";
import { getDeveloperAdminData } from "~/server/developer-api/service";
import { WebhookObservability } from "./_components/webhook-observability";
import { DeveloperApiAdminManager } from "./developer-api-admin-manager";

export const dynamic = "force-dynamic";

export default async function DeveloperApiAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/auth/signin?callbackUrl=/admin/developer-api");
  if (!requireRole(session.user, ["ADMIN"])) redirect("/admin");

  const data = await getDeveloperAdminData();

  return (
    <div className="space-y-8">
      <DeveloperApiAdminManager data={data} />
      <WebhookObservability
        targets={data.webhookTargets}
        deliveries={data.webhookDeliveries}
      />
    </div>
  );
}

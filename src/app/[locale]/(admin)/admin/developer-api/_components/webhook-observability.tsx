import { getLocale } from "next-intl/server";
import { Badge } from "~/components/ui/badge";
import { DEVELOPER_WEBHOOK_MAX_ATTEMPTS } from "~/server/developer-api/constants";

type WebhookTargetRow = {
  id: string;
  eventType: string;
  endpointUrl: string;
  isEnabled: boolean;
  createdAt: Date;
  userName: string | null;
  userEmail: string;
  developerAccessEnabled: boolean;
};

type WebhookDeliveryRow = {
  id: string;
  eventId: string;
  eventType: string;
  gearSlug: string | null;
  endpointUrl: string;
  status: string;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date;
  deliveredAt: Date | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: Date;
  userName: string | null;
  userEmail: string;
};

function formatDate(value: Date | null, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function endpointLabel(endpointUrl: string) {
  try {
    const url = new URL(endpointUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpointUrl;
  }
}

function statusVariant(status: string) {
  if (status === "FAILED") return "destructive" as const;
  if (status === "DELIVERED") return "secondary" as const;
  return "outline" as const;
}

function statusLabel(status: string) {
  return status[0] + status.slice(1).toLowerCase();
}

function EmptyTableRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-muted-foreground px-4 py-8 text-center text-sm"
      >
        {children}
      </td>
    </tr>
  );
}

export async function WebhookObservability({
  targets,
  deliveries,
}: {
  targets: WebhookTargetRow[];
  deliveries: WebhookDeliveryRow[];
}) {
  const locale = await getLocale();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Webhook observability</h2>
        <p className="text-muted-foreground mt-2">
          Recent targets and delivery outcomes. Signing secrets are never
          included here.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">Targets</h3>
          <p className="text-muted-foreground text-xs">
            Latest {targets.length} target{targets.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Developer</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {targets.length === 0 ? (
                <EmptyTableRow colSpan={5}>
                  No webhook targets have been configured.
                </EmptyTableRow>
              ) : (
                targets.map((target) => (
                  <tr key={target.id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {target.userName || target.userEmail}
                      </span>
                      {target.userName ? (
                        <span className="text-muted-foreground block text-xs">
                          {target.userEmail}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {target.eventType}
                    </td>
                    <td className="max-w-[28rem] px-4 py-3">
                      <code
                        className="block truncate text-xs"
                        title={endpointLabel(target.endpointUrl)}
                      >
                        {endpointLabel(target.endpointUrl)}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={target.isEnabled ? "secondary" : "outline"}
                      >
                        {target.isEnabled ? "Active" : "Paused"}
                      </Badge>
                      {!target.developerAccessEnabled ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          Access disabled
                        </span>
                      ) : null}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {formatDate(target.createdAt, locale)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">Recent delivery activity</h3>
          <p className="text-muted-foreground text-xs">
            Latest {deliveries.length} delivery record
            {deliveries.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Last attempt</th>
                <th className="px-4 py-3 font-medium">Developer</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">HTTP</th>
                <th className="px-4 py-3 font-medium">Latest error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deliveries.length === 0 ? (
                <EmptyTableRow colSpan={8}>
                  No webhook deliveries have been queued.
                </EmptyTableRow>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="text-muted-foreground px-4 py-3">
                      {formatDate(delivery.lastAttemptAt, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {delivery.userName || delivery.userEmail}
                      </span>
                      {delivery.userName ? (
                        <span className="text-muted-foreground block text-xs">
                          {delivery.userEmail}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-mono text-xs">
                        {delivery.eventType}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {delivery.gearSlug || delivery.eventId}
                      </span>
                    </td>
                    <td className="max-w-[24rem] px-4 py-3">
                      <code
                        className="block truncate text-xs"
                        title={endpointLabel(delivery.endpointUrl)}
                      >
                        {endpointLabel(delivery.endpointUrl)}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(delivery.status)}>
                        {statusLabel(delivery.status)}
                      </Badge>
                      {delivery.status === "PENDING" ? (
                        <span className="text-muted-foreground mt-1 block text-xs">
                          Next: {formatDate(delivery.nextAttemptAt, locale)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {delivery.attemptCount} / {DEVELOPER_WEBHOOK_MAX_ATTEMPTS}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {delivery.lastStatusCode ?? "—"}
                    </td>
                    <td className="max-w-[28rem] px-4 py-3">
                      {delivery.lastError ? (
                        <span
                          className="text-destructive block truncate text-xs"
                          title={delivery.lastError}
                        >
                          {delivery.lastError}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Each row summarizes one event delivery to one target; attempts show
          the latest result and cumulative count. Only the latest 100 records
          are loaded.
        </p>
      </section>
    </section>
  );
}

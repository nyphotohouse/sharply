import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { STORAGE_STATE_PATH } from "./utils/auth";

test.use({ storageState: STORAGE_STATE_PATH });
test.setTimeout(90_000);
test.describe.configure({ mode: "serial" });

const endpointUrl = "https://example.com/sharply-e2e/webhook-target";

async function removeWebhookFixture() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E cleanup");

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`
      delete from app.developer_webhook_targets as target
      using app."user" as owner
      where target.user_id = owner.id
        and owner.email = 'dev@sharply.local'
        and target.endpoint_url = ${endpointUrl}
    `;
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  await removeWebhookFixture();
});

test.afterEach(async () => {
  await removeWebhookFixture();
});

test("creates, pauses, resumes, and deletes a webhook endpoint", async ({
  page,
}) => {
  await page.goto("/developer");
  await expect(
    page.getByRole("heading", { name: "Welcome, Sharply Dev User" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add endpoint" }).click();
  await page.getByLabel("Endpoint URL").fill(endpointUrl);
  await expect(
    page.getByRole("radio", { name: /gear\.created/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Create endpoint" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Copy your webhook signing secret now",
    }),
  ).toBeVisible();
  await expect(page.getByText(/^whsec_/)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();

  const target = page.locator("article").filter({ hasText: endpointUrl });
  await expect(target.getByText("Active")).toBeVisible();
  await target.getByRole("button", { name: "Pause" }).click();
  await expect(target.getByText("Paused")).toBeVisible();
  await target.getByRole("button", { name: "Resume" }).click();
  await expect(target.getByText("Active")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await target.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByText("You have not created a webhook target yet."),
  ).toBeVisible();
});

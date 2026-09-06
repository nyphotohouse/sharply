import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { STORAGE_STATE_PATH } from "./utils/auth";

test.use({ storageState: STORAGE_STATE_PATH });
test.setTimeout(90_000);
// These tests share an authenticated user and mutate proposal/gear fixtures.
// Keep them independent, but do not run them concurrently within this file.
test.describe.configure({ mode: "default" });

const READ_ONLY_GEAR_PATH = "/gear/nikon-z6iii";
const SUBMISSION_GEAR_PATH = "/gear/canon-eos-r6-mark-iii";
const PENDING_SUBMISSION_GEAR_PATH = "/gear/nikon-zr";

async function deletePendingFixtureProposal(
  proposalId?: string,
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E cleanup");

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    if (proposalId) {
      await sql`
        delete from app.gear_edits
        where id = ${proposalId} and status = 'PENDING'
      `;
      return;
    }

    await sql`
      delete from app.gear_edits as edit
      using app.gear as fixture, app."user" as submitter
      where edit.gear_id = fixture.id
        and edit.created_by_id = submitter.id
        and fixture.slug = 'nikon-zr'
        and submitter.email = 'dev@sharply.local'
        and edit.status = 'PENDING'
    `;
  } finally {
    await sql.end();
  }
}

async function navigateToEditableGearPage(
  page: Page,
  gearPath = READ_ONLY_GEAR_PATH,
): Promise<void> {
  const editPath = `${gearPath}/edit`;
  await page.goto(gearPath);
  await expect(page).toHaveURL(new RegExp(`${gearPath}/?$`));

  const editLink = page
    .locator(`a[href^="${editPath}?"]`)
    .filter({ hasText: "Suggest Edit" })
    .first();
  await expect(editLink).toBeVisible({ timeout: 30_000 });
  await expect(editLink).not.toHaveAttribute("aria-disabled", "true", {
    timeout: 30_000,
  });
}

async function openInterceptedEditModal(
  page: Page,
  gearPath = READ_ONLY_GEAR_PATH,
): Promise<void> {
  const editPath = `${gearPath}/edit`;
  await expect(page).toHaveURL(new RegExp(`${gearPath}/?$`));

  const editLink = page
    .locator(`a[href^="${editPath}?"]`)
    .filter({ hasText: "Suggest Edit" })
    .first();

  await editLink.click();
  await expect(page).toHaveURL(new RegExp(`${editPath}(?:\\?|$)`), {
    timeout: 30_000,
  });
  await expect(page.getByRole("dialog")).toContainText("Edit Gear Item", {
    timeout: 30_000,
  });
}

async function expectEditModalClosed(page: Page): Promise<void> {
  await expect(
    page.getByRole("dialog").filter({ hasText: "Edit Gear Item" }),
  ).not.toBeVisible();
}

async function expectGearPage(
  page: Page,
  gearPath = READ_ONLY_GEAR_PATH,
): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === gearPath);
}

test("closes the intercepted gear editor with Escape", async ({ page }) => {
  await navigateToEditableGearPage(page);
  await openInterceptedEditModal(page);

  await page.keyboard.press("Escape");

  await expectGearPage(page);
  await expectEditModalClosed(page);
});

test("closes the intercepted gear editor from its overlay", async ({
  page,
}) => {
  await navigateToEditableGearPage(page);
  await openInterceptedEditModal(page);

  await page.locator('[data-slot="dialog-overlay"]').click({
    position: { x: 5, y: 5 },
  });

  await expectGearPage(page);
  await expectEditModalClosed(page);
});

test("direct edit navigation keeps the full-page fallback", async ({
  page,
}) => {
  const editPath = `${READ_ONLY_GEAR_PATH}/edit`;
  await page.goto(editPath);

  await expect(page).toHaveURL(new RegExp(`${editPath}(?:\\?|$)`), {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Edit Gear Item" }),
  ).toBeVisible();
  await expectEditModalClosed(page);
});

test("auto-approved edit updates the gear item", async ({ page }) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E cleanup");

  const sql = postgres(databaseUrl, { max: 1 });
  const gearSlug = SUBMISSION_GEAR_PATH.split("/").at(-1)!;
  const [originalGear] = await sql<
    Array<{ weightGrams: number | null }>
  >`select weight_grams as "weightGrams" from app.gear where slug = ${gearSlug}`;
  if (!originalGear || originalGear.weightGrams === null) {
    await sql.end();
    throw new Error(`Expected ${gearSlug} to have a seeded weight`);
  }

  const originalWeight = originalGear.weightGrams;
  const updatedWeight = originalWeight + 1;

  try {
    await navigateToEditableGearPage(page, SUBMISSION_GEAR_PATH);
    await openInterceptedEditModal(page, SUBMISSION_GEAR_PATH);

    const weightInput = page.locator("#weight");
    await expect(weightInput).toHaveValue(String(originalWeight));
    await weightInput.fill(String(updatedWeight));

    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await expect(page.locator("#edit-modal-auto-submit")).toBeChecked();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Submit suggestion?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Apply Now" }).click();

    await expect
      .poll(
        async () => {
          const [gear] = await sql<
            Array<{ weightGrams: number | null }>
          >`select weight_grams as "weightGrams" from app.gear where slug = ${gearSlug}`;
          return gear?.weightGrams;
        },
        { timeout: 30_000 },
      )
      .toBe(updatedWeight);

    const verificationPage = await page.context().newPage();
    try {
      await verificationPage.goto(SUBMISSION_GEAR_PATH);
      await expect(
        verificationPage.getByText(`${updatedWeight} g`, { exact: true }),
      ).toBeVisible();
    } finally {
      await verificationPage.close();
    }
  } finally {
    await sql`
      update app.gear
      set weight_grams = ${originalWeight}
      where slug = ${gearSlug}
    `;
    await sql.end();
  }
});

test("pending edit closes the modal and reaches its success page", async ({
  page,
}) => {
  let proposalId: string | undefined;
  await deletePendingFixtureProposal();

  try {
    await navigateToEditableGearPage(page, PENDING_SUBMISSION_GEAR_PATH);
    await openInterceptedEditModal(page, PENDING_SUBMISSION_GEAR_PATH);

    const weightInput = page.locator("#weight");
    const currentWeight = Number(await weightInput.inputValue());
    expect(Number.isFinite(currentWeight)).toBe(true);
    await weightInput.fill(String(currentWeight + 1));
    await page.locator("#edit-modal-auto-submit").uncheck();

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm Submit", exact: true })
      .click();

    await expect(page).toHaveURL(/\/edit-success\?id=[^&]+$/, {
      timeout: 30_000,
    });
    proposalId = new URL(page.url()).searchParams.get("id") ?? undefined;
    expect(proposalId).toBeTruthy();
    await expect(page.getByText("Current status: PENDING")).toBeVisible();
    await expectEditModalClosed(page);
  } finally {
    await deletePendingFixtureProposal(proposalId);
  }
});

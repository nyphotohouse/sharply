import { expect, test } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./utils/auth";

test.use({ storageState: STORAGE_STATE_PATH });

test("price management accepts one point instead of source ranges", async ({
  page,
}) => {
  await page.goto("/gear/nikon-z6iii");
  await page.getByRole("button", { name: "Manage Used Prices" }).click();
  const management = page.getByRole("dialog", {
    name: "Used Price Management",
  });
  await expect(management).toBeVisible();
  await management
    .getByRole("button", { name: "Add Manual Observation" })
    .click();
  const form = page.getByRole("dialog").last();
  await expect(form.locator("#manual-price-amount")).toBeVisible();
  await expect(form.getByRole("radio", { name: "Range price" })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Range price" })).toHaveCount(
    0,
  );
});

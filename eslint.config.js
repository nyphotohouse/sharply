import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
// @ts-ignore -- no types for this plugin
import drizzle from "eslint-plugin-drizzle";

export default tseslint.config(
  {
    ignores: [
      ".next",
      "playwright-report/**",
      "next-env.d.ts",
      "scripts/**",
      "tests/**",
      "docs/**",
      "drizzle/**",
      "plans/**",
      "src/components/ui/**",
      "src/server/payload/migrations/**",
    ],
  },
  ...nextVitals,
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "src/collections/**/*.ts",
      "src/collections/**/*.tsx",
      "src/components/ui/**/*.ts",
      "src/components/ui/**/*.tsx",
    ],
    plugins: {
      drizzle,
    },
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/ban-tslint-comment": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "drizzle/enforce-delete-with-where": [
        "error",
        { drizzleObjectName: ["db", "ctx.db"] },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        { drizzleObjectName: ["db", "ctx.db"] },
      ],
      // Use TS variant to support allowTypeImports
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "~/server/db",
              message:
                "Import via domain service (e.g., ~/server/gear/service).",
            },
            {
              name: "~/server/db/schema",
              message:
                "Use type-only imports from schema; runtime imports are restricted.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["~/server/*/data"],
              message: "Import via service.ts; data.ts is internal.",
            },
          ],
        },
      ],
    },
  },
  // Allow internal server modules to import DB/data freely
  {
    files: ["src/server/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  // Allow auth.ts to import schema
  {
    files: ["src/auth.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);

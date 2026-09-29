import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".phase-loop/**",
      "coverage/**",
      "**/dist/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Initial promise-rule scope is SL-0 tooling and its new tests/helpers only.
  {
    files: ["scripts/verify.mjs", "scripts/prepare-test-postgres.mjs", "scripts/check-dependency-boundaries.mjs", "scripts/pack-verified-packages.mjs", "scripts/verify-publish-artifacts.mjs", "scripts/smoke-packed-omnigent-transport.mjs", "tests/guard/**/*.ts", "tests/helpers/guard-process.ts", "tests/helpers/guard-postgres.ts", "tests/helpers/guard-stages.ts"],
    languageOptions: { parser: tsParser, parserOptions: { project: "./tsconfig.guard.json", tsconfigRootDir: import.meta.dirname } },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: { "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }] },
  },
];

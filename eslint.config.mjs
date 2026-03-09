import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node.js CommonJS scripts — not part of Next.js app
    "scripts/**",
    "dump_db.js",
  ]),
  {
    rules: {
      // Helius/Solana API responses are dynamic, allow `any` as warning
      "@typescript-eslint/no-explicit-any": "warn",
      // Data fetching in useEffect is a legitimate pattern for this project
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;

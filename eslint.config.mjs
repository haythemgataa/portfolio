import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: ["out/**", ".next/**", "node_modules/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // The content layer is currently untyped end to end (contentLoader returns `any`
      // and every component re-declares its props as `any`). Surfacing that as a warning
      // keeps `npm run lint` usable as a gate while the content model gets real types.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default config;

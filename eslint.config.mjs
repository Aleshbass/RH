import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// The only ESLint config (ESLint 9 flat config). `pnpm lint` fails on errors; warnings are advisory.
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@next/next/no-assign-module-variable': 'warn',
      '@next/next/no-img-element': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    // Convex helpers named use* (e.g. useAwardSession) are not React hooks
    files: ['convex/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    // Generated: Next's route types and the fumadocs .source output
    ignores: ['dist', 'node_modules', '.next', '.source', 'next-env.d.ts', 'convex/_generated', 'public', 'scripts/exercise-3d/out', 'test-results', 'playwright-report'],
  },
];

export default eslintConfig;

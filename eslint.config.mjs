import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/generated/**',
      'packages/frontend/**',
      // Files outside tsconfig (scripts, seed, config)
      'eslint.config.mjs',
      'packages/database/prisma/**',
      'packages/database/prisma.config.ts',
      'packages/database/scripts/**',
    ],
  },
  // Base JS rules
  js.configs.recommended,
  // TypeScript type-checked rules
  ...tseslint.configs.recommendedTypeChecked,
  // Disable formatting rules (handled by Prettier)
  eslintConfigPrettier,
  // Parser options for type-aware linting
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Custom rules
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Fastify plugins/routes are async by convention even without await
      '@typescript-eslint/require-await': 'off',
    },
  },
)

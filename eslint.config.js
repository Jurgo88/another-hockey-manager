import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

/**
 * Banned domain vocabulary (D-07). See .clauden/02-domain-model.md.
 *
 * Matched as whole words inside identifiers, so `Team`, `teamId` and
 * `HomeTeam` all fail, while `steam` does not.
 */
const BANNED_VOCABULARY = [
  { term: 'Team', use: 'Club, or the specific unit (Line, Pairing, Unit)' },
  { term: 'Game', use: 'Fixture (scheduled) or Match (played)' },
  { term: 'User', use: 'Manager' },
  { term: 'Squad', use: 'Roster' },
]

const vocabularyRules = BANNED_VOCABULARY.map(({ term, use }) => ({
  selector: `Identifier[name=/(^|[a-z])${term}([A-Z]|s?$)/]`,
  message: `Banned domain vocabulary "${term}" (D-07). Use ${use} instead.`,
}))

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.nuxt/**', '**/.output/**'] },
  // Claude Code skills: scratch tooling that reads saved runs loosely, run with tsx.
  { ignores: ['.claude/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files that sit outside every package's tsconfig.
          allowDefaultProject: ['packages/*/vitest.workspace.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-syntax': ['error', ...vocabularyRules],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  {
    // D-02: the engine draws only from the injected Rng.
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() is banned in @ahm/sim (D-02). Draw from the injected Rng so fixtures stay reproducible.',
        },
      ],
    },
  },

  {
    // D-03: stats folds the event stream and nothing else. Importing the
    // engine would open a second derivation path; the root barrel re-exports
    // the engine, so it is closed too.
    files: ['packages/sim/src/stats/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '!../domain', '!../domain/**'],
              message: 'src/stats may import from src/domain only (D-03).',
            },
          ],
        },
      ],
    },
  },

  {
    // The roster file reads and writes data, and nothing else (ADR-020).
    files: ['packages/sim/src/roster/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '!../domain', '!../domain/**'],
              message: 'src/roster may import from src/domain only (ADR-020).',
            },
          ],
        },
      ],
    },
  },

  {
    // Repo-root tooling config, plain Node ESM, not part of any tsconfig.
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },

  {
    // Scripts are plain Node ESM, not part of the typed project.
    files: ['scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
    },
  },
)

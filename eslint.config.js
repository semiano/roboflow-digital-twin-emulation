import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries here enforce the architectural constraints in plan.md §0.
 * Violations are build failures, not review comments.
 */

const GROUND_TRUTH_MODULES = [
  {
    group: [
      '**/models/GroundTruth',
      '**/models/GroundTruth.js',
      '**/simulation/GroundTruthManager',
      '@/models/GroundTruth',
      '@/simulation/GroundTruthManager',
    ],
    message:
      'C1 VIOLATION: ground truth must never reach the controls or vision layer. Only evaluation and dataset code may read it.',
  },
];

const REACT_MODULES = [
  {
    group: ['react', 'react-dom', 'react/**', 'react-dom/**', 'zustand', 'zustand/**'],
    message:
      'C4 VIOLATION: simulation, controls, vision and historian logic must stay outside React. Expose state via the engine snapshot instead.',
  },
];

const WALL_CLOCK_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      'C5 VIOLATION: use SimulationClock for simulated time. Date.now() is only allowed in SimulationClock, Logger and tests.',
  },
  {
    selector: "MemberExpression[object.name='performance'][property.name='now']",
    message:
      'C5 VIOLATION: use SimulationClock for simulated time. performance.now() is only allowed in SimulationClock, Logger and tests.',
  },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'dataset-output'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },

  // C5 - single clock. Applies to all product code.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...WALL_CLOCK_SYNTAX] },
  },
  // RealClock is the one sanctioned wall-clock reader for *real* durations: a
  // network round trip to Roboflow elapses while simulated time is frozen, so it
  // cannot be measured with SimulationClock (decision D18).
  {
    files: [
      'src/simulation/SimulationClock.ts',
      'src/core/Logger.ts',
      'src/core/RealClock.ts',
      'src/main.tsx',
    ],
    rules: { 'no-restricted-syntax': 'off', 'no-console': 'off' },
  },

  // C1 + C4 - the controls layer is blind to ground truth and to React.
  {
    files: ['src/controls/**/*.ts', 'src/vision/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...GROUND_TRUTH_MODULES, ...REACT_MODULES] }],
    },
  },

  // C4 - engine layers stay out of React.
  {
    files: ['src/simulation/**/*.ts', 'src/historian/**/*.ts', 'src/core/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: REACT_MODULES }] },
  },

  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  {
    files: ['tests/**/*.ts', '*.config.ts', 'eslint.config.js'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
      'no-console': 'off',
    },
  },
);

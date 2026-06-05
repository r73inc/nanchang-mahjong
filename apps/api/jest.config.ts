import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
  // Bypass the package "exports" field (which points to dist/) so ts-jest
  // always resolves workspace packages from their TypeScript source.
  moduleNameMapper: {
    '^@nanchang/engine$': '<rootDir>/../../packages/engine/src/index.ts',
    '^@nanchang/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  setupFiles: ['reflect-metadata'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
};

export default config;

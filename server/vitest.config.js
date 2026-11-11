import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.js'],
        reporters: ['default'],
        // Database tests share one PostgreSQL schema and must not run concurrently.
        fileParallelism: false,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js'],
            exclude: ['src/server.js'],
            reporter: ['text-summary', 'text', 'lcov', 'json-summary'],
            // FR-06: the pipeline fails when coverage drops below 70%.
            thresholds: {
                statements: 70,
                lines: 70,
                functions: 70,
                branches: 60,
            },
        },
    },
});

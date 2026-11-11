import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: './test/setup.js',
        include: ['test/**/*.test.jsx', 'test/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{js,jsx}'],
            exclude: ['src/main.jsx'],
            reporter: ['text-summary', 'text', 'lcov', 'json-summary'],
            thresholds: {statements: 70, lines: 70, functions: 70, branches: 60},
        },
    },
});

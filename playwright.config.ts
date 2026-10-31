import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './e2e', testMatch: '**/*.pw.ts', workers: 1, fullyParallel: false,
    timeout: 40_000, expect: {timeout: 8_000},
    use: { headless: true, viewport: {width:390,height:844},
        launchOptions: {args:['--host-resolver-rules=MAP fortress-test.invalid 127.0.0.1']},
        screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    reporter: [['list']], outputDir: 'test-results',
});

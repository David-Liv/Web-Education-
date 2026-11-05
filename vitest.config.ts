import {defineConfig,mergeConfig} from 'vitest/config';
import viteConfig from './vite.config';

// Private backups and exported release snapshots are not the current product.
export default mergeConfig(viteConfig,defineConfig({test:{include:['src/**/*.test.{ts,tsx}']}}));

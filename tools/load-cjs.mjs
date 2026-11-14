import { createRequire } from 'node:module';

export async function load(relativePath) {
  const require = createRequire(import.meta.url);
  const target = require.resolve(relativePath);
  return import(target);
}

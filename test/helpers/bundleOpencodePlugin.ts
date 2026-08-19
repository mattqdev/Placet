import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface OpencodeHooks {
  event(input: { event: Record<string, unknown> }): Promise<void>;
  'chat.message'(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void>;
  'tool.execute.after'(input: Record<string, unknown>): Promise<void>;
}

/**
 * resources/opencode/placet-plugin.ts isn't part of the shipped dist/
 * bundle (it's copied verbatim into a connected repo instead) — so tests
 * bundle it themselves, on the fly, to exercise the real code opencode
 * would load. Uses process.cwd() (npm test always runs from the project
 * root) rather than __dirname, since esbuild bundling rewrites __dirname
 * to the *output* file's location, not this source file's.
 */
export function loadOpencodePlugin(): {
  PlacetPlugin: (input: { directory: string }) => Promise<OpencodeHooks>;
} {
  const entry = path.resolve(process.cwd(), 'resources', 'opencode', 'placet-plugin.ts');
  const outfile = path.join(
    os.tmpdir(),
    `placet-oc-plugin-${Date.now()}-${Math.random().toString(36).slice(2)}.js`
  );

  esbuild.buildSync({ entryPoints: [entry], outfile, bundle: true, format: 'cjs', platform: 'node' });

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(outfile);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

export const SAMPLE_DIR = 'test-results/e2e-samples'

/** Generate deterministic synthetic exports with the backend's fixture generator. */
export default function globalSetup() {
  mkdirSync(SAMPLE_DIR, { recursive: true })
  execFileSync(
    'uv',
    [
      'run',
      '--project',
      '../backend',
      'python',
      '../backend/scripts/make_sample_export.py',
      SAMPLE_DIR,
    ],
    {
      stdio: 'inherit',
    },
  )
}

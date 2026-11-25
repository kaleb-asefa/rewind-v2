"""Write a deterministic synthetic Spotify history export (for demos and e2e tests).

uv run python scripts/make_sample_export.py out/dir
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.fixtures import MULTI, SMALL, write_export

if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "sample-export")
    out.mkdir(parents=True, exist_ok=True)
    for spec in (SMALL, MULTI):
        path, rows = write_export(out, spec)
        print(f"wrote {path} ({rows} plays)")

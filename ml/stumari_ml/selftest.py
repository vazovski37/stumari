"""Run ml/tests/test_*.py without pytest: python -m stumari_ml.selftest (from ml/)."""

from __future__ import annotations

import importlib.util
import sys
import traceback
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parents[1] / "tests"


def main() -> int:
    passed = failed = 0
    for path in sorted(TESTS_DIR.glob("test_*.py")):
        spec = importlib.util.spec_from_file_location(path.stem, path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for name in sorted(n for n in vars(module) if n.startswith("test_")):
            try:
                getattr(module, name)()
            except Exception:  # report every failure, keep going
                failed += 1
                print(f"FAIL {path.name}::{name}")
                traceback.print_exc()
            else:
                passed += 1
                print(f"ok   {path.name}::{name}")
    print(f"{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

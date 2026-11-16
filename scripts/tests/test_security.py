import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import os
import contextlib
import io

SCRIPT = Path(__file__).resolve().parents[1] / 'check-secret-patterns.py'
spec = importlib.util.spec_from_file_location('secret_check', SCRIPT)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SecretScanTests(unittest.TestCase):
    def test_matching_content_never_reaches_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = Path.cwd()
            try:
                os.chdir(tmp)
                value = 'A' * 30  # Deliberately synthetic fixture, never a real credential.
                Path('private.ts').write_text('token = "' + value + '"')
                output = io.StringIO()
                with patch.object(check.subprocess, 'check_output', return_value=b'private.ts\0'), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                    with self.assertRaises(SystemExit) as result:
                        check.main()
                self.assertNotIn(value, str(result.exception) + output.getvalue())
                self.assertNotIn('private.ts', str(result.exception) + output.getvalue())
            finally:
                os.chdir(before)


if __name__ == '__main__':
    unittest.main()

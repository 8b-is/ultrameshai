import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[2]
EXTRACT = ROOT / 'scripts/feedback-loop/extract-training-data.py'
TRAIN = ROOT / 'scripts/feedback-loop/train-kompress.py'
spec = importlib.util.spec_from_file_location('extract', EXTRACT)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)


class FeedbackTests(unittest.TestCase):
    def test_exact_ratio_boundary(self):
        records = [{'answer': 'abcdef', 'compressed_answer': 'ab'}, {'answer': 'abcde', 'compressed_answer': 'ab'}]
        self.assertEqual(len(extract.extract_pairs(iter(records), Fraction(1, 3))), 1)

    def test_local_extraction_and_validation_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.jsonl'
            output = Path(tmp) / 'pairs.jsonl'
            source.write_text(json.dumps({'answer': 'abcdef', 'compressed_answer': 'ab'}) + '\n')
            subprocess.run([sys.executable, str(EXTRACT), '--source', str(source), '--output', str(output), '--min-compression-ratio', '1/3', '--max-pairs', '1'], check=True, capture_output=True)
            self.assertEqual(len(output.read_text().splitlines()), 1)
            result = subprocess.run([sys.executable, str(TRAIN), '--data', str(output), '--dry-run'], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            unsupported = subprocess.run([sys.executable, str(TRAIN), '--data', str(output)], capture_output=True)
            self.assertNotEqual(unsupported.returncode, 0)
            self.assertIn(b'Training is not implemented', unsupported.stderr)
            output.write_text('{}\n')
            invalid = subprocess.run([sys.executable, str(TRAIN), '--data', str(output), '--dry-run'], capture_output=True)
            self.assertNotEqual(invalid.returncode, 0)
            self.assertIn(b'nonempty input/output', invalid.stderr)


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""Validate prospective kompress training pairs; training is not implemented.

Loads and validates (input, output) JSONL pairs. See README.md for the
ModernBERT objective mismatch and remaining implementation requirements.

No model is downloaded and no adapter is trained or published.

Usage:
    python3 scripts/feedback-loop/train-kompress.py \
        --data /tmp/kompress-train.jsonl \
        --dry-run
"""
import argparse
from fractions import Fraction
import json
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Validate prospective kompress training data (training unavailable)")
    parser.add_argument("--data", required=True, help="Training JSONL file (input/output pairs)")
    parser.add_argument("--base-model", default="answerdotai/ModernBERT-base",
                        help="Base model for fine-tuning")
    parser.add_argument("--output", default=None,
                        help="Reserved destination metadata; no upload is implemented")
    parser.add_argument("--epochs", type=int, default=3,
                        help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=8,
                        help="Batch size")
    parser.add_argument("--learning-rate", type=Fraction, default=Fraction(1, 5000),
                        help="Learning rate")
    parser.add_argument("--lora-r", type=int, default=16,
                        help="LoRA rank")
    parser.add_argument("--lora-alpha", type=int, default=32,
                        help="LoRA alpha")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate data only, skip training")
    args = parser.parse_args()

    # --- Load data ---
    data_path = Path(args.data)
    if not data_path.exists():
        print(f"ERROR: data file not found: {args.data}", file=sys.stderr)
        sys.exit(1)

    pairs = []
    with open(data_path) as f:
        for line in f:
            line = line.strip()
            if line:
                pair = json.loads(line)
                if not isinstance(pair, dict) or any(not isinstance(pair.get(k), str) or not pair[k].strip() for k in ("input", "output")):
                    parser.error("Each row must have nonempty input/output strings")
                pairs.append(pair)

    if not pairs:
        parser.error("Training data is empty")
    if min(args.epochs, args.batch_size, args.lora_r, args.lora_alpha) < 1:
        parser.error("Training counts must be positive")
    print(f"Loaded {len(pairs)} training pairs")

    if args.dry_run:
        print("Dry run — data validated, skipping training.")
        print(f"  Base model: {args.base_model}")
        print(f"  Pairs: {len(pairs)}")
        print(f"  Epochs: {args.epochs}")
        print(f"  LoRA rank: {args.lora_r}")
        # Show sample
        if pairs:
            sample = pairs[0]
            print(f"\n  Sample pair:")
            print(f"    Input  ({len(sample['input'])} chars): {sample['input'][:120]}...")
            print(f"    Output ({len(sample['output'])} chars): {sample['output'][:120]}...")
        return

    # ModernBERT is an encoder, not a seq2seq generator. Do not download a
    # substitute model or pretend this prototype provides a working trainer.
    parser.error("Training is not implemented for the ModernBERT pruner objective; use --dry-run for data validation. See scripts/feedback-loop/README.md")



if __name__ == "__main__":
    main()

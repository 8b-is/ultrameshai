# Feedback data prototype

Extraction requires an explicit local source and uses exact rational length ratios.
Its threshold is a maximum compressed/original character ratio, despite the legacy
`--min-compression-ratio` name. Scan work is bounded to three times `--max-pairs`.

`train-kompress.py --dry-run` validates nonempty input/output pairs only. Training
fails closed before imports, model downloads or uploads. The original sketch
incorrectly uses encoder-only ModernBERT with a seq2seq generation class and
assumes attention module names that do not match that architecture. Dry-run
success is not evidence that training works. The original sketch remains in Git history, not as an executable fallback.

The next implementation must select the intended objective: aligned token keep/drop
labels for the existing ModernBERT pruner, or a separate local seq2seq rewriter with
an explicitly selected compatible checkpoint. Specify the label policy, actual
module names, pad masking and a held-out quality test before enabling training.
No weights or adapters were trained or published by this PR validation.

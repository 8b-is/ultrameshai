# Manual dataset-card publication

The workflow is disabled unless `HF_DATASET_PUBLISH_ENABLED=true` and an explicit
`HF_DATASET_REPO=namespace/name` repository variable are configured. A manual run
on main must repeat that exact destination. The `huggingface-publish` GitHub
environment should require the destination owner's review. No destination owner
or credential ownership is inferred from the dataset card's historical credits.

Before enabling, the destination owner must configure a repo-scoped Trusted
Publisher for `8b-is/ultrameshai`, main, and `publish-dataset-card.yml`, and verify
the environment claims and the card's publication rights. The Hub CLI handles
OIDC exchange using `HF_OIDC_RESOURCE=datasets/namespace/name`; raw tokens are not
written to workflow outputs. See the official
[Trusted Publishers documentation](https://huggingface.co/docs/hub/trusted-publishers).

This change performs no live upload and does not establish that the destination
or publisher configuration exists. Other new agent workflows are manual,
read-only diagnostics; they do not create PRs, labels or comments.

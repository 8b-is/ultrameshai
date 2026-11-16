# Specification: Cryptographically Verifiable GitOps Review System
**Version:** 1.0.0  
**Status:** Proposal; not implemented or verified by this PR  

---

## 1. Overview
The goal is to allow readers to submit anonymous or pseudonymous reviews of the `kompress-ultra` proposal and paper in a way that is:
1. **Abuse heuristics:** GitHub account age/activity may inform review but cannot prove a human author.
2. **Tamper evidence:** signatures can detect changes relative to a trusted public key; replacing a self-supplied key and payload is not prevented.
3. **Transparently Moderated:** The author can delete or reject reviews, but the action is permanently visible in the public Git history.

---

## 2. Architecture & Data Flow

```
[User writes Review]
         │
         ▼
[Browser generates ECDSA keypair]
         │
         ▼
[Browser signs payload]
         │
         ▼
[Redirect to pre-filled GitHub file creation URL]
         │
         ▼
[User opens Pull Request]
         │
         ▼
[Author Merges PR]
         │
         ▼
[GitHub Action compiles reviews/*.json -> reviews.json]
         │
         ▼
[Cloudflare Pages redeploys site]
         │
         ▼
[Browser fetches reviews.json & verifies signatures]
```

---

## 3. Data Schema
Each review is stored in `reviews/review-<timestamp>.json` with the following structure:

```json
{
  "reviewer": "Pseudonym or GitHub handle",
  "rating": 5,
  "comment": "Excellent analysis of the ensemble paradox.",
  "timestamp": "2026-06-29T01:00:00.000Z",
  "publicKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  },
  "signature": "Hex-encoded signature string"
}
```

---

## 4. Verification & Trust Guarantees

### Immutability Guarantee
The payload is signed using the reviewer's private key. The public key is embedded in the JSON.
At page load, `app.js` executes:
$$\text{Verify}(\text{Payload}, \text{Signature}, \text{PublicKey}) \to \text{Valid} \mid \text{Invalid}$$
If the repository owner modifies the `comment` or `rating` in the file, the signature will fail to verify, and the UI will display a prominent tampering warning.

### Deletion Transparency
If the repository owner deletes a review file, the deletion is recorded as a commit:
```bash
git log --diff-filter=D --summary
```
This ensures all moderation actions are publicly auditable.

# Bug report (ready to file) — AceData FacilitatorX402 rejects wallet-injected Lighthouse instructions, contrary to the x402 SVM `exact` spec

> Draft GitHub issue for `https://github.com/AceDataCloud/FacilitatorX402` (issues enabled, repo public). Copy title + body below. Verified against `main` source on 2026-05-31.
>
> **Filed: https://github.com/AceDataCloud/FacilitatorX402/issues/47 (2026-06-01, re-verified against live `main`).**

---

## Title

`exact` verifier rejects wallet-injected Lighthouse instructions (mislabeled `TokenLedger`) — breaks all Phantom/Solflare payments before settle

## Body

### Summary

`x402f/chain_handlers/solana_exact.py` treats the **Lighthouse** assertion program (`L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`) as a custom `TokenLedger` and enforces non-spec constraints on it: the instruction must carry **exactly one** account, and that account must **equal the `TransferChecked` source**. Per the x402 SVM `exact` spec, Lighthouse instructions MUST be allowed and ignored **by program ID**. Real browser wallets (Phantom, Solflare) inject Lighthouse guard/assert instructions at sign time on hosted HTTPS origins — these reference accounts *other* than the transfer source and/or arrive as write+assert **pairs** — so `/verify` returns `isValid:false` and **every standard-wallet payment fails before settle**. Only raw-keypair or `localhost` flows (no Lighthouse injection) pass, which hides the bug from typical integration tests.

### Where (verified in `main`)

`x402f/chain_handlers/solana_exact.py`:

```python
# line 42 — this pubkey is the LIGHTHOUSE assertion program, not a "TokenLedger"
TOKEN_LEDGER_PROGRAM_ID = Pubkey.from_string("L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95")
```

```python
# lines ~272–282 — non-spec constraints applied to every Lighthouse instruction
if program_id == TOKEN_LEDGER_PROGRAM_ID:
    if transfer_details is None:
        return False, "TokenLedger instruction must appear after TransferChecked", None
    accounts = list(instruction.accounts)
    if len(accounts) != 1:
        return False, "TokenLedger instruction must have exactly one account", None
    ledger_account = message.account_keys[accounts[0]]
    if str(ledger_account) != transfer_details.get("source"):
        return False, "TokenLedger account must match transfer source", None
    token_ledger_indices.append(idx)
    continue
```

`L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` is the **Lighthouse** program (`github.com/Jac0xb/lighthouse`), confirmed by the x402 SVM spec itself (below).



The reference verifier simply `continue`s on Lighthouse **by program ID, without inspecting its accounts**. Lighthouse assertion/write instructions legitimately:
- reference accounts **other** than the transfer source (e.g. the payer's system/SOL account, a Lighthouse memory account), and/or
- carry **more than one** account, and/or
- appear as a **pair** (write + assert).

### Reproduction

Stack: x402 `exact`, Solana mainnet, USDC (`EPjFW…Dt1v`), third-party fee payer (the facilitator), buyer partial-signs a `TransferChecked` (buyer ATA → payTo ATA), facilitator co-signs/broadcasts on `/settle`.

1. **Raw `Keypair` signer (no wallet):** tx instructions `[ComputeBudget.setLimit, ComputeBudget.setPrice, (ATA-create), TransferChecked]` → `/verify` **passes**.
2. **Phantom on `localhost`:** Phantom does **not** inject Lighthouse on a `localhost` dev origin → identical instruction set → `/verify` **passes**.
3. **Phantom/Solflare on a hosted HTTPS origin:** the wallet **injects Lighthouse** guard/assertion instructions on sign → tx becomes `[…, TransferChecked, Lighthouse, Lighthouse]` → `/verify` **fails** with `isValid:false`, `invalidReason
:"TokenLedger account must match transfer source"`.

Same recipe, same wallet (Phantom), same buyer — the **only** difference is whether the wallet injected Lighthouse. This isolates the fault to the Lighthouse handling above.

### Diagnostic of a real failing transaction

Decoded `X-Payment` payload (all on-chain-public; buyer pubkey abbreviated):

```
payer = <facilitator>                 (fee payer; signature slot empty until /settle)
signatures = [empty(facilitator), signed(buyer)]
addressTableLookups = 0
instructions (6) = [ ComputeBudget, ComputeBudget, ATA-create, SPL-TransferChecked, Lighthouse, Lighthouse ]
TransferChecked: program = SPL Token (legacy)
  source = <buyer USDC ATA>           (== canonical ATA(buyer, USDC) ✓)
  mint   = EPjFW…Dt1v                 (mainnet USDC ✓)
  dest   = <payTo USDC ATA>           (== canonical ATA(payTo, USDC) ✓)
  owner  = <buyer> (4HtB…YUf)
```

Everything is canonical; the **only** thing the verifier objects to is the two trailing Lighthouse instructions, whose account(s) are not equal to the transfer source.

### Expected vs actual

- **Expected (per spec):** Lighthouse instructions are allowed and ignored by program ID; `/verify` returns `isValid:true`.
- **Actual:** `/verify` returns `isValid:false`, `invalidReason:"TokenLedger account must match transfer source"` (or `"TokenLedger instruction must have exactly one account"` for the paired/write variant).

### Suggested fix

Match the reference verifier: **allow Lighthouse by program ID and stop inspecting its accounts.** Minimal change in `solana_exact.py`:

```python
if program_id == TOKEN_LEDGER_PROGRAM_ID:   # Lighthouse — spec: MUST be allowed
    continue
```

(Optionally keep the "after TransferChecked" ordering tolerance, but drop the `len==1` and `==source` constraints, and rename `TOKEN_LEDGER_PROGRAM_ID` → `LIGHTHOUSE_PROGRAM_ID` to avoid the mislabel.) A reference for the program-ID whitel
ist approach: `x402-foundation/x402` PR #828 (PayAI facilitator whitelisted Lighthouse; production-tested with Phantom + Solflare on mainnet).

### Impact

All paid flows that use a standard browser wallet (Phantom/Solflare, hosted origin) fail before settle. Only raw-keypair or `localhost` flows work, so the bug is invisible to typical integration scripts.

---

## Source-verification notes (for us; not part of the issue)

- Repo: `AceDataCloud/FacilitatorX402`, `main`, public, issues enabled. File fetched 2026-05-31: `x402f/chain_handlers/solana_exact.py` (803 lines).
- Confirmed line 42 constant + lines 272–282 check + error string at line 280. The verifier loop runs `range(2, len(instructions))`; allowed programs = {ATA, Memo, Lighthouse(as "TokenLedger"), Token, Token-2022}; any other program → "Unexpected instruction".
- Note: it also requires "exactly one TransferChecked", ATA-create before transfer, and (mislabeled) Lighthouse after transfer. Those ordering rules are tolerable; the breaking ones are `len==1` and `==source`.
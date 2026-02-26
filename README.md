# DeFindex Vault Tools

Scripts to manage DeFindex vaults on the Stellar network: emergency rescue and idle funds rebalancing.

## Prerequisites

- Node.js (v18+)
- pnpm

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env` file from the example:

```bash
cp .env.example .env
```

3. Fill in the environment variables:

| Variable | Required | Description |
|---|---|---|
| `SIGNER_SECRET` | One of the two | Stellar secret key of the authorized account. Signs and submits the transaction automatically. |
| `SIGNER_PUBLIC_KEY` | One of the two | Stellar public key of the authorized account. Builds and simulates the transaction, then prints the XDR for signing with an external tool. |
| `VAULT_ADDRESS` | Yes | Contract address of the DeFindex vault. |

> **Tip — XDR export mode:** If you don't have access to the private key at runtime (e.g. hardware wallet, multisig), set only `SIGNER_PUBLIC_KEY`. The script will build and simulate the transaction, then save the fully-assembled XDR to a timestamped file (e.g. `rescue_unsigned_1234567890.xdr`). These files are gitignored. Open the file, copy the contents, and paste them into any Stellar signer (e.g. [Stellar Laboratory](https://laboratory.stellar.org), Albedo, Freighter, or your hardware wallet tool).

## Rescue

Emergency rescue of funds from a strategy back to the vault. It will protect users funds and will pause the strategy. Funds will stay as IDLE FUNDS.

```bash
pnpm rescue
```

The script will:

1. Build an emergency rescue transaction for the specified vault and strategy
2. Simulate the transaction to assemble auth entries
3. If `SIGNER_SECRET` is set: sign and submit the transaction
4. If only `SIGNER_PUBLIC_KEY` is set: print the assembled XDR to stdout

The strategy address to rescue from is hardcoded in `src/rescue.ts` (Currently `USDC_BLEND_YIELDBLOX_STRATEGY`). Update it to target a different strategy.

## Rebalance

Detects idle funds in a vault and invests them into the configured strategy.

```bash
pnpm rebalance
```

The script will:

1. Fetch total managed funds from the vault (via simulation)
2. Identify assets with idle (uninvested) balances
3. Build `Invest` instructions mapping each idle asset to its configured strategy
4. If `SIGNER_SECRET` is set: sign and submit the `rebalance` transaction
5. If only `SIGNER_PUBLIC_KEY` is set: print the assembled XDR to stdout

The asset-to-strategy mapping is configured in `src/rebalance.ts`. By default it maps USDC to the `USDC_BLEND_FIXED_STRATEGY` strategy on mainnet.

### Testnet mode

To run rebalance against a testnet vault:

```bash
pnpm rebalance:testnet
```

This reads credentials from `.env.test` (instead of `.env`) and uses testnet RPC/network passphrase. The strategy mapping switches to XLM Blend on testnet.

## Testing on Testnet

The `setup-test-vault` script creates a fully configured test environment on Stellar testnet:

```bash
pnpm setup-test-vault
```

The script will:

1. Generate a new random Stellar keypair
2. Fund the account via Friendbot (10,000 XLM)
3. Create a vault via the DeFindex factory with XLM + Blend strategy
4. Deposit 100 XLM as idle funds (not invested)
5. Write the credentials to `.env.test`

After setup completes, run `pnpm rebalance:testnet` to test the rebalance flow end-to-end.

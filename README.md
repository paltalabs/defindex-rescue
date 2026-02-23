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

| Variable | Description |
|---|---|
| `SIGNER_SECRET` | Stellar secret key of the account authorized to perform the rescue |
| `VAULT_ADDRESS` | Contract address of the DeFindex vault to rescue funds from |

## Rescue

Emergency rescue of funds from a strategy back to the vault. It will protect users funds and will pause the strategy. Funds will stay as IDLE FUNDS.

```bash
pnpm rescue
```

The script will:

1. Build an emergency rescue transaction for the specified vault and strategy
2. Sign the transaction with the provided signer key
3. Submit the signed transaction to the Stellar network

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
4. Execute a `rebalance` transaction on the vault

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

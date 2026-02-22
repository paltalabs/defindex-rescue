# Rescue DeFindex Vault

Script to perform an emergency rescue of funds from a DeFindex vault on the Stellar network using the [DeFindex SDK](https://www.npmjs.com/package/@defindex/sdk).

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
| `DEFINDEX_API_KEY` | API key for the DeFindex service |
| `DEFINDEX_API_URL` | Base URL of the DeFindex API |

## Usage

```bash
pnpm rescue
```

The script will:

1. Initialize the DeFindex SDK with your API credentials
2. Build an emergency rescue transaction for the specified vault and strategy
3. Sign the transaction with the provided signer key
4. Submit the signed transaction to the Stellar network

## Configuration

The strategy address to rescue from is currently hardcoded in `src/rescue.ts`. Update the `strategy_address` field in the `rescueData` object to target a different strategy.

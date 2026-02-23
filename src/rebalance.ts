import {
  Address,
  Contract,
  Keypair,
  Networks,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { config } from "dotenv";
import {
  RPC_URL,
  USDC_TOKEN,
  USDC_BLEND_YIELDBLOX_STRATEGY,
} from "./constants.js";

config();

// ============================================================
// CONFIGURATION - Edit these values before running
// ============================================================

const SIGNER_SECRET = process.env.SIGNER_SECRET as string;
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as string;

// Map each asset address to the strategy where idle funds should be invested.
// Key: asset token address, Value: strategy contract address
const ASSET_TO_STRATEGY: Record<string, string> = {
  [USDC_TOKEN]: USDC_BLEND_YIELDBLOX_STRATEGY,
  // Add more asset -> strategy mappings as needed:
  // [EURC_TOKEN]: EURC_BLEND_YIELDBLOX_STRATEGY,
};

// ============================================================

interface CurrentAssetInvestmentAllocation {
  asset: string;
  idle_amount: bigint;
  invested_amount: bigint;
  strategy_allocations: {
    amount: bigint;
    paused: boolean;
    strategy_address: string;
  }[];
  total_amount: bigint;
}

interface Instruction {
  type: "Invest";
  strategy: string;
  amount: bigint;
}

function mapInstructionsToScVal(instructions: Instruction[]): xdr.ScVal {
  const scValInstructions = instructions.map((ix) =>
    xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol(ix.type),
      new Address(ix.strategy).toScVal(),
      nativeToScVal(ix.amount, { type: "i128" }),
    ])
  );
  return xdr.ScVal.scvVec(scValInstructions);
}

async function main() {
  const server = new rpc.Server(RPC_URL);
  const callerKeypair = Keypair.fromSecret(SIGNER_SECRET);
  const vaultContract = new Contract(VAULT_ADDRESS);

  // ---- Step 1: Fetch total managed funds via simulation ----
  console.log("Fetching total managed funds...");

  const fetchOp = vaultContract.call("fetch_total_managed_funds");
  const source = await server.getAccount(callerKeypair.publicKey());

  const fetchTx = new TransactionBuilder(source, {
    fee: "3000",
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(fetchOp)
    .setTimeout(300)
    .build();

  const sim = await server.simulateTransaction(fetchTx);

  if (rpc.Api.isSimulationError(sim)) {
    console.error("Simulation error:", sim.error);
    throw new Error("Failed to simulate fetch_total_managed_funds");
  }

  const simResult = sim as rpc.Api.SimulateTransactionSuccessResponse;
  const retval = simResult.result?.retval;

  if (!retval) {
    throw new Error("No return value from fetch_total_managed_funds simulation");
  }

  const managedFunds = scValToNative(retval) as CurrentAssetInvestmentAllocation[];

  console.log("\n--- Managed Funds ---");
  for (const fund of managedFunds) {
    console.log(`Asset: ${fund.asset}`);
    console.log(`  Idle:     ${fund.idle_amount}`);
    console.log(`  Invested: ${fund.invested_amount}`);
    console.log(`  Total:    ${fund.total_amount}`);
    for (const alloc of fund.strategy_allocations) {
      console.log(`  Strategy: ${alloc.strategy_address} | Amount: ${alloc.amount} | Paused: ${alloc.paused}`);
    }
  }

  // ---- Step 2: Build Invest instructions for idle funds ----
  const investInstructions: Instruction[] = [];

  for (const fund of managedFunds) {
    if (fund.idle_amount <= 0n) continue;

    const strategyAddress = ASSET_TO_STRATEGY[fund.asset];
    if (!strategyAddress) {
      console.warn(`\nNo strategy configured for asset ${fund.asset}, skipping (idle: ${fund.idle_amount})`);
      continue;
    }

    investInstructions.push({
      type: "Invest",
      strategy: strategyAddress,
      amount: fund.idle_amount,
    });
  }

  if (investInstructions.length === 0) {
    console.log("\nNo idle funds to invest. Done.");
    return;
  }

  console.log("\n--- Invest Instructions ---");
  for (const ix of investInstructions) {
    console.log(`  ${ix.type} -> Strategy: ${ix.strategy} | Amount: ${ix.amount}`);
  }

  // ---- Step 3: Execute rebalance ----
  console.log("\nSending rebalance transaction...");

  const rebalanceParams: xdr.ScVal[] = [
    new Address(callerKeypair.publicKey()).toScVal(),
    mapInstructionsToScVal(investInstructions),
  ];

  const rebalanceOp = vaultContract.call("rebalance", ...rebalanceParams);

  // Refresh source account sequence number
  const freshSource = await server.getAccount(callerKeypair.publicKey());

  const rebalanceTx = new TransactionBuilder(freshSource, {
    fee: "3000",
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(rebalanceOp)
    .setTimeout(300)
    .build();

  const rebalanceSim = await server.simulateTransaction(rebalanceTx);

  if (rpc.Api.isSimulationError(rebalanceSim)) {
    console.error("Rebalance simulation error:", rebalanceSim.error);
    throw new Error("Failed to simulate rebalance");
  }

  const preppedTx = rpc.assembleTransaction(rebalanceTx, rebalanceSim).build();
  preppedTx.sign(callerKeypair);

  try {
    const response = await server.sendTransaction(preppedTx);
    const txHash = response.hash;
    console.log(`Transaction sent: ${txHash} | Status: ${response.status}`);

    let txResponse: any;
    while (response.status === "PENDING") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log(`Waiting for tx ${txHash}...`);
      txResponse = await server.getTransaction(txHash);

      if (txResponse.status === "SUCCESS") {
        console.log(`Rebalance transaction ${txHash} successful!`);
        break;
      }
      if (txResponse.status === "FAILED") {
        console.error(`Rebalance transaction ${txHash} failed.`);
        console.error(txResponse);
        break;
      }
    }
  } catch (error) {
    console.error("Error sending rebalance TX:", error);
    throw error;
  }
}

main().catch(console.error);

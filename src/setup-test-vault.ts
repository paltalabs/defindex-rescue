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
import { writeFileSync } from "fs";
import {
  TESTNET_RPC_URL,
  TESTNET_XLM_SAC,
  TESTNET_DEFINDEX_FACTORY,
  TESTNET_XLM_BLEND_STRATEGY,
  TESTNET_SOROSWAP_ROUTER,
} from "./constants.js";

// ============================================================
// Helpers
// ============================================================

async function sendTransaction(
  server: rpc.Server,
  tx: TransactionBuilder | ReturnType<TransactionBuilder["build"]>,
  keypair: Keypair,
  sim?: rpc.Api.SimulateTransactionResponse
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  const builtTx = "build" in tx && typeof tx.build === "function" ? tx.build() : tx;

  if (!sim) {
    sim = await server.simulateTransaction(builtTx as any);
  }

  if (rpc.Api.isSimulationError(sim)) {
    console.error("Simulation error:", (sim as any).error);
    throw new Error("Transaction simulation failed");
  }

  const assembled = rpc.assembleTransaction(builtTx as any, sim).build();
  assembled.sign(keypair);

  const response = await server.sendTransaction(assembled);
  const txHash = response.hash;
  console.log(`  TX sent: ${txHash} | Status: ${response.status}`);

  if (response.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${txHash}`);
  }

  // Poll until final
  let result: rpc.Api.GetTransactionResponse;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    result = await server.getTransaction(txHash);

    if (result.status === "SUCCESS") {
      console.log(`  TX confirmed: ${txHash}`);
      return result as rpc.Api.GetSuccessfulTransactionResponse;
    }
    if (result.status === "FAILED") {
      throw new Error(`Transaction failed on-chain: ${txHash}`);
    }
    console.log(`  Waiting for ${txHash}...`);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const server = new rpc.Server(TESTNET_RPC_URL);

  // ---- Step 1: Generate keypair ----
  const keypair = Keypair.random();
  console.log("Generated keypair:");
  console.log(`  Public:  ${keypair.publicKey()}`);
  console.log(`  Secret:  ${keypair.secret()}`);

  // ---- Step 2: Fund via Friendbot ----
  console.log("\nFunding account via Friendbot...");
  const friendbotResp = await fetch(
    `https://friendbot.stellar.org?addr=${keypair.publicKey()}`
  );
  if (!friendbotResp.ok) {
    throw new Error(`Friendbot failed: ${friendbotResp.status} ${await friendbotResp.text()}`);
  }
  console.log("  Account funded!");

  // ---- Step 3: Create vault via factory ----
  console.log("\nCreating vault via factory...");

  const factoryContract = new Contract(TESTNET_DEFINDEX_FACTORY);
  const callerAddress = new Address(keypair.publicKey());

  // roles: Map<u32, Address> — all 4 roles point to the same keypair
  // Emergency=0, FeeReceiver=1, Manager=2, RebalanceManager=3
  const roles = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: nativeToScVal(0, { type: "u32" }),
      val: callerAddress.toScVal(),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal(1, { type: "u32" }),
      val: callerAddress.toScVal(),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal(2, { type: "u32" }),
      val: callerAddress.toScVal(),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal(3, { type: "u32" }),
      val: callerAddress.toScVal(),
    }),
  ]);

  // vault_fee: 0
  const vaultFee = nativeToScVal(0, { type: "u32" });

  // assets: Vec<AssetStrategySet>
  // AssetStrategySet struct (alphabetical keys): { address, strategies }
  // Strategy struct (alphabetical keys): { address, name, paused }
  const xlmStrategy = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("address"),
      val: new Address(TESTNET_XLM_BLEND_STRATEGY).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("name"),
      val: xdr.ScVal.scvString("XLM Blend Strategy"),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("paused"),
      val: xdr.ScVal.scvBool(false),
    }),
  ]);

  const assetStrategySet = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("address"),
      val: new Address(TESTNET_XLM_SAC).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("strategies"),
      val: xdr.ScVal.scvVec([xlmStrategy]),
    }),
  ]);

  const assets = xdr.ScVal.scvVec([assetStrategySet]);

  // soroswap_router
  const soroswapRouter = new Address(TESTNET_SOROSWAP_ROUTER).toScVal();

  // name_symbol: Map<String, String>
  const nameSymbol = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvString("name"),
      val: xdr.ScVal.scvString("Test XLM Vault"),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvString("symbol"),
      val: xdr.ScVal.scvString("tXLMv"),
    }),
  ]);

  // upgradable: false
  const upgradable = xdr.ScVal.scvBool(false);

  const createOp = factoryContract.call(
    "create_defindex_vault",
    roles,
    vaultFee,
    assets,
    soroswapRouter,
    nameSymbol,
    upgradable
  );

  const source = await server.getAccount(keypair.publicKey());
  const createTx = new TransactionBuilder(source, {
    fee: "10000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(createOp)
    .setTimeout(300)
    .build();

  const createResult = await sendTransaction(server, createTx, keypair);

  // Extract vault address from the return value
  const vaultAddress = scValToNative(createResult.returnValue!) as string;
  console.log(`  Vault created: ${vaultAddress}`);

  // ---- Step 4: Deposit XLM as idle funds ----
  console.log("\nDepositing 100 XLM into vault (idle)...");

  const vaultContract = new Contract(vaultAddress);
  const depositAmount = 100n * 10_000_000n; // 100 XLM in stroops

  const depositParams: xdr.ScVal[] = [
    // amounts_desired: Vec<i128>
    xdr.ScVal.scvVec([nativeToScVal(depositAmount, { type: "i128" })]),
    // amounts_min: Vec<i128>
    xdr.ScVal.scvVec([nativeToScVal(depositAmount, { type: "i128" })]),
    // from: Address
    callerAddress.toScVal(),
    // invest: bool
    xdr.ScVal.scvBool(false),
  ];

  const depositOp = vaultContract.call("deposit", ...depositParams);

  const freshSource = await server.getAccount(keypair.publicKey());
  const depositTx = new TransactionBuilder(freshSource, {
    fee: "10000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(depositOp)
    .setTimeout(300)
    .build();

  await sendTransaction(server, depositTx, keypair);
  console.log("  Deposit successful!");

  // ---- Step 5: Write .env.test ----
  const envContent = [
    `SIGNER_SECRET=${keypair.secret()}`,
    `VAULT_ADDRESS=${vaultAddress}`,
    `NETWORK=testnet`,
    "",
  ].join("\n");

  writeFileSync(".env.test", envContent);
  console.log("\n.env.test written successfully!");
  console.log("\nSetup complete. You can now run:");
  console.log("  pnpm rebalance:testnet");
}

main().catch(console.error);

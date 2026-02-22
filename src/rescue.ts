import DefindexSDK, { RescueFromVaultParams, SupportedNetworks } from "@defindex/sdk";
import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { config } from "dotenv";

config();

const SIGNER_SECRET = process.env.SIGNER_SECRET as string
const VAULT_ADDRESS = process.env.SIGNER_SECRET as string

async function main() {
  const callerKeypair = Keypair.fromSecret(SIGNER_SECRET);

  const defindexSdk = new DefindexSDK({
    apiKey: process.env.DEFINDEX_API_KEY as string,
    baseUrl: process.env.DEFINDEX_API_URL as string,
  });

  const rescueData: RescueFromVaultParams = {
    strategy_address: "CCSRX5E4337QMCMC3KO3RDFYI57T5NZV5XB3W3TWE4USCASKGL5URKJL",
    caller: callerKeypair.publicKey()
  }

  const rescueResponse = await defindexSdk.emergencyRescue(
    VAULT_ADDRESS,
    rescueData,
    SupportedNetworks.MAINNET
  );
  console.log("🚀 | main | rescueResponse:", JSON.stringify(rescueResponse, null, 2));

  const transaction = TransactionBuilder.fromXDR(rescueResponse.xdr as string, Networks.PUBLIC) as Transaction;

  transaction.sign(callerKeypair);

  await new Promise(resolve => setTimeout(resolve, 1000))

  try {
    const response = await defindexSdk.sendTransaction(transaction.toXDR(), SupportedNetworks.TESTNET)
    console.log("🚀 | main | response:", response)
  } catch (error) {
    console.log("🚀 Error sending TX:", error)
  }
}

main().catch(console.error);

import { Address, Contract, Keypair, Networks, rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { config } from "dotenv";
import { RPC_URL, USDC_BLEND_YIELDBLOX_STRATEGY } from "./constants.js";

config();

const SIGNER_SECRET = process.env.SIGNER_SECRET as string | undefined
const SIGNER_PUBLIC_KEY = process.env.SIGNER_PUBLIC_KEY as string | undefined
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as string

async function main() {
  const callerKeypair = SIGNER_SECRET ? Keypair.fromSecret(SIGNER_SECRET) : null
  const publicKey = callerKeypair ? callerKeypair.publicKey() : SIGNER_PUBLIC_KEY

  if (!publicKey) {
    throw new Error("Must provide either SIGNER_SECRET or SIGNER_PUBLIC_KEY in environment")
  }

  const vaultContract = new Contract(VAULT_ADDRESS);

  const rescueParams: xdr.ScVal[] = [
    new Address(USDC_BLEND_YIELDBLOX_STRATEGY).toScVal(),
    new Address(publicKey).toScVal(),
  ]

  const rescueOperation = vaultContract.call("rescue", ...rescueParams)

  const server = new rpc.Server(RPC_URL)

  const source = await server.getAccount(publicKey)

  const txBuilder = new TransactionBuilder(source, {
    fee: "3000",
    networkPassphrase: Networks.PUBLIC
  }).addOperation(rescueOperation).setTimeout(300).build()

  const sim = await server.simulateTransaction(txBuilder)

  const preppedTx = rpc.assembleTransaction(txBuilder, sim).build()

  if (!callerKeypair) {
    console.log("\nNo SIGNER_SECRET provided. Sign and submit the following XDR:\n")
    console.log(preppedTx.toXDR())
    return
  }

  preppedTx.sign(callerKeypair)

  try {
    const response = await server.sendTransaction(preppedTx)
    const txHash = response.hash
    const initialStatus = response.status

    let txResponse: any
    while (initialStatus === 'PENDING') {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      console.log(`waiting for tx ${txHash}`)
      txResponse = await server.getTransaction(txHash)
      console.log(`🚀 | Transaction ${txHash} | txResponse:`, txResponse)

      if (txResponse.status === 'SUCCESS') {
        console.log(`Transaction ${txHash} successful`)
        break
      }
    }

    console.log(txResponse)
  } catch (error) {
    console.log("🚀 Error sending TX:", error)
  }
}

main().catch(console.error);

import { Address, Contract, Keypair, Networks, rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { config } from "dotenv";

config();

const SIGNER_SECRET = process.env.SIGNER_SECRET as string
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as string

async function main() {
  const callerKeypair = Keypair.fromSecret(SIGNER_SECRET);

  const vaultContract = new Contract(VAULT_ADDRESS);

  const rescueParams: xdr.ScVal[] = [
    new Address("CCSRX5E4337QMCMC3KO3RDFYI57T5NZV5XB3W3TWE4USCASKGL5URKJL").toScVal(),
    new Address(callerKeypair.publicKey()).toScVal(),
  ]

  const rescueOperation = vaultContract.call("rescue", ...rescueParams)

  const server = new rpc.Server("https://rpc.lightsail.network")

  const source = await server.getAccount(callerKeypair.publicKey())

  const txBuilder = new TransactionBuilder(source, {
    fee: "3000",
    networkPassphrase: Networks.PUBLIC
  }).addOperation(rescueOperation).setTimeout(300).build()

  const sim = await server.simulateTransaction(txBuilder)

  const preppedTx = rpc.assembleTransaction(txBuilder, sim).build()

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

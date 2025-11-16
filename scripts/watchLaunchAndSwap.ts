import * as anchor from "@coral-xyz/anchor";
import {
  FutarchyClient,
  LaunchpadClient,
  type LaunchCompletedEvent,
} from "@metadaoproject/futarchy/v0.6";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import dotenv from "dotenv";

dotenv.config();

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const launchpadClient = LaunchpadClient.createClient({ provider });
const futarchyClient: FutarchyClient = launchpadClient.autocratClient;

const targetLaunch = getRequiredPublicKey("TARGET_LAUNCH");
const liquidityThreshold = getBnFromEnv("MIN_POOL_LIQUIDITY", "0");
const swapInputAmount = getBnFromEnv("SPOT_SWAP_INPUT_AMOUNT", "0");
const minSwapOutput = getBnFromEnv("SPOT_SWAP_MIN_OUTPUT", "0");
const swapDirection = (process.env.SPOT_SWAP_DIRECTION || "buy")
  .trim()
  .toLowerCase();

if (swapDirection !== "buy" && swapDirection !== "sell") {
  throw new Error(
    `SPOT_SWAP_DIRECTION must be either "buy" or "sell" (received: ${swapDirection})`,
  );
}

console.log("Listening for LaunchCompletedEvent events...");
console.log("Target launch:", targetLaunch.toBase58());
console.log("Liquidity threshold:", liquidityThreshold.toString());
console.log("Swap direction:", swapDirection);
console.log("Swap input amount:", swapInputAmount.toString());
console.log("Minimum swap output:", minSwapOutput.toString());

const eventParser = new anchor.EventParser(
  launchpadClient.getProgramId(),
  launchpadClient.launchpad.coder,
);

const listener = provider.connection.onLogs(
  launchpadClient.getProgramId(),
  (logInfo) => {
    void handleLogs(logInfo).catch((error) => {
      console.error("Failed to handle logs", error);
    });
  },
  "confirmed",
);

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down...");
  void provider.connection.removeOnLogsListener(listener).finally(() => {
    process.exit(0);
  });
});

process.stdin.resume();

async function handleLogs(logInfo: anchor.web3.Logs) {
  for (const event of eventParser.parseLogs(logInfo.logs)) {
    if (event.name !== "LaunchCompletedEvent") {
      continue;
    }

    const launchEvent = event.data as LaunchCompletedEvent;
    logLaunchCompletedEvent(logInfo.signature, launchEvent);

    if (!launchEvent.launch.equals(targetLaunch)) {
      continue;
    }

    await handleTargetLaunch(launchEvent);
  }
}

async function handleTargetLaunch(event: LaunchCompletedEvent) {
  if (!event.dao) {
    console.warn("Target launch completed without creating a DAO; skipping");
    return;
  }

  const dao = event.dao;
  const daoAccount = await futarchyClient.getDao(dao);
  const totalLiquidity = daoAccount.amm.totalLiquidity as BN;

  console.log(
    `DAO ${dao.toBase58()} AMM total liquidity: ${totalLiquidity.toString()}`,
  );

  if (totalLiquidity.lt(liquidityThreshold)) {
    console.log(
      `Liquidity ${totalLiquidity.toString()} below threshold ${liquidityThreshold.toString()}; not swapping`,
    );
    return;
  }

  if (swapInputAmount.isZero()) {
    console.log("Swap input amount is 0; skipping spot swap");
    return;
  }

  console.log(
    `Executing ${swapDirection} spot swap of ${swapInputAmount.toString()} with minimum output ${minSwapOutput.toString()}`,
  );

  const signature = await futarchyClient
    .spotSwapIx({
      dao,
      baseMint: daoAccount.baseMint,
      quoteMint: daoAccount.quoteMint,
      swapType: swapDirection === "buy" ? "buy" : "sell",
      inputAmount: swapInputAmount,
      minOutputAmount: minSwapOutput,
      trader: provider.wallet.publicKey,
    })
    .rpc();

  console.log("Spot swap transaction signature:", signature);
}

function logLaunchCompletedEvent(
  signature: string,
  event: LaunchCompletedEvent,
) {
  const finalState = Object.keys(event.finalState)[0];
  console.log("\nLaunchCompletedEvent received:");
  console.log({
    signature,
    launch: event.launch.toBase58(),
    slot: event.common.slot,
    unixTimestamp: event.common.unixTimestamp,
    launchSeqNum: event.common.launchSeqNum,
    finalState,
    totalCommitted: event.totalCommitted.toString(),
    finalRaiseAmount: event.finalRaiseAmount
      ? event.finalRaiseAmount.toString()
      : null,
    dao: event.dao?.toBase58() ?? null,
    daoTreasury: event.daoTreasury?.toBase58() ?? null,
  });
}

function getRequiredPublicKey(envKey: string): PublicKey {
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`${envKey} must be provided in the environment`);
  }

  return new PublicKey(value);
}

function getBnFromEnv(envKey: string, fallback: string): BN {
  const raw = process.env[envKey];
  const value = raw && raw.trim().length > 0 ? raw : fallback;
  if (!value.match(/^\d+$/)) {
    throw new Error(
      `${envKey} must be a non-negative integer (received: ${value})`,
    );
  }

  return new BN(value, 10);
}

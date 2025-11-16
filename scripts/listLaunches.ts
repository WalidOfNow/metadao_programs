import * as anchor from "@coral-xyz/anchor";
import { LaunchpadClient, type Launch } from "@metadaoproject/futarchy/v0.6";
import { PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const launchpadClient = LaunchpadClient.createClient({ provider });

void main().catch((error) => {
  console.error("Failed to list launches", error);
  process.exit(1);
});

async function main() {
  const programId = launchpadClient.getProgramId();
  console.log("Fetching launch accounts for program:", programId.toBase58());

  const launches = await launchpadClient.launchpad.account.launch.all();
  const sorted = launches.sort((a, b) => {
    const aSeq = BigInt(a.account.seqNum.toString());
    const bSeq = BigInt(b.account.seqNum.toString());
    if (aSeq === bSeq) {
      return 0;
    }

    return aSeq < bSeq ? -1 : 1;
  });

  console.log(`Found ${sorted.length} launch account(s)`);

  for (const launchAccount of sorted) {
    console.log("\nLaunch account:");
    console.log(
      JSON.stringify(
        formatLaunch(launchAccount.publicKey, launchAccount.account),
        null,
        2,
      ),
    );
  }
}

function formatLaunch(publicKey: PublicKey, launch: Launch) {
  return {
    launch: publicKey.toBase58(),
    seqNum: launch.seqNum.toString(),
    state: Object.keys(launch.state)[0],
    baseMint: launch.baseMint.toBase58(),
    quoteMint: launch.quoteMint.toBase58(),
    launchAuthority: launch.launchAuthority.toBase58(),
    launchSigner: launch.launchSigner.toBase58(),
    launchSignerPdaBump: launch.launchSignerPdaBump,
    launchQuoteVault: launch.launchQuoteVault.toBase58(),
    launchBaseVault: launch.launchBaseVault.toBase58(),
    minimumRaiseAmount: launch.minimumRaiseAmount.toString(),
    monthlySpendingLimitAmount: launch.monthlySpendingLimitAmount.toString(),
    monthlySpendingLimitMembers: launch.monthlySpendingLimitMembers.map(
      (member) => member.toBase58(),
    ),
    performancePackageGrantee: launch.performancePackageGrantee.toBase58(),
    performancePackageTokenAmount:
      launch.performancePackageTokenAmount.toString(),
    monthsUntilInsidersCanUnlock: launch.monthsUntilInsidersCanUnlock,
    teamAddress: launch.teamAddress.toBase58(),
    secondsForLaunch: launch.secondsForLaunch,
    unixTimestampStarted: formatOptionalBn(launch.unixTimestampStarted),
    unixTimestampClosed: formatOptionalBn(launch.unixTimestampClosed),
    totalCommittedAmount: launch.totalCommittedAmount.toString(),
    finalRaiseAmount: formatOptionalBn(launch.finalRaiseAmount),
    dao: formatOptionalPublicKey(launch.dao),
    daoVault: formatOptionalPublicKey(launch.daoVault),
  };
}

function formatOptionalBn(value: anchor.BN | null | undefined): string | null {
  return value ? value.toString() : null;
}

function formatOptionalPublicKey(
  value: PublicKey | null | undefined,
): string | null {
  return value ? value.toBase58() : null;
}

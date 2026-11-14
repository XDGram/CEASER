import { Account, Connection, KeyPair, keyStores } from "near-api-js";
import { CONFIG } from "../config";

// One-click testnet accounts for people without a wallet. The key is generated in the
// browser and kept only in this browser's localStorage; nothing secret ships in the bundle.
const STORE = "ceaser:demo-account";
const FAUCET = "https://helper.nearprotocol.com/account";
const START_TOKENS = 250000n;

export interface DemoAccount {
  accountId: string;
  secretKey: string;
}

export function loadDemo(): DemoAccount | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as DemoAccount) : null;
  } catch {
    return null;
  }
}

export function forgetDemo(): void {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* private mode */
  }
}

export function demoAccount(d: DemoAccount): Account {
  const keyStore = new keyStores.InMemoryKeyStore();
  keyStore.setKey(CONFIG.network, d.accountId, KeyPair.fromString(d.secretKey as Parameters<typeof KeyPair.fromString>[0]));
  const connection = Connection.fromConfig({
    networkId: CONFIG.network,
    provider: { type: "JsonRpcProvider", args: { url: CONFIG.nodeUrl } },
    signer: { type: "InMemorySigner", keyStore },
  });
  return new Account(connection, d.accountId);
}

/** Creates a fresh testnet account through the public faucet, then mints it some CSTEST. */
export async function createDemoAccount(onStep?: (s: string) => void): Promise<DemoAccount> {
  if (CONFIG.network !== "testnet") throw new Error("Demo accounts are testnet only");
  const kp = KeyPair.fromRandom("ed25519");
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  const accountId = `ceaser-demo-${rand}.testnet`;
  onStep?.("Creating your testnet account");
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`The testnet faucet refused (${res.status}). Try again in a minute.`);
  const d: DemoAccount = { accountId, secretKey: kp.toString() };
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
  } catch {
    throw new Error("This browser blocks local storage, so a demo account cannot be kept.");
  }

  onStep?.("Minting test CSTEST");
  const account = demoAccount(d);
  // The faucet account may take a moment to become visible to the RPC node.
  for (let i = 0; ; i++) {
    try {
      await account.functionCall({
        contractId: CONFIG.contracts.token,
        methodName: "mint",
        args: { account_id: accountId, amount: (START_TOKENS * 10n ** 18n).toString() },
        gas: 30_000_000_000_000n,
        attachedDeposit: 0n,
      });
      break;
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return d;
}

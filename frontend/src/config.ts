// Mirrors scripts/deployed.json (the live testnet deployment).
export const CONFIG = {
  network: "testnet" as const,
  // fastnear leads: rpc.testnet.near.org rate-limits browser bursts and its 429
  // responses carry no CORS headers, which surfaces as "Failed to fetch".
  nodeUrl: "https://test.rpc.fastnear.com",
  // Public testnet RPCs tried in order by the failover provider. All four answer
  // call_function queries with CORS enabled for browsers (checked 2026-11-13).
  rpcUrls: [
    "https://test.rpc.fastnear.com",
    "https://near-testnet.drpc.org",
    "https://rpc.testnet.near.org",
    "https://archival-rpc.testnet.near.org",
  ],
  walletUrl: "https://testnet.mynearwallet.com",
  explorerUrl: "https://testnet.nearblocks.io",
  // The Floor (community feed) storage. The anon key is a public, publishable
  // key, safe to ship in the client; RLS limits what it can do.
  supabaseUrl: "https://ncbrsrklofofdqdftwjw.supabase.co",
  supabaseAnonKey: "sb_publishable_O3ev7dyTwadU-uAlsB-2Mw_3Y6SFuV7",
  contracts: {
    vault: "ceaser-vault-756e8a.testnet",
    oracle: "ceaser-oracle-756e8a.testnet",
    token: "ceaser-token-756e8a.testnet",
    // Testnet stand-in that seeded demo locks point at (owner-set balances).
    staking_pool: "ceaser-pool-756e8a.testnet",
    // A real NEAR testnet validator pool (NEAR's core staking-pool contract).
    // New locks use it for the boost once the vault whitelists it.
    validator_pool: "legends.pool.f863973.m0",
    // Receives the 0.01 NEAR posting fee. Mirrors "treasury" in scripts/deployed.json.
    treasury: "ceaser-treasury-756e8a.testnet",
  },
  gas: {
    ftTransferCall: "150000000000000",
    call: "100000000000000",
    createChallenge: "30000000000000",
  },
  oneYocto: "1",
};

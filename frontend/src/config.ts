// Mirrors scripts/deployed.json (the live testnet deployment).
export const CONFIG = {
  network: "testnet" as const,
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://testnet.mynearwallet.com",
  explorerUrl: "https://testnet.nearblocks.io",
  contracts: {
    vault: "ceaser-vault-756e8a.testnet",
    oracle: "ceaser-oracle-756e8a.testnet",
    token: "ceaser-token-756e8a.testnet",
    staking_pool: "ceaser-pool-756e8a.testnet",
  },
  gas: {
    ftTransferCall: "150000000000000",
    call: "100000000000000",
    createChallenge: "30000000000000",
  },
  oneYocto: "1",
};

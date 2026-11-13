// CEASER frontend configuration.
// Mirrors scripts/deployed.json. Replace the placeholder ids after `demo.sh`
// deploys the contracts, or paste the contents of deployed.json into `contracts`.
window.CEASER_CONFIG = {
  network: "testnet",
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://testnet.mynearwallet.com",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://testnet.nearblocks.io",

  // Placeholders until scripts/deployed.json exists.
  contracts: {
    vault: "vault.ceaser.testnet",
    oracle: "oracle.ceaser.testnet",
    token: "cstest.ceaser.testnet",
    staking_pool: "pool.ceaser.testnet",
  },

  // Gas and deposits, as strings (yoctoNEAR / gas units).
  gas: {
    ftTransferCall: "150000000000000", // 150 TGas, spec asks for >= 100
    call: "100000000000000",           // 100 TGas for check_unlock / claim / early_exit
    createChallenge: "30000000000000",
  },
  oneYocto: "1",
};

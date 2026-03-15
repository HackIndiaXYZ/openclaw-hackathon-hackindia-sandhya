require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // Local Ganache
    ganache: {
      url: process.env.BLOCKCHAIN_RPC || "http://127.0.0.1:7545",
      accounts: { mnemonic: process.env.GANACHE_MNEMONIC || "test test test test test test test test test test test junk" },
      chainId: 1337,
    },
    // Hardhat built-in network (for quick tests without Ganache)
    hardhat: {
      chainId: 1337,
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

// blockchain/scripts/deploy.js
// Run: cd blockchain && npx hardhat run scripts/deploy.js --network ganache

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log("\n🚀 Deploying SafeGuardRegistry...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance: ", ethers.formatEther(balance), "ETH\n");

  const Factory  = await ethers.getContractFactory("SafeGuardRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ Contract deployed at:", address);

  // Save address + ABI to .env and routes/blockchain.js can pick it up
  const envPath = path.join(__dirname, "../../.env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const lines = envContent.split("\n").filter(l => !l.startsWith("CONTRACT_ADDRESS") && !l.startsWith("BLOCKCHAIN_RPC"));
  const rpc   = process.env.BLOCKCHAIN_RPC || "http://127.0.0.1:7545";
  lines.push(`CONTRACT_ADDRESS=${address}`);
  lines.push(`BLOCKCHAIN_RPC=${rpc}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n");

  // Also save ABI for backend
  const artifact = require("../artifacts/contracts/SafeGuardRegistry.sol/SafeGuardRegistry.json");
  const abiPath  = path.join(__dirname, "../../routes/SafeGuardRegistry.abi.json");
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));

  console.log("\n📝 Saved to ../.env:");
  console.log("   CONTRACT_ADDRESS =", address);
  console.log("   BLOCKCHAIN_RPC   =", rpc);
  console.log("\n📄 ABI saved to routes/SafeGuardRegistry.abi.json");

  // Smoke test
  const owner = await contract.owner();
  const stats = await contract.getStats();
  console.log("\n🧪 Smoke test:");
  console.log("   owner:", owner);
  console.log("   stats:", stats.total.toString(), "total,", stats.active.toString(), "active");
  console.log("\n🎉 Done! Restart: node server.js\n");
}

main().catch(e => { console.error(e); process.exit(1); });

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TipJar} from "../src/TipJar.sol";

contract DeployTipJar is Script {
    function run() external returns (address tipJarAddress) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address claimSigner = vm.envAddress("CLAIM_SIGNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        TipJar tipJar = new TipJar(claimSigner);
        tipJarAddress = address(tipJar);

        vm.stopBroadcast();

        console2.log("=== TipJar Deployed to Monad Testnet ===");
        console2.log("TipJar Address:     ", tipJarAddress);
        console2.log("Owner:              ", tipJar.owner());
        console2.log("Claim Signer:       ", tipJar.claimSigner());
        console2.log("Chain ID:           ", block.chainid);
        console2.log("Monadscan Link:     ", string.concat("https://testnet.monadscan.com/address/", vm.toString(tipJarAddress)));
        console2.log("MonadVision Link:   ", string.concat("https://testnet.monadvision.com/address/", vm.toString(tipJarAddress)));
    }
}

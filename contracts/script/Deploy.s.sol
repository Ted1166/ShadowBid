// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ShadowBidFactory} from "../src/ShadowBidFactory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address cToken      = vm.envAddress("NOX_CONFIDENTIAL_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);

        ShadowBidFactory factory = new ShadowBidFactory(cToken);

        console.log("ShadowBidFactory deployed at:", address(factory));
        console.log("Using cToken:                ", cToken);
        console.log("Deployer:                    ", vm.addr(deployerKey));

        vm.stopBroadcast();
    }
}

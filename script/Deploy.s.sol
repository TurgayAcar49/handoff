// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Handoff} from "../contracts/Handoff.sol";

/// @notice Deploy Handoff. On Arc, leave USDC_ADDRESS unset so the script uses the canonical precompile.
contract DeployHandoff is Script {
    function run() external returns (Handoff desk) {
        address usdc = vm.envOr("USDC_ADDRESS", Handoff.ARC_USDC);
        vm.startBroadcast();
        desk = new Handoff(usdc);
        vm.stopBroadcast();
        console2.log("Handoff", address(desk));
        console2.log("USDC", usdc);
    }
}

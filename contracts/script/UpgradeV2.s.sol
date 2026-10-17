// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";
import {LyntoPaymentsV2} from "../src/LyntoPaymentsV2.sol";

/// @notice Upgrade an existing LyntoPayments proxy to the V2 implementation.
/// @dev Required env vars:
///   PROXY_ADDRESS - address of the deployed ERC1967Proxy (LyntoPayments)
///   The broadcaster must be the current contract owner (UUPS _authorizeUpgrade).
contract UpgradeV2 is Script {
    // ERC-1967 implementation slot
    bytes32 private constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function run() external returns (address proxyAddress, address oldImpl, address newImpl) {
        proxyAddress = vm.envAddress("PROXY_ADDRESS");

        oldImpl = address(uint160(uint256(vm.load(proxyAddress, IMPLEMENTATION_SLOT))));

        vm.startBroadcast();
        LyntoPaymentsV2 v2 = new LyntoPaymentsV2();
        newImpl = address(v2);
        LyntoPayments(proxyAddress).upgradeToAndCall(newImpl, "");
        vm.stopBroadcast();

        console.log("Proxy:", proxyAddress);
        console.log("Previous implementation:", oldImpl);
        console.log("New implementation:", newImpl);
    }
}

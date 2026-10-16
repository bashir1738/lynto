// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";

/// @notice Deploy LyntoPayments to Arc (mainnet or testnet).
/// @dev Required env vars:
///   USDC_ADDRESS      - ERC-20 USDC (Arc mainnet: 0x3600000000000000000000000000000000000000)
///   PROVIDER_ADDRESS  - wallet that receives settled payments
///   OWNER_ADDRESS     - contract owner (manages operators/provider)
///   OPERATOR_ADDRESS  - optional; if set, authorizes this operator post-deploy
contract Deploy is Script {
    function run() external returns (LyntoPayments lynto) {
        address usdcAddr = vm.envAddress("USDC_ADDRESS");
        address provider = vm.envAddress("PROVIDER_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address operator = vm.envOr("OPERATOR_ADDRESS", address(0));

        vm.startBroadcast();
        lynto = new LyntoPayments(usdcAddr, provider, owner);

        if (operator != address(0) && owner == msg.sender) {
            // If broadcaster is owner, authorize operator in same flow
            lynto.setOperator(operator, true);
        } else if (operator != address(0)) {
            // Broadcaster is not owner — log that owner must call setOperator
            console.log("NOTE: Call setOperator(", operator, ", true) from owner");
        }
        vm.stopBroadcast();

        console.log("LyntoPayments deployed at:", address(lynto));
        console.log("USDC:", usdcAddr);
        console.log("Provider:", provider);
        console.log("Owner:", owner);
        console.log("Operator:", operator);
    }
}

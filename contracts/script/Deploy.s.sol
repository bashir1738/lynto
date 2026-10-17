// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";

/// @notice Deploy LyntoPayments (UUPS behind an ERC1967Proxy) to Arc.
/// @dev Required env vars:
///   USDC_ADDRESS      - ERC-20 USDC (Arc mainnet: 0x3600000000000000000000000000000000000000)
///   PROVIDER_ADDRESS  - wallet that receives settled payments
///   OWNER_ADDRESS     - contract owner (manages operators/provider)
///   OPERATOR_ADDRESS  - optional; if set, authorizes this operator post-deploy
contract Deploy is Script {
    function run()
        external
        returns (LyntoPayments lynto, address proxyAddress, address implementationAddress)
    {
        address usdcAddr = vm.envAddress("USDC_ADDRESS");
        address provider = vm.envAddress("PROVIDER_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address operator = vm.envOr("OPERATOR_ADDRESS", address(0));

        vm.startBroadcast();

        // Implementation (constructor disables its own initializers).
        LyntoPayments implementation = new LyntoPayments();

        // Proxy initialized in the same transaction.
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(LyntoPayments.initialize, (usdcAddr, provider, owner))
        );
        lynto = LyntoPayments(address(proxy));

        if (operator != address(0) && owner == msg.sender) {
            // If broadcaster is owner, authorize operator in same flow
            lynto.setOperator(operator, true);
        } else if (operator != address(0)) {
            // Broadcaster is not owner — log that owner must call setOperator
            console.log("NOTE: Call setOperator(", operator, ", true) from owner");
        }

        vm.stopBroadcast();

        proxyAddress = address(proxy);
        implementationAddress = address(implementation);

        console.log("LyntoPayments proxy deployed at:", proxyAddress);
        console.log("LyntoPayments implementation:", implementationAddress);
        console.log("USDC:", usdcAddr);
        console.log("Provider:", provider);
        console.log("Owner:", owner);
        console.log("Operator:", operator);
    }
}

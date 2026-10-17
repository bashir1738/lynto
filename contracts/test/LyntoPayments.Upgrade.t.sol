// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";
import {LyntoPaymentsV2} from "../src/LyntoPaymentsV2.sol";
import {LyntoPaymentsBase} from "./LyntoPaymentsBase.t.sol";

/// @notice Phase 1 upgradeability tests: UUPS authorization, initializer
///         guards, and state survival across an upgrade to V2.
contract LyntoPaymentsUpgradeTest is LyntoPaymentsBase {
    // ERC-1967 implementation slot
    bytes32 constant IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    // =====================================================================
    // Initializer guards
    // =====================================================================

    function test_bareImplementationCannotBeInitialized() public {
        LyntoPayments fresh = new LyntoPayments();

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        fresh.initialize(address(usdc), provider, owner);
    }

    function test_initializeCannotRunTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        lynto.initialize(address(usdc), provider, owner);
    }

    function test_ownerIsSetThroughInitialize() public view {
        assertEq(lynto.owner(), owner);
        assertEq(lynto.provider(), provider);
        assertEq(address(lynto.usdc()), address(usdc));
    }

    // =====================================================================
    // Upgrade authorization
    // =====================================================================

    function test_upgrade_onlyOwnerReverts() public {
        LyntoPaymentsV2 v2 = new LyntoPaymentsV2();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        lynto.upgradeToAndCall(address(v2), "");

        // Implementation slot untouched
        assertEq(
            vm.load(address(lynto), IMPLEMENTATION_SLOT),
            bytes32(uint256(uint160(address(lyntoImpl))))
        );
    }

    function test_upgrade_ownerSucceedsAndEmitsEvent() public {
        LyntoPaymentsV2 v2 = new LyntoPaymentsV2();

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit UpgradeAuthorized(address(v2));
        lynto.upgradeToAndCall(address(v2), "");

        assertEq(
            vm.load(address(lynto), IMPLEMENTATION_SLOT), bytes32(uint256(uint160(address(v2))))
        );
    }

    // =====================================================================
    // State survival across upgrade
    // =====================================================================

    function test_stateSurvivesUpgradeToV2() public {
        // Arrange: deposits, reserves, a settlement, a release, a withdrawal
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(stranger);
        lynto.deposit(5 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 4 * ONE_USDC);
        lynto.reserve(stranger, 1 * ONE_USDC);
        lynto.settle(agent1, 3 * ONE_USDC, keccak256("upgrade-batch"));
        lynto.release(stranger, 1 * ONE_USDC, 0, 1);
        vm.stopPrank();

        withdrawNow(agent1, 2 * ONE_USDC);

        bytes32 batchId = keccak256("upgrade-batch");
        address proxyAddr = address(lynto);

        // Sanity: pre-upgrade state
        _assertState(proxyAddr, batchId);

        // Upgrade to V2
        LyntoPaymentsV2 v2 = new LyntoPaymentsV2();
        vm.prank(owner);
        lynto.upgradeToAndCall(address(v2), "");

        // Same proxy address, implementation slot updated, V1 state intact
        assertEq(address(lynto), proxyAddr);
        assertEq(
            vm.load(address(lynto), IMPLEMENTATION_SLOT), bytes32(uint256(uint160(address(v2))))
        );
        _assertState(proxyAddr, batchId);

        // New V2 field is readable (defaults to 0) and writable, and writing
        // it does not disturb V1 fields.
        LyntoPaymentsV2 upgraded = LyntoPaymentsV2(proxyAddr);
        assertEq(upgraded.v2Counter(), 0);
        vm.prank(owner);
        upgraded.setV2Counter(42);
        assertEq(upgraded.v2Counter(), 42);
        _assertState(proxyAddr, batchId);
    }

    function _assertState(address proxyAddr, bytes32 batchId) internal view {
        assertEq(address(lynto), proxyAddr);

        // agent1: deposited 10, settled 3, withdrawn 2 => balance 5
        // reserved: 4 - 3 settled = 1
        assertEq(lynto.balanceOf(agent1), 5 * ONE_USDC);
        assertEq(lynto.totalDeposited(agent1), 10 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 2 * ONE_USDC);
        assertEq(lynto.totalSettled(agent1), 3 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 1 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 4 * ONE_USDC);

        // stranger: deposited 5, reserved 1, released 1 => untouched balance
        assertEq(lynto.balanceOf(stranger), 5 * ONE_USDC);
        assertEq(lynto.reservedOf(stranger), 0);

        // Conservation: contract holds sum of balances
        uint256 sum = lynto.balanceOf(agent1) + lynto.balanceOf(stranger);
        assertEq(sum, 10 * ONE_USDC);
        assertEq(usdc.balanceOf(address(lynto)), sum);
        assertEq(usdc.balanceOf(provider), 3 * ONE_USDC);

        assertTrue(lynto.isBatchSettled(batchId));
        assertTrue(lynto.isOperator(operator));
        assertEq(lynto.provider(), provider);
        assertEq(address(lynto.usdc()), address(usdc));
        assertEq(lynto.owner(), owner);
    }

    // =====================================================================
    // V2 behaviors still gated correctly after upgrade
    // =====================================================================

    function test_v2AdminFunctionsOnlyOwner() public {
        LyntoPaymentsV2 v2 = new LyntoPaymentsV2();
        vm.prank(owner);
        lynto.upgradeToAndCall(address(v2), "");

        LyntoPaymentsV2 upgraded = LyntoPaymentsV2(address(lynto));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        upgraded.setV2Counter(1);
    }
}

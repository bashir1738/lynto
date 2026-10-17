// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LyntoPaymentsBase} from "./LyntoPaymentsBase.t.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";

/// @notice Phase 4 tests: `release` carries an off-chain requestId and a
///         strict reason code, emits UsageReleased alongside the legacy
///         ReservationReleased event, and otherwise behaves exactly as before.
contract LyntoPaymentsReleaseTest is LyntoPaymentsBase {
    function _depositAndReserve() internal {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);
    }

    // =====================================================================
    // Events
    // =====================================================================

    function test_release_emitsUsageReleasedAndLegacyEvent() public {
        _depositAndReserve();

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit UsageReleased(agent1, 2 * ONE_USDC, 7, 2, 3 * ONE_USDC);
        vm.expectEmit(true, false, false, true);
        emit ReservationReleased(agent1, 2 * ONE_USDC, 3 * ONE_USDC);
        lynto.release(agent1, 2 * ONE_USDC, 7, 2);

        assertEq(lynto.reservedOf(agent1), 3 * ONE_USDC);
    }

    function test_release_requestIdZeroAllowed() public {
        _depositAndReserve();

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit UsageReleased(agent1, 1 * ONE_USDC, 0, 1, 4 * ONE_USDC);
        lynto.release(agent1, 1 * ONE_USDC, 0, 1);

        assertEq(lynto.reservedOf(agent1), 4 * ONE_USDC);
    }

    function test_release_requestIdIsEventOnlyDoesNotAffectAccounting() public {
        // Two identical agents, releases differing only in requestId
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(agent2);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);
        lynto.reserve(agent2, 5 * ONE_USDC);
        lynto.release(agent1, 2 * ONE_USDC, type(uint256).max, 3);
        lynto.release(agent2, 2 * ONE_USDC, 0, 3);
        vm.stopPrank();

        assertEq(lynto.reservedOf(agent1), lynto.reservedOf(agent2));
        assertEq(lynto.availableOf(agent1), lynto.availableOf(agent2));
        assertEq(lynto.balanceOf(agent1), lynto.balanceOf(agent2));
        assertEq(lynto.reservedOf(agent1), 3 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 7 * ONE_USDC);
    }

    // =====================================================================
    // Reason codes
    // =====================================================================

    function test_release_reasonCodeConstantsMatch() public view {
        assertEq(lynto.REASON_METERING_CORRECTION(), 1);
        assertEq(lynto.REASON_DISPUTE_REFUND(), 2);
        assertEq(lynto.REASON_RECONCILIATION(), 3);
    }

    function test_release_invalidReasonCodeReverts() public {
        _depositAndReserve();

        // Below the range
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InvalidReasonCode.selector);
        lynto.release(agent1, 1 * ONE_USDC, 1, 0);

        // Above the range
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InvalidReasonCode.selector);
        lynto.release(agent1, 1 * ONE_USDC, 1, 4);

        // Nothing was released by the rejected calls
        assertEq(lynto.reservedOf(agent1), 5 * ONE_USDC);
    }

    function test_release_validReasonCodesAccepted() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 6 * ONE_USDC);

        vm.startPrank(operator);
        lynto.release(agent1, 1 * ONE_USDC, 1, 1); // metering correction
        lynto.release(agent1, 2 * ONE_USDC, 2, 2); // dispute/refund
        lynto.release(agent1, 3 * ONE_USDC, 3, 3); // reconciliation
        vm.stopPrank();

        assertEq(lynto.reservedOf(agent1), 0);
        assertEq(lynto.availableOf(agent1), 10 * ONE_USDC);
        // Reserve/balance relationship intact: release never moves funds
        assertEq(lynto.balanceOf(agent1), 10 * ONE_USDC);
        assertEq(usdc.balanceOf(address(lynto)), 10 * ONE_USDC);
    }

    // =====================================================================
    // Fuzz
    // =====================================================================

    function testFuzz_release_reasonCodeStrictSet(uint8 code) public {
        _depositAndReserve();

        vm.prank(operator);
        if (code >= 1 && code <= 3) {
            lynto.release(agent1, 1 * ONE_USDC, 99, code);
            assertEq(lynto.reservedOf(agent1), 4 * ONE_USDC);
            assertEq(lynto.availableOf(agent1), 6 * ONE_USDC);
        } else {
            vm.expectRevert(LyntoPayments.InvalidReasonCode.selector);
            lynto.release(agent1, 1 * ONE_USDC, 99, code);
            // Rejected releases touch nothing
            assertEq(lynto.reservedOf(agent1), 5 * ONE_USDC);
            assertEq(lynto.availableOf(agent1), 5 * ONE_USDC);
        }
        assertEq(lynto.balanceOf(agent1), 10 * ONE_USDC);
    }
}

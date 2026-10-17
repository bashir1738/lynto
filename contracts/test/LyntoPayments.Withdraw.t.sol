// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LyntoPaymentsBase} from "./LyntoPaymentsBase.t.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";

/// @notice Phase 3 tests: two-step withdrawal (request -> delay -> execute),
///         cancellation, owner-configurable delay, and the drain scenario
///         the delay exists to prevent.
contract LyntoPaymentsWithdrawTest is LyntoPaymentsBase {
    // =====================================================================
    // Delay configuration
    // =====================================================================

    function test_withdraw_delay_defaultIsTenMinutes() public view {
        assertEq(lynto.withdrawDelay(), 10 minutes);
        assertEq(lynto.DEFAULT_WITHDRAW_DELAY(), 10 minutes);
        assertEq(lynto.MIN_WITHDRAW_DELAY(), 1 minutes);
        assertEq(lynto.MAX_WITHDRAW_DELAY(), 1 days);
    }

    function test_setWithdrawDelay_onlyOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        lynto.setWithdrawDelay(1 minutes);
    }

    function test_setWithdrawDelay_boundsEnforced() public {
        vm.startPrank(owner);

        vm.expectRevert(LyntoPayments.InvalidWithdrawDelay.selector);
        lynto.setWithdrawDelay(0);

        vm.expectRevert(LyntoPayments.InvalidWithdrawDelay.selector);
        lynto.setWithdrawDelay(1 minutes - 1);

        vm.expectRevert(LyntoPayments.InvalidWithdrawDelay.selector);
        lynto.setWithdrawDelay(1 days + 1);

        // Exact bounds are allowed
        lynto.setWithdrawDelay(1 minutes);
        assertEq(lynto.withdrawDelay(), 1 minutes);
        lynto.setWithdrawDelay(1 days);
        assertEq(lynto.withdrawDelay(), 1 days);

        vm.stopPrank();
    }

    function test_setWithdrawDelay_appliesToNewRequestsOnly() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit WithdrawDelaySet(10 minutes, 1 minutes);
        lynto.setWithdrawDelay(1 minutes);
        assertEq(lynto.withdrawDelay(), 1 minutes);

        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(agent1);
        lynto.requestWithdraw(4 * ONE_USDC);

        (, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(executeAfter, block.timestamp + 1 minutes);

        // Changing the delay afterwards must not disturb the pending request
        vm.prank(owner);
        lynto.setWithdrawDelay(1 days);

        vm.warp(executeAfter);
        vm.prank(agent1);
        lynto.executeWithdraw();
        assertEq(lynto.totalWithdrawn(agent1), 4 * ONE_USDC);
    }

    // =====================================================================
    // Request
    // =====================================================================

    function test_requestWithdraw_storesRequestAndEmitsEvent() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit WithdrawRequested(agent1, 4 * ONE_USDC, block.timestamp + 10 minutes);
        lynto.requestWithdraw(4 * ONE_USDC);

        (uint256 amount, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(amount, 4 * ONE_USDC);
        assertEq(executeAfter, block.timestamp + 10 minutes);

        // Requesting moves no funds
        assertEq(lynto.balanceOf(agent1), 10 * ONE_USDC);
        assertEq(usdc.balanceOf(agent1), 90 * ONE_USDC);
    }

    function test_requestWithdraw_exactAvailableBoundary() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 7 * ONE_USDC); // available = 3

        // Exactly available: accepted
        vm.prank(agent1);
        lynto.requestWithdraw(3 * ONE_USDC);

        // One unit over: rejected, and the first request stays intact
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.requestWithdraw(4 * ONE_USDC);

        (uint256 amount, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(amount, 3 * ONE_USDC);
        assertEq(executeAfter, block.timestamp + 10 minutes);
    }

    function test_requestWithdraw_overwriteRestartsDelay() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        uint256 t0 = block.timestamp;

        vm.prank(agent1);
        lynto.requestWithdraw(4 * ONE_USDC); // executeAfter = t0 + 10 min

        vm.warp(t0 + 5 minutes);
        vm.prank(agent1);
        lynto.requestWithdraw(6 * ONE_USDC); // overwrites: executeAfter = t0 + 15 min

        (uint256 amount, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(amount, 6 * ONE_USDC);
        assertEq(executeAfter, t0 + 15 minutes);

        // Past the ORIGINAL deadline the superseded request must not execute
        vm.warp(t0 + 10 minutes);
        vm.prank(agent1);
        vm.expectRevert(
            abi.encodeWithSelector(LyntoPayments.WithdrawalNotReady.selector, t0 + 15 minutes)
        );
        lynto.executeWithdraw();

        // New deadline executes
        vm.warp(t0 + 15 minutes);
        vm.prank(agent1);
        lynto.executeWithdraw();
        assertEq(lynto.totalWithdrawn(agent1), 6 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 4 * ONE_USDC);
    }

    // =====================================================================
    // Execute
    // =====================================================================

    function test_executeWithdraw_revertsUntilDelayElapses() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        lynto.requestWithdraw(4 * ONE_USDC);
        (, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);

        // One second before the deadline
        vm.warp(executeAfter - 1);
        vm.prank(agent1);
        vm.expectRevert(
            abi.encodeWithSelector(LyntoPayments.WithdrawalNotReady.selector, executeAfter)
        );
        lynto.executeWithdraw();

        // Exactly at the deadline
        vm.warp(executeAfter);
        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(agent1, 4 * ONE_USDC);
        lynto.executeWithdraw();

        assertEq(usdc.balanceOf(agent1), 94 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 6 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 4 * ONE_USDC);

        (uint256 amount, uint256 storedAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(amount, 0);
        assertEq(storedAfter, 0);
    }

    function test_executeWithdraw_isOneShot() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(agent1);
        lynto.requestWithdraw(4 * ONE_USDC);

        vm.warp(block.timestamp + lynto.withdrawDelay());
        vm.prank(agent1);
        lynto.executeWithdraw();
        assertEq(lynto.totalWithdrawn(agent1), 4 * ONE_USDC);
        assertEq(usdc.balanceOf(agent1), 94 * ONE_USDC);

        // The request is consumed: a second execute cannot double-pay
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.NoPendingWithdrawal.selector);
        lynto.executeWithdraw();
        assertEq(usdc.balanceOf(agent1), 94 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 4 * ONE_USDC);
    }

    function test_executeWithoutRequestReverts() public {
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.NoPendingWithdrawal.selector);
        lynto.executeWithdraw();
    }

    function test_executeWithdraw_updatesAccountingWithReservation() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 4 * ONE_USDC);

        vm.prank(agent1);
        lynto.requestWithdraw(6 * ONE_USDC); // exactly the unreserved part

        vm.warp(block.timestamp + lynto.withdrawDelay());
        vm.prank(agent1);
        lynto.executeWithdraw();

        // balance = deposited - withdrawn - settled; available = 0
        assertEq(lynto.balanceOf(agent1), 4 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 6 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 4 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 0);
        assertEq(usdc.balanceOf(address(lynto)), 4 * ONE_USDC);
        assertEq(usdc.balanceOf(agent1), 96 * ONE_USDC);
    }

    // =====================================================================
    // Cancel
    // =====================================================================

    function test_cancelWithdraw_clearsRequestAndEmits() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        lynto.requestWithdraw(4 * ONE_USDC);

        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit WithdrawCancelled(agent1, 4 * ONE_USDC);
        lynto.cancelWithdraw();

        (uint256 amount, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(amount, 0);
        assertEq(executeAfter, 0);

        // The delay elapses but there is nothing left to execute
        vm.warp(block.timestamp + lynto.withdrawDelay());
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.NoPendingWithdrawal.selector);
        lynto.executeWithdraw();

        // No funds moved
        assertEq(lynto.balanceOf(agent1), 10 * ONE_USDC);
        assertEq(usdc.balanceOf(agent1), 90 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 0);
    }

    function test_cancelWithoutRequestReverts() public {
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.NoPendingWithdrawal.selector);
        lynto.cancelWithdraw();
    }

    // =====================================================================
    // Drain scenario (the reason for the delay)
    // =====================================================================

    function test_drainScenario_reservedDuringDelayCannotBeWithdrawn() public {
        vm.prank(agent1);
        lynto.deposit(20 * ONE_USDC);

        // Agent queues its entire balance while nothing is reserved yet —
        // the exact window the old single-step withdraw could be drained in.
        vm.prank(agent1);
        lynto.requestWithdraw(20 * ONE_USDC);

        // Operator syncs accrued usage during the delay window
        vm.prank(operator);
        lynto.reserve(agent1, 15 * ONE_USDC);

        // Execution re-validates availability: the reserved usage is safe
        vm.warp(block.timestamp + lynto.withdrawDelay());
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.executeWithdraw();

        // The agent can still get at its genuinely free funds
        vm.prank(agent1);
        lynto.cancelWithdraw();
        withdrawNow(agent1, 5 * ONE_USDC);

        // Accounting invariant holds: balance = deposited - withdrawn - settled
        assertEq(lynto.balanceOf(agent1), 15 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 5 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 15 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 0);
        assertEq(usdc.balanceOf(address(lynto)), 15 * ONE_USDC);
        assertEq(usdc.balanceOf(provider), 0);
    }

    // =====================================================================
    // Fuzz
    // =====================================================================

    function testFuzz_withdrawRoundTrip(uint96 amount, uint32 delayRaw) public {
        amount = uint96(bound(amount, 1, 100 * ONE_USDC));
        uint256 delay = bound(delayRaw, 1 minutes, 1 days);

        vm.prank(owner);
        lynto.setWithdrawDelay(delay);

        vm.prank(agent1);
        lynto.deposit(amount);

        vm.prank(agent1);
        lynto.requestWithdraw(amount);
        (, uint256 executeAfter) = lynto.withdrawalRequestOf(agent1);
        assertEq(executeAfter, block.timestamp + delay);

        vm.warp(executeAfter - 1);
        vm.prank(agent1);
        vm.expectRevert(
            abi.encodeWithSelector(LyntoPayments.WithdrawalNotReady.selector, executeAfter)
        );
        lynto.executeWithdraw();

        vm.warp(executeAfter);
        vm.prank(agent1);
        lynto.executeWithdraw();

        assertEq(lynto.balanceOf(agent1), 0);
        assertEq(lynto.totalWithdrawn(agent1), amount);
        assertEq(usdc.balanceOf(agent1), 100 * ONE_USDC); // full mint returned
        assertEq(usdc.balanceOf(address(lynto)), 0);
    }

    function testFuzz_reserveDuringDelayNeverOverdrafts(uint96 depRaw, uint96 resRaw) public {
        uint256 dep = bound(depRaw, 1, 100 * ONE_USDC);
        uint256 res = bound(resRaw, 0, dep);

        vm.prank(agent1);
        lynto.deposit(dep);
        vm.prank(agent1);
        lynto.requestWithdraw(dep); // entire balance queued

        if (res > 0) {
            vm.prank(operator);
            lynto.reserve(agent1, res);
        }

        vm.warp(block.timestamp + lynto.withdrawDelay());

        if (res == 0) {
            vm.prank(agent1);
            lynto.executeWithdraw();
            assertEq(lynto.balanceOf(agent1), 0);
            assertEq(lynto.totalWithdrawn(agent1), dep);
            assertEq(usdc.balanceOf(address(lynto)), 0);
        } else {
            // Reserved during the delay: execution can never overdraft
            vm.prank(agent1);
            vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
            lynto.executeWithdraw();

            assertEq(lynto.balanceOf(agent1), dep);
            assertEq(lynto.totalWithdrawn(agent1), 0);
            assertEq(lynto.reservedOf(agent1), res);
            // Conservation: contract holdings cover every prepaid balance
            assertEq(usdc.balanceOf(address(lynto)), dep);
            assertEq(
                usdc.balanceOf(address(lynto)), lynto.balanceOf(agent1) + lynto.balanceOf(stranger)
            );
        }
    }
}

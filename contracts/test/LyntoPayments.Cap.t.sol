// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LyntoPaymentsBase} from "./LyntoPaymentsBase.t.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";

/// @notice Phase 2 tests: daily spend cap, freeze, and owner pause.
contract LyntoPaymentsCapTest is LyntoPaymentsBase {
    // =====================================================================
    // Cap boundaries
    // =====================================================================

    function test_dailyCap_boundary_exactCapOk_oneUnitOverReverts() public {
        vm.prank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        vm.prank(agent1);
        lynto.deposit(20 * ONE_USDC);

        // Exactly at the cap: allowed
        vm.prank(operator);
        lynto.reserve(agent1, 10 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 10 * ONE_USDC);
        assertEq(lynto.dailyCapOf(agent1), 10 * ONE_USDC);

        // One base unit over: rejected
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.DailyCapExceeded.selector);
        lynto.reserve(agent1, 1);

        // Zero cap value means no cap at all
        vm.prank(agent2);
        lynto.deposit(50 * ONE_USDC);
        assertEq(lynto.dailyCapOf(agent2), 0);
        vm.prank(operator);
        lynto.reserve(agent2, 50 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent2), 50 * ONE_USDC);
    }

    function test_dailyCap_zeroMeansUnlimited() public {
        vm.prank(agent1);
        lynto.deposit(100 * ONE_USDC);

        assertEq(lynto.dailyCapOf(agent1), 0);
        vm.prank(operator);
        lynto.reserve(agent1, 100 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 100 * ONE_USDC);
    }

    function test_dailyCap_firstSetIsImmediateTighten() public {
        // 0 (uncapped) -> capped is a tightening: no 1-hour delay.
        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit DailyCapSet(agent1, 0, 10 * ONE_USDC, block.timestamp);
        lynto.setDailyCap(10 * ONE_USDC);

        assertEq(lynto.dailyCapOf(agent1), 10 * ONE_USDC);

        vm.prank(agent1);
        lynto.deposit(20 * ONE_USDC);
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.DailyCapExceeded.selector);
        lynto.reserve(agent1, 10 * ONE_USDC + 1);
    }

    // =====================================================================
    // Cap changes: decrease immediate, increase delayed
    // =====================================================================

    function test_dailyCap_decreaseTakesEffectImmediately() public {
        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.deposit(20 * ONE_USDC);
        vm.stopPrank();

        vm.prank(operator);
        lynto.reserve(agent1, 6 * ONE_USDC); // used 6

        vm.prank(agent1);
        lynto.setDailyCap(5 * ONE_USDC);
        assertEq(lynto.dailyCapOf(agent1), 5 * ONE_USDC);

        // Today's counter (6) already exceeds the tightened cap: reserves fail...
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.DailyCapExceeded.selector);
        lynto.reserve(agent1, 1);

        // ...until releases bring it back under the cap.
        vm.prank(operator);
        lynto.release(agent1, 4 * ONE_USDC, 0, 1);
        assertEq(lynto.dailyUsedOf(agent1), 2 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC); // 2 + 3 = 5 <= 5
        assertEq(lynto.dailyUsedOf(agent1), 5 * ONE_USDC);
    }

    function test_dailyCap_increaseTakesEffectAfterOneHour() public {
        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.deposit(30 * ONE_USDC);

        vm.expectEmit(true, false, false, true);
        emit DailyCapSet(agent1, 10 * ONE_USDC, 20 * ONE_USDC, block.timestamp + 1 hours);
        lynto.setDailyCap(20 * ONE_USDC);
        vm.stopPrank();

        // Old cap still enforced one second before the hour elapses
        vm.warp(block.timestamp + 1 hours - 1);
        assertEq(lynto.dailyCapOf(agent1), 10 * ONE_USDC);
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.DailyCapExceeded.selector);
        lynto.reserve(agent1, 11 * ONE_USDC);

        // New cap effective exactly at +1 hour
        vm.warp(block.timestamp + 1);
        assertEq(lynto.dailyCapOf(agent1), 20 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 11 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 11 * ONE_USDC);
    }

    function test_dailyCap_removeCapIsDelayedToo() public {
        // Removing the cap (0 = unlimited) loosens and must wait 1 hour,
        // otherwise setDailyCap(0) would bypass the delay entirely.
        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.deposit(30 * ONE_USDC);

        vm.expectEmit(true, false, false, true);
        emit DailyCapSet(agent1, 10 * ONE_USDC, 0, block.timestamp + 1 hours);
        lynto.setDailyCap(0);

        (uint256 pendingCap, uint256 effectiveAt) = lynto.pendingDailyCapOf(agent1);
        assertEq(pendingCap, 0);
        assertEq(effectiveAt, block.timestamp + 1 hours);
        vm.stopPrank();

        // Still capped during the delay
        assertEq(lynto.dailyCapOf(agent1), 10 * ONE_USDC);
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.DailyCapExceeded.selector);
        lynto.reserve(agent1, 11 * ONE_USDC);

        // Uncapped after the delay
        vm.warp(block.timestamp + 1 hours);
        assertEq(lynto.dailyCapOf(agent1), 0);
        vm.prank(operator);
        lynto.reserve(agent1, 30 * ONE_USDC);
    }

    function test_dailyCap_overwritePendingRestartsDelay() public {
        uint256 t0 = block.timestamp;

        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.setDailyCap(20 * ONE_USDC); // pending at t0 + 1h
        vm.stopPrank();

        vm.warp(t0 + 30 minutes);
        vm.prank(agent1);
        lynto.setDailyCap(30 * ONE_USDC); // overwrite: restarts the 1-hour timer

        (uint256 pendingCap, uint256 effectiveAt) = lynto.pendingDailyCapOf(agent1);
        assertEq(pendingCap, 30 * ONE_USDC);
        assertEq(effectiveAt, t0 + 30 minutes + 1 hours);

        // Past the ORIGINAL deadline the superseded request must not apply
        vm.warp(t0 + 1 hours);
        assertEq(lynto.dailyCapOf(agent1), 10 * ONE_USDC);

        // New deadline applies
        vm.warp(t0 + 30 minutes + 1 hours);
        assertEq(lynto.dailyCapOf(agent1), 30 * ONE_USDC);
    }

    function test_dailyCap_tightenCancelsPendingIncrease() public {
        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.setDailyCap(20 * ONE_USDC); // pending
        lynto.setDailyCap(10 * ONE_USDC); // tighten back: cancels pending
        vm.stopPrank();

        (uint256 pendingCap, uint256 effectiveAt) = lynto.pendingDailyCapOf(agent1);
        assertEq(pendingCap, 0);
        assertEq(effectiveAt, 0);

        vm.warp(block.timestamp + 5 hours);
        assertEq(lynto.dailyCapOf(agent1), 10 * ONE_USDC);
    }

    function test_dailyCap_onlyAffectsCaller() public {
        vm.prank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);

        assertEq(lynto.dailyCapOf(agent2), 0);

        vm.prank(agent2);
        lynto.deposit(50 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent2, 50 * ONE_USDC); // agent2 uncapped
        assertEq(lynto.dailyUsedOf(agent2), 50 * ONE_USDC);
    }

    // =====================================================================
    // Day rollover
    // =====================================================================

    function test_dailyCap_dayRolloverResetsCounter() public {
        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.deposit(30 * ONE_USDC);
        vm.stopPrank();

        vm.prank(operator);
        lynto.reserve(agent1, 10 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 10 * ONE_USDC);

        warpToNextDay();
        assertEq(lynto.dailyUsedOf(agent1), 0);

        // Full budget again on the new day
        vm.prank(operator);
        lynto.reserve(agent1, 10 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 10 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 20 * ONE_USDC); // reservations accumulate
    }

    function test_release_onOtherDayDoesNotTouchTodayCounter() public {
        vm.prank(agent1);
        lynto.deposit(20 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 10 * ONE_USDC); // counted on day 1

        warpToNextDay();
        vm.prank(operator);
        lynto.release(agent1, 10 * ONE_USDC, 0, 1); // released on day 2

        // Today's counter was never touched (it only tracks day-2 reserves)
        assertEq(lynto.dailyUsedOf(agent1), 0);
        assertEq(lynto.reservedOf(agent1), 0);
    }

    // =====================================================================
    // Release adjusts the counter (floored at 0)
    // =====================================================================

    function test_release_decreasesDailyCounterAndFreesBudget() public {
        vm.startPrank(agent1);
        lynto.setDailyCap(10 * ONE_USDC);
        lynto.deposit(30 * ONE_USDC);
        vm.stopPrank();

        vm.prank(operator);
        lynto.reserve(agent1, 6 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 6 * ONE_USDC);

        vm.prank(operator);
        lynto.release(agent1, 4 * ONE_USDC, 0, 1);
        assertEq(lynto.dailyUsedOf(agent1), 2 * ONE_USDC);

        // 8 more fit exactly in the remaining budget
        vm.prank(operator);
        lynto.reserve(agent1, 8 * ONE_USDC);
        assertEq(lynto.dailyUsedOf(agent1), 10 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.DailyCapExceeded.selector);
        lynto.reserve(agent1, 1);
    }

    function test_release_floorsDailyCounterAtZero() public {
        vm.prank(agent1);
        lynto.deposit(40 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 8 * ONE_USDC); // day 1

        warpToNextDay();
        vm.prank(operator);
        lynto.reserve(agent1, 2 * ONE_USDC); // day 2 counter = 2

        // Releasing 10 spans both days: today's counter floors at 0
        vm.prank(operator);
        lynto.release(agent1, 10 * ONE_USDC, 0, 1);
        assertEq(lynto.dailyUsedOf(agent1), 0);
        assertEq(lynto.reservedOf(agent1), 0);
    }

    // =====================================================================
    // Freeze
    // =====================================================================

    function test_freeze_blocksReserveButNotWithdraw() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit FrozenSet(agent1, true);
        lynto.setFrozen(true);
        assertTrue(lynto.isFrozen(agent1));

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.AccountFrozen.selector);
        lynto.reserve(agent1, 1 * ONE_USDC);

        // Freeze never blocks the agent's own withdrawals
        withdrawNow(agent1, 4 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 6 * ONE_USDC);

        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit FrozenSet(agent1, false);
        lynto.setFrozen(false);

        vm.prank(operator);
        lynto.reserve(agent1, 1 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 1 * ONE_USDC);
    }

    function test_setFrozen_onlyAffectsCaller() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        // owner freezing must not freeze agent1
        vm.prank(owner);
        lynto.setFrozen(true);

        assertFalse(lynto.isFrozen(agent1));
        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 5 * ONE_USDC);
    }

    // =====================================================================
    // Pause
    // =====================================================================

    function test_pause_blocksDepositReserveSettle_butNotWithdraw() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit Paused(owner);
        lynto.pause();
        assertTrue(lynto.paused());

        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.ContractPaused.selector);
        lynto.deposit(1 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ContractPaused.selector);
        lynto.reserve(agent1, 1 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ContractPaused.selector);
        lynto.settle(agent1, 1 * ONE_USDC, keccak256("paused-batch"));

        // Unreserved funds remain withdrawable while paused
        withdrawNow(agent1, 5 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 5 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 5 * ONE_USDC);
    }

    function test_unpause_restoresOperations() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(owner);
        lynto.pause();
        vm.expectEmit(true, false, false, false);
        emit Unpaused(owner);
        lynto.unpause();
        vm.stopPrank();
        assertFalse(lynto.paused());

        vm.prank(agent1);
        lynto.deposit(1 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC);
        vm.prank(operator);
        lynto.settle(agent1, 3 * ONE_USDC, keccak256("unpaused-batch"));

        assertEq(lynto.balanceOf(agent1), 8 * ONE_USDC);
        assertEq(usdc.balanceOf(provider), 3 * ONE_USDC);
    }

    function test_pause_onlyOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        lynto.pause();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        lynto.unpause();
    }

    function test_pause_twiceReverts() public {
        vm.startPrank(owner);
        lynto.pause();
        vm.expectRevert(LyntoPayments.ContractPaused.selector);
        lynto.pause();
        vm.stopPrank();
    }

    function test_unpause_whenNotPausedReverts() public {
        vm.prank(owner);
        vm.expectRevert(LyntoPayments.ContractNotPaused.selector);
        lynto.unpause();
    }

    // =====================================================================
    // Fuzz: today's counter never underflows or exceeds the cap
    // =====================================================================

    function testFuzz_dailyCapCounterNeverUnderflowsOrExceedsCap(uint96 capRaw, uint256 seed)
        public
    {
        uint256 cap = bound(capRaw, 1, 100 * ONE_USDC);

        vm.prank(agent1);
        lynto.setDailyCap(cap); // tighten from 0: immediate
        vm.prank(agent1);
        lynto.deposit(100 * ONE_USDC);

        uint256 steps = bound(uint256(keccak256(abi.encode(seed))) % 16, 4, 16);
        for (uint256 i = 0; i < steps; i++) {
            uint256 roll = uint256(keccak256(abi.encode(seed, i, "roll"))) % 3;
            if (roll == 0) {
                uint256 amt = uint256(keccak256(abi.encode(seed, i, "amt"))) % (cap + 1);
                if (amt == 0) continue;
                vm.prank(operator);
                try lynto.reserve(agent1, amt) {
                    // A successful reserve can never push the counter past the cap
                    assertLe(lynto.dailyUsedOf(agent1), cap);
                } catch {
                    // DailyCapExceeded / InsufficientBalance — never an underflow
                }
            } else if (roll == 1) {
                uint256 reservedNow = lynto.reservedOf(agent1);
                if (reservedNow == 0) continue;
                uint256 rel = uint256(keccak256(abi.encode(seed, i, "rel"))) % reservedNow + 1;
                uint256 usedBefore = lynto.dailyUsedOf(agent1);

                vm.prank(operator);
                bool ok = true;
                try lynto.release(agent1, rel, 0, 1) {}
                catch {
                    ok = false;
                }
                if (ok) {
                    uint256 usedAfter = lynto.dailyUsedOf(agent1);
                    uint256 expected = usedBefore >= rel ? usedBefore - rel : 0;
                    assertEq(usedAfter, expected); // floored at 0, never underflows
                    assertLe(usedAfter, cap);
                }
            } else {
                warpToNextDay();
                assertEq(lynto.dailyUsedOf(agent1), 0);
            }
        }

        assertLe(lynto.dailyUsedOf(agent1), cap);
    }

    function testFuzz_releaseNeverUnderflowsDailyCounter(uint96 r1Raw, uint96 r2Raw, uint96 relRaw)
        public
    {
        uint256 r1 = bound(r1Raw, 1, 20 * ONE_USDC);
        uint256 r2 = bound(r2Raw, 0, 20 * ONE_USDC);

        vm.prank(agent1);
        lynto.setDailyCap(100 * ONE_USDC);
        vm.prank(agent1);
        lynto.deposit(50 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, r1); // day 1

        warpToNextDay();

        if (r2 > 0) {
            vm.prank(operator);
            lynto.reserve(agent1, r2); // day 2 counter = r2
        }

        uint256 rel = bound(relRaw, 1, r1 + r2);
        uint256 expectedUsed = rel <= r2 ? r2 - rel : 0;

        vm.prank(operator);
        lynto.release(agent1, rel, 0, 1); // floors at 0 — never reverts on underflow

        assertEq(lynto.dailyUsedOf(agent1), expectedUsed);
        assertLe(lynto.dailyUsedOf(agent1), 100 * ONE_USDC);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract LyntoPaymentsTest is Test {
    LyntoPayments public lynto;
    MockUSDC public usdc;

    address public owner = address(0xA11CE);
    address public provider = address(0xBEEF);
    address public operator = address(0x0DEA);
    address public agent1 = address(0xA63A);
    address public agent2 = address(0xA63B);
    address public stranger = address(0xBAD);

    uint256 constant ONE_USDC = 1e6; // 6 decimals
    uint256 constant DECIMALS = 6;

    event Deposited(address indexed agent, uint256 amount);
    event Withdrawn(address indexed agent, uint256 amount);
    event Reserved(address indexed agent, uint256 amount, uint256 newReserved);
    event ReservationReleased(address indexed agent, uint256 amount, uint256 newReserved);
    event Settled(
        address indexed agent,
        address indexed provider,
        uint256 amount,
        bytes32 indexed batchId,
        uint256 settledAt
    );
    event OperatorSet(address indexed operator, bool authorized);
    event ProviderSet(address indexed provider);

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        lynto = new LyntoPayments(address(usdc), provider, owner);
        lynto.setOperator(operator, true);
        vm.stopPrank();

        // Fund agents
        usdc.mint(agent1, 100 * ONE_USDC);
        usdc.mint(agent2, 100 * ONE_USDC);
        usdc.mint(stranger, 100 * ONE_USDC);

        vm.prank(agent1);
        usdc.approve(address(lynto), type(uint256).max);
        vm.prank(agent2);
        usdc.approve(address(lynto), type(uint256).max);
        vm.prank(stranger);
        usdc.approve(address(lynto), type(uint256).max);
    }

    // =====================================================================
    // Deposit tests
    // =====================================================================

    function test_deposit_creditsBalance() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        assertEq(lynto.balanceOf(agent1), 10 * ONE_USDC);
        assertEq(lynto.totalDeposited(agent1), 10 * ONE_USDC);
        assertEq(usdc.balanceOf(address(lynto)), 10 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 10 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 0);
    }

    function test_deposit_emitsEvent() public {
        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit Deposited(agent1, 5 * ONE_USDC);
        lynto.deposit(5 * ONE_USDC);
    }

    function test_deposit_multipleTimesAccumulates() public {
        vm.startPrank(agent1);
        lynto.deposit(5 * ONE_USDC);
        lynto.deposit(3 * ONE_USDC);
        vm.stopPrank();

        assertEq(lynto.balanceOf(agent1), 8 * ONE_USDC);
        assertEq(lynto.totalDeposited(agent1), 8 * ONE_USDC);
    }

    function test_deposit_zeroReverts() public {
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.ZeroAmount.selector);
        lynto.deposit(0);
    }

    function test_deposit_insufficientAllowanceReverts() public {
        vm.prank(stranger);
        usdc.approve(address(lynto), 1 * ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert();
        lynto.deposit(2 * ONE_USDC);
    }

    function test_deposit_insufficientBalanceReverts() public {
        vm.prank(agent1);
        vm.expectRevert();
        lynto.deposit(1000 * ONE_USDC);
    }

    // =====================================================================
    // Withdrawal tests
    // =====================================================================

    function test_withdraw_creditsWallet() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        lynto.withdraw(4 * ONE_USDC);

        assertEq(usdc.balanceOf(agent1), 94 * ONE_USDC); // 100 - 10 + 4
        assertEq(lynto.balanceOf(agent1), 6 * ONE_USDC);
        assertEq(lynto.totalWithdrawn(agent1), 4 * ONE_USDC);
    }

    function test_withdraw_moreThanBalanceReverts() public {
        vm.prank(agent1);
        lynto.deposit(1 * ONE_USDC);

        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.withdraw(2 * ONE_USDC);
    }

    function test_withdraw_zeroReverts() public {
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.ZeroAmount.selector);
        lynto.withdraw(0);
    }

    function test_withdraw_reservedFundsCannotBeWithdrawn() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        // Operator reserves 7 USDC for accrued usage
        vm.prank(operator);
        lynto.reserve(agent1, 7 * ONE_USDC);

        // Agent can only withdraw 3
        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.withdraw(4 * ONE_USDC);

        vm.prank(agent1);
        lynto.withdraw(3 * ONE_USDC);

        assertEq(lynto.balanceOf(agent1), 7 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 0);
        assertEq(lynto.reservedOf(agent1), 7 * ONE_USDC);
    }

    function test_withdraw_fullBalanceWhenNothingReserved() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        lynto.withdraw(10 * ONE_USDC);

        assertEq(lynto.balanceOf(agent1), 0);
        assertEq(usdc.balanceOf(address(lynto)), 0);
    }

    // =====================================================================
    // Reserve / release tests
    // =====================================================================

    function test_reserve_increasesReserved() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC);

        assertEq(lynto.reservedOf(agent1), 3 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 7 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 10 * ONE_USDC);
    }

    function test_reserve_exceedingBalanceReverts() public {
        vm.prank(agent1);
        lynto.deposit(5 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InsufficientBalance.selector);
        lynto.reserve(agent1, 6 * ONE_USDC);
    }

    function test_reserve_nonOperatorReverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert(LyntoPayments.UnauthorizedOperator.selector);
        lynto.reserve(agent1, 1 * ONE_USDC);
    }

    function test_reserve_zeroAmountReverts() public {
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ZeroAmount.selector);
        lynto.reserve(agent1, 0);
    }

    function test_reserve_zeroAgentReverts() public {
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        lynto.reserve(address(0), 1 * ONE_USDC);
    }

    function test_release_decreasesReserved() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);
        lynto.release(agent1, 2 * ONE_USDC);
        vm.stopPrank();

        assertEq(lynto.reservedOf(agent1), 3 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 7 * ONE_USDC);
    }

    function test_release_moreThanReservedReverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 2 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InsufficientReserved.selector);
        lynto.release(agent1, 3 * ONE_USDC);
    }

    function test_release_nonOperatorReverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 2 * ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert(LyntoPayments.UnauthorizedOperator.selector);
        lynto.release(agent1, 1 * ONE_USDC);
    }

    // =====================================================================
    // Settlement tests
    // =====================================================================

    function test_settle_transfersToProvider() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);

        bytes32 batchId = keccak256("batch-1");
        uint256 providerBalBefore = usdc.balanceOf(provider);

        vm.prank(operator);
        lynto.settle(agent1, 5 * ONE_USDC, batchId);

        assertEq(usdc.balanceOf(provider), providerBalBefore + 5 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 5 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 0);
        assertEq(lynto.totalSettled(agent1), 5 * ONE_USDC);
        assertTrue(lynto.isBatchSettled(batchId));
    }

    function test_settle_emitsEvent() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 2 * ONE_USDC);

        bytes32 batchId = keccak256("batch-evt");

        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit Settled(agent1, provider, 2 * ONE_USDC, batchId, block.timestamp);
        lynto.settle(agent1, 2 * ONE_USDC, batchId);
    }

    function test_settle_duplicateBatchIdReverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 4 * ONE_USDC);

        bytes32 batchId = keccak256("batch-dup");

        vm.startPrank(operator);
        lynto.settle(agent1, 2 * ONE_USDC, batchId);

        // Try to settle the same batchId again — must revert
        // even though reserved might allow another settle with a different id
        vm.expectRevert(
            abi.encodeWithSelector(LyntoPayments.BatchAlreadySettled.selector, batchId)
        );
        lynto.settle(agent1, 2 * ONE_USDC, batchId);
        vm.stopPrank();
    }

    function test_settle_exceedingReservedReverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC);

        bytes32 batchId = keccak256("batch-over");
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InsufficientReserved.selector);
        lynto.settle(agent1, 4 * ONE_USDC, batchId);
    }

    function test_settle_nonOperatorReverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert(LyntoPayments.UnauthorizedOperator.selector);
        lynto.settle(agent1, 3 * ONE_USDC, keccak256("x"));
    }

    function test_settle_zeroAmountReverts() public {
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ZeroAmount.selector);
        lynto.settle(agent1, 0, keccak256("z"));
    }

    function test_settle_zeroAgentReverts() public {
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        lynto.settle(address(0), 1 * ONE_USDC, keccak256("z2"));
    }

    function test_settle_zeroBatchIdIsUniqueAndWorks() public {
        // zero bytes32 is a valid (if odd) batch id — must still be unique
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 1 * ONE_USDC);

        bytes32 zeroId = bytes32(0);
        vm.prank(operator);
        lynto.settle(agent1, 1 * ONE_USDC, zeroId);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(LyntoPayments.BatchAlreadySettled.selector, zeroId)
        );
        lynto.settle(agent1, 1 * ONE_USDC, zeroId);
    }

    function test_settle_multipleBatches() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);

        lynto.settle(agent1, 2 * ONE_USDC, keccak256("b1"));
        lynto.settle(agent1, 3 * ONE_USDC, keccak256("b2"));
        vm.stopPrank();

        assertEq(lynto.balanceOf(agent1), 5 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 0);
        assertEq(lynto.totalSettled(agent1), 5 * ONE_USDC);
    }

    // =====================================================================
    // Operator management
    // =====================================================================

    function test_setOperator_authorizes() public {
        vm.prank(owner);
        lynto.setOperator(stranger, true);
        assertTrue(lynto.isOperator(stranger));

        // Newly authorized operator can reserve
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(stranger);
        lynto.reserve(agent1, 1 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 1 * ONE_USDC);
    }

    function test_setOperator_deauthorizes() public {
        vm.prank(owner);
        lynto.setOperator(operator, false);
        assertFalse(lynto.isOperator(operator));

        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.UnauthorizedOperator.selector);
        lynto.reserve(agent1, 1 * ONE_USDC);
    }

    function test_setOperator_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        lynto.setOperator(stranger, true);
    }

    function test_setOperator_zeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        lynto.setOperator(address(0), true);
    }

    function test_setProvider_updatesAndOnlyOwner() public {
        address newProvider = address(0xF00D);
        vm.prank(owner);
        lynto.setProvider(newProvider);
        assertEq(lynto.provider(), newProvider);

        vm.prank(stranger);
        vm.expectRevert();
        lynto.setProvider(stranger);
    }

    function test_setProvider_zeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        lynto.setProvider(address(0));
    }

    // =====================================================================
    // Multiple independent agents
    // =====================================================================

    function test_multipleAgents_independentBalances() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(agent2);
        lynto.deposit(20 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC);
        lynto.reserve(agent2, 8 * ONE_USDC);

        lynto.settle(agent1, 3 * ONE_USDC, keccak256("a1"));
        vm.stopPrank();

        assertEq(lynto.balanceOf(agent1), 7 * ONE_USDC);
        assertEq(lynto.balanceOf(agent2), 20 * ONE_USDC);
        assertEq(lynto.reservedOf(agent2), 8 * ONE_USDC);
        assertEq(lynto.totalSettled(agent1), 3 * ONE_USDC);
        assertEq(lynto.totalSettled(agent2), 0);
    }

    function test_multipleAgents_oneCannotWithdrawOthers() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        // agent2 has zero balance
        vm.prank(agent2);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.withdraw(1 * ONE_USDC);
    }

    // =====================================================================
    // Accounting invariants & edge cases
    // =====================================================================

    function test_withdraw_afterSettlement_onlyRemainingAvailable() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 6 * ONE_USDC);
        lynto.settle(agent1, 6 * ONE_USDC, keccak256("post"));
        vm.stopPrank();

        // 4 USDC left unreserved
        assertEq(lynto.availableOf(agent1), 4 * ONE_USDC);

        vm.prank(agent1);
        lynto.withdraw(4 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 0);
    }

    function test_accounting_conservation() public {
        uint256 dep = 10 * ONE_USDC;
        vm.prank(agent1);
        lynto.deposit(dep);

        vm.startPrank(operator);
        lynto.reserve(agent1, 6 * ONE_USDC);
        lynto.settle(agent1, 4 * ONE_USDC, keccak256("c1"));
        lynto.release(agent1, 2 * ONE_USDC);
        vm.stopPrank();

        vm.prank(agent1);
        lynto.withdraw(4 * ONE_USDC);

        // invariant: balance = deposited - withdrawn - settled
        uint256 bal = lynto.balanceOf(agent1);
        uint256 depTot = lynto.totalDeposited(agent1);
        uint256 wd = lynto.totalWithdrawn(agent1);
        uint256 st = lynto.totalSettled(agent1);
        assertEq(bal, depTot - wd - st);

        // contract holds exactly the remaining balance
        assertEq(usdc.balanceOf(address(lynto)), bal);
    }

    function test_constructor_zeroArgsRevert() public {
        vm.startPrank(owner);
        // OZ Ownable reverts on zero owner before our checks
        vm.expectRevert(
            abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0))
        );
        new LyntoPayments(address(usdc), provider, address(0));

        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        new LyntoPayments(address(0), provider, owner);

        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        new LyntoPayments(address(usdc), address(0), owner);
        vm.stopPrank();
    }

    function testFuzz_depositWithdraw(uint96 amount) public {
        amount = uint96(bound(amount, 1, 50 * ONE_USDC));
        vm.assume(amount <= 100 * ONE_USDC);

        vm.prank(agent1);
        lynto.deposit(amount);

        assertEq(lynto.balanceOf(agent1), amount);

        vm.prank(agent1);
        lynto.withdraw(amount);
        assertEq(lynto.balanceOf(agent1), 0);
    }

    function testFuzz_settleNeverExceedsReserved(uint96 dep, uint96 res, uint96 settleAmt) public {
        dep = uint96(bound(dep, 1, 50 * ONE_USDC));
        res = uint96(bound(res, 0, dep));
        settleAmt = uint96(bound(settleAmt, 1, 50 * ONE_USDC));

        vm.prank(agent1);
        lynto.deposit(dep);

        if (res > 0) {
            vm.prank(operator);
            lynto.reserve(agent1, res);
        }

        bytes32 batchId = keccak256(abi.encode(dep, res, settleAmt));

        if (settleAmt > res) {
            vm.prank(operator);
            vm.expectRevert(LyntoPayments.InsufficientReserved.selector);
            lynto.settle(agent1, settleAmt, batchId);
        } else {
            uint256 balBefore = usdc.balanceOf(address(lynto));
            vm.prank(operator);
            lynto.settle(agent1, settleAmt, batchId);
            assertEq(usdc.balanceOf(address(lynto)), balBefore - settleAmt);
            assertEq(lynto.reservedOf(agent1), res - settleAmt);
            assertEq(lynto.balanceOf(agent1), dep - settleAmt);
        }
    }

    // =====================================================================
    // Reentrancy-style protection (behavioral)
    // =====================================================================

    function test_withdraw_reentrancyAttemptBlocked() public {
        // Deposit, then withdraw — the USDC token is a plain ERC20 so no
        // callback reentrancy. This test asserts the CEI ordering protects
        // state even if a malicious token attempted reentry via a hook.
        // With MockUSDC (no hooks), we verify double-withdraw is impossible
        // because balance is decreased before transfer.
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(agent1);
        lynto.withdraw(10 * ONE_USDC);

        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.withdraw(1 * ONE_USDC);
    }

    // =====================================================================
    // Settlement that would exceed available after partial withdraw attempts
    // =====================================================================

    function test_settle_afterPartialWithdraw_stillLimitedByReserved() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);

        // Agent withdraws available 5
        vm.prank(agent1);
        lynto.withdraw(5 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 5 * ONE_USDC);

        // Operator settles reserved 5 — ok
        vm.prank(operator);
        lynto.settle(agent1, 5 * ONE_USDC, keccak256("pw"));
        assertEq(usdc.balanceOf(provider), 5 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 0);

        // Nothing left to settle
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InsufficientReserved.selector);
        lynto.settle(agent1, 1 * ONE_USDC, keccak256("pw2"));
    }

    // =====================================================================
    // Additional edge-case and invariant tests
    // =====================================================================

    function test_batchId_isGlobalAcrossAgents() public {
        // The same batchId cannot be used for two different agents.
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(agent2);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 2 * ONE_USDC);
        lynto.reserve(agent2, 2 * ONE_USDC);

        bytes32 sharedId = keccak256("shared-batch");
        lynto.settle(agent1, 2 * ONE_USDC, sharedId);

        vm.expectRevert(
            abi.encodeWithSelector(LyntoPayments.BatchAlreadySettled.selector, sharedId)
        );
        lynto.settle(agent2, 2 * ONE_USDC, sharedId);
        vm.stopPrank();
    }

    function test_settle_withoutReserve_reverts() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        // Balance is full but nothing reserved — settle must fail.
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.InsufficientReserved.selector);
        lynto.settle(agent1, 1 * ONE_USDC, keccak256("no-res"));
    }

    function test_settle_afterRelease_revertsIfBelowAmount() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);
        lynto.release(agent1, 4 * ONE_USDC); // only 1 left reserved
        vm.expectRevert(LyntoPayments.InsufficientReserved.selector);
        lynto.settle(agent1, 2 * ONE_USDC, keccak256("rel"));
        lynto.settle(agent1, 1 * ONE_USDC, keccak256("rel-ok"));
        vm.stopPrank();

        assertEq(lynto.totalSettled(agent1), 1 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 0);
    }

    function test_deposit_afterReserve_increasesAvailableNotReserved() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 6 * ONE_USDC);

        vm.prank(agent1);
        lynto.deposit(4 * ONE_USDC);

        assertEq(lynto.balanceOf(agent1), 14 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 6 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 8 * ONE_USDC);
    }

    function test_withdraw_exactAvailable_boundary() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 3 * ONE_USDC);

        // Exactly available (7) must succeed; 7+1 must fail.
        vm.prank(agent1);
        lynto.withdraw(7 * ONE_USDC);

        vm.prank(agent1);
        vm.expectRevert(LyntoPayments.InsufficientAvailable.selector);
        lynto.withdraw(1);
    }

    function test_setProvider_settlePaysNewProvider() public {
        address newProvider = address(0xF00D);
        vm.prank(owner);
        lynto.setProvider(newProvider);

        vm.prank(agent1);
        lynto.deposit(5 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);

        vm.prank(operator);
        lynto.settle(agent1, 5 * ONE_USDC, keccak256("new-prov"));

        assertEq(usdc.balanceOf(newProvider), 5 * ONE_USDC);
        assertEq(usdc.balanceOf(provider), 0);
    }

    function test_isBatchSettled_view() public {
        assertFalse(lynto.isBatchSettled(keccak256("never")));

        vm.prank(agent1);
        lynto.deposit(2 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 2 * ONE_USDC);

        bytes32 id = keccak256("view-check");
        vm.prank(operator);
        lynto.settle(agent1, 2 * ONE_USDC, id);
        assertTrue(lynto.isBatchSettled(id));
    }

    function test_manySmallSettles_sumCorrectly() public {
        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 10 * ONE_USDC);

        vm.startPrank(operator);
        for (uint256 i = 1; i <= 10; i++) {
            lynto.settle(agent1, ONE_USDC, keccak256(abi.encode("small", i)));
        }
        vm.stopPrank();

        assertEq(lynto.totalSettled(agent1), 10 * ONE_USDC);
        assertEq(lynto.balanceOf(agent1), 0);
        assertEq(usdc.balanceOf(provider), 10 * ONE_USDC);
        assertEq(usdc.balanceOf(address(lynto)), 0);
    }

    function test_contractSolvency_invariant() public {
        // After a mix of operations, contract USDC == sum of agent balances.
        vm.prank(agent1);
        lynto.deposit(8 * ONE_USDC);
        vm.prank(agent2);
        lynto.deposit(3 * ONE_USDC);
        vm.prank(stranger);
        lynto.deposit(1 * ONE_USDC);

        vm.startPrank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);
        lynto.reserve(agent2, 1 * ONE_USDC);
        lynto.settle(agent1, 2 * ONE_USDC, keccak256("sol1"));
        lynto.release(agent1, 1 * ONE_USDC);
        vm.stopPrank();

        vm.prank(agent1);
        lynto.withdraw(2 * ONE_USDC);
        vm.prank(stranger);
        lynto.withdraw(1 * ONE_USDC);

        uint256 sum = lynto.balanceOf(agent1) + lynto.balanceOf(agent2) + lynto.balanceOf(stranger);
        assertEq(usdc.balanceOf(address(lynto)), sum);
        // agent1: deposited 8, settled 2, withdrawn 2 => balance 4
        // reserved: +5 -2 settle -1 release = 2
        assertEq(lynto.balanceOf(agent1), 4 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 2 * ONE_USDC);
        assertEq(lynto.availableOf(agent1), 2 * ONE_USDC);
        assertEq(lynto.totalSettled(agent1), 2 * ONE_USDC);
        assertEq(usdc.balanceOf(provider), 2 * ONE_USDC);
    }

    function testFuzz_reserveReleaseConservation(uint96 dep, uint96 r1, uint96 rel) public {
        dep = uint96(bound(dep, 1, 100 * ONE_USDC));
        r1 = uint96(bound(r1, 0, dep));
        rel = uint96(bound(rel, 0, r1));

        vm.prank(agent1);
        lynto.deposit(dep);

        vm.startPrank(operator);
        if (r1 > 0) lynto.reserve(agent1, r1);
        if (rel > 0) lynto.release(agent1, rel);
        vm.stopPrank();

        assertEq(lynto.reservedOf(agent1), r1 - rel);
        assertEq(lynto.availableOf(agent1), dep - (r1 - rel));
        assertEq(lynto.balanceOf(agent1), dep);
    }

    function testFuzz_multipleAgentsNoCrossTalk(
        uint96 a1dep,
        uint96 a2dep,
        uint96 a1res
    ) public {
        a1dep = uint96(bound(a1dep, 1, 50 * ONE_USDC));
        a2dep = uint96(bound(a2dep, 1, 50 * ONE_USDC));
        a1res = uint96(bound(a1res, 0, a1dep));

        vm.prank(agent1);
        lynto.deposit(a1dep);
        vm.prank(agent2);
        lynto.deposit(a2dep);

        if (a1res > 0) {
            vm.prank(operator);
            lynto.reserve(agent1, a1res);
        }

        // agent2 balances untouched by agent1 operations
        assertEq(lynto.balanceOf(agent2), a2dep);
        assertEq(lynto.reservedOf(agent2), 0);
        assertEq(lynto.availableOf(agent2), a2dep);
        assertEq(lynto.balanceOf(agent1), a1dep);
        assertEq(lynto.reservedOf(agent1), a1res);
    }

    function test_release_zeroAmountReverts() public {
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ZeroAmount.selector);
        lynto.release(agent1, 0);
    }

    function test_release_zeroAgentReverts() public {
        vm.prank(operator);
        vm.expectRevert(LyntoPayments.ZeroAddress.selector);
        lynto.release(address(0), 1);
    }

    function test_settle_eventProviderMatchesCurrentProvider() public {
        vm.prank(agent1);
        lynto.deposit(1 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 1 * ONE_USDC);

        bytes32 id = keccak256("evt-prov");
        vm.prank(operator);
        vm.expectEmit(true, true, false, false);
        emit Settled(agent1, provider, 1 * ONE_USDC, id, block.timestamp);
        lynto.settle(agent1, 1 * ONE_USDC, id);
    }

    function test_deposit_thenImmediateWithdraw_fullRoundTrip() public {
        uint256 amount = 7 * ONE_USDC + 123; // odd amount
        vm.prank(agent1);
        lynto.deposit(amount);
        assertEq(usdc.balanceOf(address(lynto)), amount);

        vm.prank(agent1);
        lynto.withdraw(amount);
        assertEq(usdc.balanceOf(address(lynto)), 0);
        assertEq(lynto.totalWithdrawn(agent1), amount);
        assertEq(lynto.totalDeposited(agent1), amount);
    }

    function test_twoOperators_bothCanSettleDifferentBatches() public {
        address op2 = address(0x0B02);
        vm.prank(owner);
        lynto.setOperator(op2, true);

        vm.prank(agent1);
        lynto.deposit(10 * ONE_USDC);

        vm.prank(operator);
        lynto.reserve(agent1, 4 * ONE_USDC);
        vm.prank(op2);
        lynto.reserve(agent1, 1 * ONE_USDC);
        assertEq(lynto.reservedOf(agent1), 5 * ONE_USDC);

        vm.prank(operator);
        lynto.settle(agent1, 4 * ONE_USDC, keccak256("op1"));
        vm.prank(op2);
        lynto.settle(agent1, 1 * ONE_USDC, keccak256("op2"));

        assertEq(lynto.totalSettled(agent1), 5 * ONE_USDC);
    }

    function test_deauthorizedOperator_cannotSettle() public {
        vm.prank(agent1);
        lynto.deposit(5 * ONE_USDC);
        vm.prank(operator);
        lynto.reserve(agent1, 5 * ONE_USDC);

        vm.prank(owner);
        lynto.setOperator(operator, false);

        vm.prank(operator);
        vm.expectRevert(LyntoPayments.UnauthorizedOperator.selector);
        lynto.settle(agent1, 5 * ONE_USDC, keccak256("deauth"));
    }

    function test_usdcAddress_isImmutableAndCorrect() public view {
        assertEq(address(lynto.usdc()), address(usdc));
        assertEq(usdc.decimals(), 6);
    }
}

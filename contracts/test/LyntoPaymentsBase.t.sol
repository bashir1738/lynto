// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {LyntoPayments} from "../src/LyntoPayments.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @notice Shared fixture for phase test files: deploys LyntoPayments behind
///         an ERC1967Proxy, authorizes the operator, and funds three wallets.
abstract contract LyntoPaymentsBase is Test {
    LyntoPayments public lynto;
    LyntoPayments public lyntoImpl;
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
    event WithdrawRequested(address indexed agent, uint256 amount, uint256 executeAfter);
    event WithdrawCancelled(address indexed agent, uint256 amount);
    event WithdrawDelaySet(uint256 previousDelay, uint256 newDelay);
    event Reserved(address indexed agent, uint256 amount, uint256 newReserved);
    event ReservationReleased(address indexed agent, uint256 amount, uint256 newReserved);
    event Settled(
        address indexed agent,
        address indexed provider,
        uint256 amount,
        bytes32 indexed batchId,
        uint256 settledAt
    );
    event UsageReleased(
        address indexed agent,
        uint256 amount,
        uint256 requestId,
        uint8 reasonCode,
        uint256 newReserved
    );
    event OperatorSet(address indexed operator, bool authorized);
    event ProviderSet(address indexed provider);
    event UpgradeAuthorized(address indexed implementation);
    event DailyCapSet(
        address indexed agent, uint256 previousEffectiveCap, uint256 newCap, uint256 effectiveAt
    );
    event FrozenSet(address indexed agent, bool frozen);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    function setUp() public virtual {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        lyntoImpl = new LyntoPayments();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(lyntoImpl),
            abi.encodeCall(LyntoPayments.initialize, (address(usdc), provider, owner))
        );
        lynto = LyntoPayments(address(proxy));
        lynto.setOperator(operator, true);
        vm.stopPrank();

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

    /// @dev Warps to the start of the next rolling day.
    function warpToNextDay() internal {
        vm.warp((block.timestamp / 1 days + 1) * 1 days);
    }

    /// @dev Three-step helper for ported tests: request, wait out the
    ///      withdrawal delay, execute. Equivalent to the removed `withdraw()`.
    function withdrawNow(address agent, uint256 amount) internal {
        vm.prank(agent);
        lynto.requestWithdraw(amount);
        vm.warp(block.timestamp + lynto.withdrawDelay());
        vm.prank(agent);
        lynto.executeWithdraw();
    }
}

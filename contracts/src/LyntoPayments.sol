// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LyntoPayments
/// @notice Prepaid USDC payment infrastructure for autonomous software.
/// @dev Accounts are keyed by agent wallet address. All amounts use 6-decimal
///      USDC integer units (base units). The contract holds prepaid balances,
///      tracks operator reservations against accrued unsettled usage, and
///      settles batched charges to a designated provider.
///
///      Accounting model per agent:
///        totalDeposited  - cumulative USDC deposited
///        totalWithdrawn  - cumulative USDC withdrawn by the agent
///        totalSettled    - cumulative USDC paid out to the provider
///        reserved        - funds locked for accrued but unsettled API usage
///        balanceOf       - prepaid balance held = deposited - withdrawn - settled
///        availableOf     - withdrawable / unreserved = balanceOf - reserved
///
///      Trust model (MVP): the settlement operator meters API usage offchain
///      and is trusted to report accurate amounts. Batch IDs prevent duplicate
///      settlement of the same batch. Reservations ensure users cannot withdraw
///      funds already committed to accrued usage before the operator settles.
contract LyntoPayments is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    /// @notice Address that receives settled payments (the service provider).
    address public provider;

    /// @notice Settlement operators authorized to reserve, release, and settle.
    mapping(address => bool) public isOperator;

    /// @notice Prepaid balance held for each agent (base units).
    mapping(address => uint256) public balances;

    /// @notice Funds reserved for accrued but unsettled usage per agent.
    mapping(address => uint256) public reserved;

    /// @notice Cumulative deposits per agent.
    mapping(address => uint256) public totalDeposited;

    /// @notice Cumulative withdrawals per agent.
    mapping(address => uint256) public totalWithdrawn;

    /// @notice Cumulative settled payments per agent (paid to provider).
    mapping(address => uint256) public totalSettled;

    /// @notice Unique batch IDs that have been settled (prevents duplicates).
    mapping(bytes32 => bool) public settledBatches;

    /// @notice Events
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

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAvailable();
    error InsufficientReserved();
    error UnauthorizedOperator();
    error BatchAlreadySettled(bytes32 batchId);

    constructor(address usdc_, address provider_, address owner_) Ownable(owner_) {
        if (usdc_ == address(0) || provider_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        usdc = IERC20(usdc_);
        provider = provider_;
    }

    // ---------------------------------------------------------------------
    // Deposits & withdrawals (agent-side)
    // ---------------------------------------------------------------------

    /// @notice Deposit USDC into the caller's prepaid balance.
    /// @dev Caller must have approved this contract for `amount` USDC beforehand.
    /// @param amount USDC amount in 6-decimal base units.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        balances[msg.sender] += amount;
        totalDeposited[msg.sender] += amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw unreserved USDC from the caller's prepaid balance.
    /// @dev Only funds not reserved for accrued usage can be withdrawn.
    /// @param amount USDC amount in 6-decimal base units.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint256 avail = availableOf(msg.sender);
        if (amount > avail) revert InsufficientAvailable();

        balances[msg.sender] -= amount;
        totalWithdrawn[msg.sender] += amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Operator functions (settlement backend)
    // ---------------------------------------------------------------------

    /// @notice Reserve funds for accrued but unsettled API usage.
    /// @dev Prevents the agent from withdrawing funds already committed to usage.
    /// @param agent Agent wallet address whose funds are reserved.
    /// @param amount Amount to reserve in base units.
    function reserve(address agent, uint256 amount) external nonReentrant {
        if (!isOperator[msg.sender]) revert UnauthorizedOperator();
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 newReserved = reserved[agent] + amount;
        if (newReserved > balances[agent]) revert InsufficientBalance();

        reserved[agent] = newReserved;

        emit Reserved(agent, amount, newReserved);
    }

    /// @notice Release previously reserved funds (e.g., invalidated usage).
    /// @param agent Agent wallet address.
    /// @param amount Amount to release in base units.
    function release(address agent, uint256 amount) external nonReentrant {
        if (!isOperator[msg.sender]) revert UnauthorizedOperator();
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 current = reserved[agent];
        if (amount > current) revert InsufficientReserved();

        reserved[agent] = current - amount;

        emit ReservationReleased(agent, amount, current - amount);
    }

    /// @notice Settle a batch of accrued usage: move reserved funds to the provider.
    /// @dev Batch ID must be unique. Amount must not exceed the agent's reserved
    ///      balance. This prevents double settlement of the same batch and
    ///      prevents the operator from settling more than accrued usage.
    /// @param agent Agent wallet address being charged.
    /// @param amount Settlement amount in base units.
    /// @param batchId Unique batch identifier (prevents duplicates).
    function settle(address agent, uint256 amount, bytes32 batchId) external nonReentrant {
        if (!isOperator[msg.sender]) revert UnauthorizedOperator();
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (settledBatches[batchId]) revert BatchAlreadySettled(batchId);

        uint256 res = reserved[agent];
        if (amount > res) revert InsufficientReserved();
        if (amount > balances[agent]) revert InsufficientBalance();

        settledBatches[batchId] = true;
        reserved[agent] = res - amount;
        balances[agent] -= amount;
        totalSettled[agent] += amount;

        usdc.safeTransfer(provider, amount);

        emit Settled(agent, provider, amount, batchId, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Authorize or deauthorize a settlement operator.
    function setOperator(address operator, bool authorized) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        isOperator[operator] = authorized;
        emit OperatorSet(operator, authorized);
    }

    /// @notice Update the provider address that receives settlements.
    function setProvider(address newProvider) external onlyOwner {
        if (newProvider == address(0)) revert ZeroAddress();
        provider = newProvider;
        emit ProviderSet(newProvider);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Prepaid balance held for an agent (deposited - withdrawn - settled).
    function balanceOf(address agent) public view returns (uint256) {
        return balances[agent];
    }

    /// @notice Funds reserved for accrued but unsettled usage.
    function reservedOf(address agent) public view returns (uint256) {
        return reserved[agent];
    }

    /// @notice Available (unreserved) balance: withdrawable amount.
    function availableOf(address agent) public view returns (uint256) {
        return balances[agent] - reserved[agent];
    }

    /// @notice Whether a batch has already been settled.
    function isBatchSettled(bytes32 batchId) public view returns (bool) {
        return settledBatches[batchId];
    }
}

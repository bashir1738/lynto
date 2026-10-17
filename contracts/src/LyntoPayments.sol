// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @title LyntoPayments
/// @notice Prepaid USDC payment infrastructure for autonomous software.
/// @dev Deployed behind an ERC-1967 (UUPS) proxy. Accounts are keyed by agent
///      wallet address. All amounts use 6-decimal USDC integer units (base
///      units). The contract holds prepaid balances, tracks operator
///      reservations against accrued unsettled usage, and settles batched
///      charges to a designated provider.
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
///
///      Storage: all contract state lives in a single ERC-7201 namespaced
///      struct. Future versions must only append new fields at the end of the
///      struct — never reorder or retype existing fields — so upgrades remain
///      storage-compatible.
contract LyntoPayments is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Storage (ERC-7201 namespaced)
    // ---------------------------------------------------------------------

    /// @notice A queued two-step withdrawal awaiting its delay.
    struct WithdrawalRequest {
        /// @notice Requested amount in base units (0 = no request).
        uint256 amount;
        /// @notice Timestamp at which execution is allowed (0 = no request).
        uint256 executeAfter;
    }

    /// @custom:storage-location erc7201:lynto.storage.LyntoPayments
    struct LyntoPaymentsStorage {
        /// @notice Address that receives settled payments (the service provider).
        address provider;
        /// @notice Settlement operators authorized to reserve, release, and settle.
        mapping(address => bool) isOperator;
        /// @notice Prepaid balance held for each agent (base units).
        mapping(address => uint256) balances;
        /// @notice Funds reserved for accrued but unsettled usage per agent.
        mapping(address => uint256) reserved;
        /// @notice Cumulative deposits per agent.
        mapping(address => uint256) totalDeposited;
        /// @notice Cumulative withdrawals per agent.
        mapping(address => uint256) totalWithdrawn;
        /// @notice Cumulative settled payments per agent (paid to provider).
        mapping(address => uint256) totalSettled;
        /// @notice Unique batch IDs that have been settled (prevents duplicates).
        mapping(bytes32 => bool) settledBatches;
        /// @notice The ERC-20 USDC token used for all accounting.
        IERC20 usdc;
        // --- Phase 2 fields (appended — never reorder or retype above) ---
        /// @notice Per-agent daily spend cap in base units (0 = no cap).
        mapping(address => uint256) dailyCap;
        /// @notice Scheduled cap increase awaiting its 1-hour delay.
        mapping(address => uint256) pendingDailyCap;
        /// @notice Timestamp at which `pendingDailyCap` becomes effective (0 = none).
        mapping(address => uint256) pendingDailyCapEffectiveAt;
        /// @notice Whether the agent wallet has frozen its own account.
        mapping(address => bool) frozen;
        /// @notice Amount reserved today (the rolling-day counter).
        mapping(address => uint256) dailyUsedAmount;
        /// @notice Day key (`block.timestamp / 1 days`) of `dailyUsedAmount`.
        mapping(address => uint256) dailyUsedDay;
        /// @notice Owner-level pause: blocks deposit, reserve and settle.
        bool paused;
        // --- Phase 3 fields (appended — never reorder or retype above) ---
        /// @notice Queued two-step withdrawal request per agent.
        mapping(address => WithdrawalRequest) withdrawalRequests;
        /// @notice Delay between requesting and executing a withdrawal.
        uint256 withdrawalDelay;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Minimum allowed withdrawal delay (owner-configurable).
    uint256 public constant MIN_WITHDRAW_DELAY = 1 minutes;
    /// @notice Maximum allowed withdrawal delay (owner-configurable).
    uint256 public constant MAX_WITHDRAW_DELAY = 1 days;
    /// @notice Withdrawal delay set at initialization (10 minutes).
    uint256 public constant DEFAULT_WITHDRAW_DELAY = 10 minutes;
    /// @notice Release reason code: off-chain metering correction.
    uint8 public constant REASON_METERING_CORRECTION = 1;
    /// @notice Release reason code: dispute or goodwill refund.
    uint8 public constant REASON_DISPUTE_REFUND = 2;
    /// @notice Release reason code: periodic reconciliation of reservations.
    uint8 public constant REASON_RECONCILIATION = 3;

    // keccak256(abi.encode(uint256(keccak256("lynto.storage.LyntoPayments")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant LYNTOPAYMENTS_STORAGE_LOCATION =
        0x8e57664926b5d66c2ae906d37246d8f5cc558ab5d2e2e0840f99910a07783900;

    /// @dev Returns the namespaced storage struct.
    function _storage() private pure returns (LyntoPaymentsStorage storage $) {
        assembly {
            $.slot := LYNTOPAYMENTS_STORAGE_LOCATION
        }
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

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
    /// @notice Emitted when the owner authorizes an implementation upgrade.
    event UpgradeAuthorized(address indexed implementation);
    /// @notice Emitted when an agent wallet changes its daily spend cap.
    /// @param agent The agent wallet setting the cap.
    /// @param previousEffectiveCap Effective cap before this call.
    /// @param newCap Requested cap value.
    /// @param effectiveAt Timestamp at which `newCap` takes effect.
    event DailyCapSet(
        address indexed agent, uint256 previousEffectiveCap, uint256 newCap, uint256 effectiveAt
    );
    /// @notice Emitted when an agent wallet freezes or unfreezes itself.
    event FrozenSet(address indexed agent, bool frozen);
    /// @notice Emitted when the owner pauses the contract.
    event Paused(address indexed account);
    /// @notice Emitted when the owner unpauses the contract.
    event Unpaused(address indexed account);
    /// @notice Emitted when an agent queues a two-step withdrawal.
    /// @param agent The agent wallet requesting the withdrawal.
    /// @param amount Requested amount in base units.
    /// @param executeAfter Timestamp from which execution is allowed.
    event WithdrawRequested(address indexed agent, uint256 amount, uint256 executeAfter);
    /// @notice Emitted when an agent cancels its pending withdrawal request.
    /// @param agent The agent wallet cancelling the request.
    /// @param amount The cancelled amount in base units.
    event WithdrawCancelled(address indexed agent, uint256 amount);
    /// @notice Emitted when the owner changes the withdrawal delay.
    /// @param previousDelay Delay before this call.
    /// @param newDelay Delay after this call.
    event WithdrawDelaySet(uint256 previousDelay, uint256 newDelay);
    /// @notice Emitted when reserved usage is released back to an agent.
    /// @param agent The agent wallet whose reservation was released.
    /// @param amount Released amount in base units.
    /// @param requestId Off-chain release request identifier (0 allowed).
    /// @param reasonCode Why the release happened: 1 = metering correction,
    ///                   2 = dispute/refund, 3 = reconciliation.
    /// @param newReserved Reserved balance after the release.
    event UsageReleased(
        address indexed agent,
        uint256 amount,
        uint256 requestId,
        uint8 reasonCode,
        uint256 newReserved
    );

    // ---------------------------------------------------------------------
    // Custom errors
    // ---------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAvailable();
    error InsufficientReserved();
    error UnauthorizedOperator();
    error BatchAlreadySettled(bytes32 batchId);
    /// @notice Today's reserved total plus the amount would exceed the effective cap.
    error DailyCapExceeded();
    /// @notice The agent wallet is frozen; reserves are rejected.
    error AccountFrozen();
    /// @notice The contract is paused; the operation is blocked.
    error ContractPaused();
    /// @notice The contract is not paused; unpause is a no-op.
    error ContractNotPaused();
    /// @notice No pending withdrawal request exists for the caller.
    error NoPendingWithdrawal();
    /// @notice The withdrawal request has not reached its execution time.
    /// @param executeAfter Timestamp from which execution is allowed.
    error WithdrawalNotReady(uint256 executeAfter);
    /// @notice The requested withdrawal delay is outside the allowed bounds.
    error InvalidWithdrawDelay();
    /// @notice The release reason code is not one of {1, 2, 3}.
    error InvalidReasonCode();

    /// @dev Owner-level pause gate (deposit, reserve, settle only — never
    ///      withdrawals of unreserved funds).
    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    function _whenNotPaused() private view {
        if (_storage().paused) revert ContractPaused();
    }

    // ---------------------------------------------------------------------
    // Initializer / upgrade authorization
    // ---------------------------------------------------------------------

    /// @dev Prevents the bare implementation from being initialized directly.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the proxy-backed contract.
    /// @param usdc_ ERC-20 USDC token (6 decimals).
    /// @param provider_ Address that receives settled payments.
    /// @param owner_ Contract owner (manages operators/provider).
    function initialize(address usdc_, address provider_, address owner_) external initializer {
        // Ownable first: a zero owner reverts with OwnableInvalidOwner before
        // this contract's own ZeroAddress check (same precedence as the
        // original constructor, where the Ownable base ran before the body).
        __Ownable_init(owner_);
        if (usdc_ == address(0) || provider_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        LyntoPaymentsStorage storage $ = _storage();
        $.usdc = IERC20(usdc_);
        $.provider = provider_;
        $.withdrawalDelay = DEFAULT_WITHDRAW_DELAY;
    }

    /// @dev UUPS upgrade gate: only the owner may authorize upgrades.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        emit UpgradeAuthorized(newImplementation);
    }

    // ---------------------------------------------------------------------
    // Deposits & withdrawals (agent-side)
    // ---------------------------------------------------------------------

    /// @notice Deposit USDC into the caller's prepaid balance.
    /// @dev Caller must have approved this contract for `amount` USDC beforehand.
    /// @param amount USDC amount in 6-decimal base units.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        LyntoPaymentsStorage storage $ = _storage();
        $.balances[msg.sender] += amount;
        $.totalDeposited[msg.sender] += amount;

        $.usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount);
    }

    /// @notice Step 1 of the two-step withdrawal: queue `amount` for payout.
    /// @dev Enforces `amount <= availableOf(caller)` at request time. A new
    ///      request overwrites any pending one and restarts the delay.
    ///      Never blocked by pause or freeze: the owner cannot trap funds.
    /// @param amount USDC amount in 6-decimal base units.
    function requestWithdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > availableOf(msg.sender)) revert InsufficientAvailable();

        LyntoPaymentsStorage storage $ = _storage();
        uint256 executeAfter = block.timestamp + $.withdrawalDelay;
        $.withdrawalRequests[msg.sender] =
            WithdrawalRequest({amount: amount, executeAfter: executeAfter});

        emit WithdrawRequested(msg.sender, amount, executeAfter);
    }

    /// @notice Step 2 of the two-step withdrawal: execute a matured request.
    /// @dev One-shot: the pending request is cleared before funds move.
    ///      Re-validates availability at execution time so usage reserved
    ///      during the delay can never be withdrawn. Never blocked by pause.
    function executeWithdraw() external nonReentrant {
        LyntoPaymentsStorage storage $ = _storage();
        WithdrawalRequest storage req = $.withdrawalRequests[msg.sender];
        if (req.executeAfter == 0) revert NoPendingWithdrawal();
        if (block.timestamp < req.executeAfter) revert WithdrawalNotReady(req.executeAfter);
        if (req.amount == 0) revert ZeroAmount();

        uint256 amount = req.amount;
        if (amount > availableOf(msg.sender)) revert InsufficientAvailable();

        delete $.withdrawalRequests[msg.sender];
        $.balances[msg.sender] -= amount;
        $.totalWithdrawn[msg.sender] += amount;

        $.usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Cancel the caller's pending withdrawal request (if any).
    function cancelWithdraw() external nonReentrant {
        LyntoPaymentsStorage storage $ = _storage();
        WithdrawalRequest storage req = $.withdrawalRequests[msg.sender];
        if (req.executeAfter == 0) revert NoPendingWithdrawal();

        uint256 amount = req.amount;
        delete $.withdrawalRequests[msg.sender];

        emit WithdrawCancelled(msg.sender, amount);
    }

    /// @notice Owner: set the delay between requesting and executing a withdrawal.
    /// @dev Bounds: [`MIN_WITHDRAW_DELAY`, `MAX_WITHDRAW_DELAY`]. Existing
    ///      pending requests keep the delay captured at their request time.
    /// @param newDelay New withdrawal delay in seconds.
    function setWithdrawDelay(uint256 newDelay) external onlyOwner nonReentrant {
        if (newDelay < MIN_WITHDRAW_DELAY || newDelay > MAX_WITHDRAW_DELAY) {
            revert InvalidWithdrawDelay();
        }

        LyntoPaymentsStorage storage $ = _storage();
        uint256 previousDelay = $.withdrawalDelay;
        $.withdrawalDelay = newDelay;

        emit WithdrawDelaySet(previousDelay, newDelay);
    }

    // ---------------------------------------------------------------------
    // Agent policy (daily cap, freeze)
    // ---------------------------------------------------------------------

    /// @notice Set the caller's own daily spend cap (base units, 0 = no cap).
    /// @dev Tightening (allowing less daily spend) takes effect immediately and
    ///      cancels any pending increase. Loosening (allowing more daily spend,
    ///      including removing the cap by setting 0) takes effect after 1 hour;
    ///      a new request overwrites a pending one and restarts the delay.
    ///      Treating 0 as "unlimited" keeps the delay meaningful — otherwise
    ///      `setDailyCap(0)` would remove any cap instantly and bypass it.
    /// @param newCap Requested daily cap in 6-decimal base units.
    function setDailyCap(uint256 newCap) external nonReentrant {
        LyntoPaymentsStorage storage $ = _storage();
        address agent = msg.sender;

        // Commit a matured pending change first so comparisons and the
        // effective cap can never regress while scheduling a newer change.
        uint256 pendingAt = $.pendingDailyCapEffectiveAt[agent];
        if (pendingAt != 0 && block.timestamp >= pendingAt) {
            $.dailyCap[agent] = $.pendingDailyCap[agent];
            $.pendingDailyCap[agent] = 0;
            $.pendingDailyCapEffectiveAt[agent] = 0;
        }

        uint256 current = $.dailyCap[agent];

        // Loosening check with 0 = unlimited: effectiveLimit(c) = c == 0 ? ∞ : c.
        bool loosens;
        if (newCap == 0) {
            loosens = current != 0;
        } else if (current == 0) {
            loosens = false;
        } else {
            loosens = newCap > current;
        }

        uint256 effectiveAt;
        if (!loosens) {
            // Tighten (or no-op): immediate, cancels any pending change.
            $.dailyCap[agent] = newCap;
            $.pendingDailyCap[agent] = 0;
            $.pendingDailyCapEffectiveAt[agent] = 0;
            effectiveAt = block.timestamp;
        } else {
            // Loosen: effective after 1 hour (pending overwritten, timer reset).
            effectiveAt = block.timestamp + 1 hours;
            $.pendingDailyCap[agent] = newCap;
            $.pendingDailyCapEffectiveAt[agent] = effectiveAt;
        }

        emit DailyCapSet(agent, current, newCap, effectiveAt);
    }

    /// @notice Freeze or unfreeze the caller's own account.
    /// @dev While frozen, `reserve()` reverts. Withdrawals are never frozen.
    /// @param value True to freeze, false to unfreeze.
    function setFrozen(bool value) external nonReentrant {
        _storage().frozen[msg.sender] = value;
        emit FrozenSet(msg.sender, value);
    }

    // ---------------------------------------------------------------------
    // Operator functions (settlement backend)
    // ---------------------------------------------------------------------

    /// @notice Reserve funds for accrued but unsettled API usage.
    /// @dev Prevents the agent from withdrawing funds already committed to usage.
    ///      Reverts while the contract is paused, while the agent is frozen, or
    ///      when today's reserved total plus `amount` would exceed the agent's
    ///      effective daily cap (0 cap = uncapped).
    /// @param agent Agent wallet address whose funds are reserved.
    /// @param amount Amount to reserve in base units.
    function reserve(address agent, uint256 amount) external nonReentrant whenNotPaused {
        LyntoPaymentsStorage storage $ = _storage();
        if (!$.isOperator[msg.sender]) revert UnauthorizedOperator();
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if ($.frozen[agent]) revert AccountFrozen();

        // Rolling-day spend counter: day = block.timestamp / 1 days.
        // Lazily reset when the day rolls over.
        uint256 today = block.timestamp / 1 days;
        if ($.dailyUsedDay[agent] != today) {
            $.dailyUsedDay[agent] = today;
            $.dailyUsedAmount[agent] = 0;
        }

        uint256 used = $.dailyUsedAmount[agent];
        uint256 cap = _effectiveCap($, agent);
        if (cap != 0 && used + amount > cap) revert DailyCapExceeded();

        uint256 newReserved = $.reserved[agent] + amount;
        if (newReserved > $.balances[agent]) revert InsufficientBalance();

        $.reserved[agent] = newReserved;
        $.dailyUsedAmount[agent] = used + amount;

        emit Reserved(agent, amount, newReserved);
    }

    /// @notice Release previously reserved funds (e.g., invalidated usage).
    /// @dev Also refunds today's spend counter, floored at 0. Releases of
    ///      reservations made on earlier days leave today's counter untouched.
    ///      Emits both {UsageReleased} and the legacy {ReservationReleased}.
    /// @param agent Agent wallet address.
    /// @param amount Amount to release in base units.
    /// @param requestId Off-chain release request identifier (0 allowed).
    /// @param reasonCode Why: 1 = metering correction, 2 = dispute/refund,
    ///                    3 = reconciliation.
    function release(address agent, uint256 amount, uint256 requestId, uint8 reasonCode)
        external
        nonReentrant
    {
        LyntoPaymentsStorage storage $ = _storage();
        if (!$.isOperator[msg.sender]) revert UnauthorizedOperator();
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (reasonCode < REASON_METERING_CORRECTION || reasonCode > REASON_RECONCILIATION) {
            revert InvalidReasonCode();
        }

        uint256 current = $.reserved[agent];
        if (amount > current) revert InsufficientReserved();

        $.reserved[agent] = current - amount;

        uint256 today = block.timestamp / 1 days;
        if ($.dailyUsedDay[agent] == today) {
            uint256 used = $.dailyUsedAmount[agent];
            $.dailyUsedAmount[agent] = used > amount ? used - amount : 0;
        }

        emit UsageReleased(agent, amount, requestId, reasonCode, current - amount);
        emit ReservationReleased(agent, amount, current - amount);
    }

    /// @notice Settle a batch of accrued usage: move reserved funds to the provider.
    /// @dev Batch ID must be unique. Amount must not exceed the agent's reserved
    ///      balance. This prevents double settlement of the same batch and
    ///      prevents the operator from settling more than accrued usage.
    /// @param agent Agent wallet address being charged.
    /// @param amount Settlement amount in base units.
    /// @param batchId Unique batch identifier (prevents duplicates).
    function settle(address agent, uint256 amount, bytes32 batchId)
        external
        nonReentrant
        whenNotPaused
    {
        LyntoPaymentsStorage storage $ = _storage();
        if (!$.isOperator[msg.sender]) revert UnauthorizedOperator();
        if (agent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if ($.settledBatches[batchId]) revert BatchAlreadySettled(batchId);

        uint256 res = $.reserved[agent];
        if (amount > res) revert InsufficientReserved();
        if (amount > $.balances[agent]) revert InsufficientBalance();

        $.settledBatches[batchId] = true;
        $.reserved[agent] = res - amount;
        $.balances[agent] -= amount;
        $.totalSettled[agent] += amount;

        $.usdc.safeTransfer(provider(), amount);

        emit Settled(agent, provider(), amount, batchId, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Authorize or deauthorize a settlement operator.
    function setOperator(address operator, bool authorized) external onlyOwner nonReentrant {
        if (operator == address(0)) revert ZeroAddress();
        _storage().isOperator[operator] = authorized;
        emit OperatorSet(operator, authorized);
    }

    /// @notice Update the provider address that receives settlements.
    function setProvider(address newProvider) external onlyOwner nonReentrant {
        if (newProvider == address(0)) revert ZeroAddress();
        _storage().provider = newProvider;
        emit ProviderSet(newProvider);
    }

    /// @notice Pause the contract: blocks deposit, reserve and settle.
    /// @dev Withdrawals of unreserved funds are never blocked by pause.
    function pause() external onlyOwner nonReentrant {
        LyntoPaymentsStorage storage $ = _storage();
        if ($.paused) revert ContractPaused();
        $.paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Unpause the contract.
    function unpause() external onlyOwner nonReentrant {
        LyntoPaymentsStorage storage $ = _storage();
        if (!$.paused) revert ContractNotPaused();
        $.paused = false;
        emit Unpaused(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice The ERC-20 USDC token used for all accounting.
    function usdc() public view returns (IERC20) {
        return _storage().usdc;
    }

    /// @notice Address that receives settled payments (the service provider).
    function provider() public view returns (address) {
        return _storage().provider;
    }

    /// @notice Whether `operator` is an authorized settlement operator.
    function isOperator(address operator) public view returns (bool) {
        return _storage().isOperator[operator];
    }

    /// @notice Prepaid balance held for an agent (deposited - withdrawn - settled).
    function balances(address agent) public view returns (uint256) {
        return _storage().balances[agent];
    }

    /// @notice Funds reserved for accrued but unsettled usage.
    function reserved(address agent) public view returns (uint256) {
        return _storage().reserved[agent];
    }

    /// @notice Cumulative deposits per agent.
    function totalDeposited(address agent) public view returns (uint256) {
        return _storage().totalDeposited[agent];
    }

    /// @notice Cumulative withdrawals per agent.
    function totalWithdrawn(address agent) public view returns (uint256) {
        return _storage().totalWithdrawn[agent];
    }

    /// @notice Cumulative settled payments per agent (paid to provider).
    function totalSettled(address agent) public view returns (uint256) {
        return _storage().totalSettled[agent];
    }

    /// @notice Whether a batch has already been settled.
    function settledBatches(bytes32 batchId) public view returns (bool) {
        return _storage().settledBatches[batchId];
    }

    /// @notice Prepaid balance held for an agent (deposited - withdrawn - settled).
    function balanceOf(address agent) public view returns (uint256) {
        return _storage().balances[agent];
    }

    /// @notice Funds reserved for accrued but unsettled usage.
    function reservedOf(address agent) public view returns (uint256) {
        return _storage().reserved[agent];
    }

    /// @notice Available (unreserved) balance: withdrawable amount.
    function availableOf(address agent) public view returns (uint256) {
        LyntoPaymentsStorage storage $ = _storage();
        return $.balances[agent] - $.reserved[agent];
    }

    /// @notice Whether a batch has already been settled.
    function isBatchSettled(bytes32 batchId) public view returns (bool) {
        return _storage().settledBatches[batchId];
    }

    /// @notice Effective daily cap for `agent` right now (0 = no cap).
    /// @dev A scheduled increase applies once `block.timestamp` reaches its
    ///      effective time.
    function dailyCapOf(address agent) public view returns (uint256) {
        return _effectiveCap(_storage(), agent);
    }

    /// @notice Pending cap increase for `agent`, if any.
    /// @return newCap The scheduled cap value (0 if none).
    /// @return effectiveAt Timestamp at which `newCap` takes effect (0 if none).
    function pendingDailyCapOf(address agent)
        public
        view
        returns (uint256 newCap, uint256 effectiveAt)
    {
        LyntoPaymentsStorage storage $ = _storage();
        return ($.pendingDailyCap[agent], $.pendingDailyCapEffectiveAt[agent]);
    }

    /// @notice Whether `agent` has frozen its own account.
    function isFrozen(address agent) public view returns (bool) {
        return _storage().frozen[agent];
    }

    /// @notice Whether the contract is paused (owner-level circuit breaker).
    function paused() public view returns (bool) {
        return _storage().paused;
    }

    /// @notice Today's reserved total against the rolling-day cap.
    /// @dev Returns 0 once the day has rolled over, before the next reserve.
    function dailyUsedOf(address agent) public view returns (uint256) {
        LyntoPaymentsStorage storage $ = _storage();
        if ($.dailyUsedDay[agent] != block.timestamp / 1 days) return 0;
        return $.dailyUsedAmount[agent];
    }

    /// @notice Current delay between requesting and executing a withdrawal.
    function withdrawDelay() public view returns (uint256) {
        return _storage().withdrawalDelay;
    }

    /// @notice Pending withdrawal request for `agent`, if any.
    /// @return amount Requested amount in base units (0 if none).
    /// @return executeAfter Timestamp from which execution is allowed (0 if none).
    function withdrawalRequestOf(address agent)
        public
        view
        returns (uint256 amount, uint256 executeAfter)
    {
        WithdrawalRequest storage req = _storage().withdrawalRequests[agent];
        return (req.amount, req.executeAfter);
    }

    /// @dev Effective cap: a matured pending increase applies immediately.
    function _effectiveCap(LyntoPaymentsStorage storage $, address agent)
        private
        view
        returns (uint256)
    {
        uint256 pendingAt = $.pendingDailyCapEffectiveAt[agent];
        if (pendingAt != 0 && block.timestamp >= pendingAt) {
            return $.pendingDailyCap[agent];
        }
        return $.dailyCap[agent];
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LyntoPayments} from "./LyntoPayments.sol";

/// @title LyntoPaymentsV2
/// @notice Example follow-up version of {LyntoPayments} used to prove that
///         ERC-7201 namespaced storage survives upgrades when new fields are
///         only ever appended.
/// @dev Redeclares the V1 storage struct at the same namespaced location with
///      one extra field appended at the end. All V1 fields keep their exact
///      slots, so getters inherited from {LyntoPayments} continue to work.
contract LyntoPaymentsV2 is LyntoPayments {
    /// @custom:storage-location erc7201:lynto.storage.LyntoPayments
    struct LyntoPaymentsStorageV2 {
        address provider;
        mapping(address => bool) isOperator;
        mapping(address => uint256) balances;
        mapping(address => uint256) reserved;
        mapping(address => uint256) totalDeposited;
        mapping(address => uint256) totalWithdrawn;
        mapping(address => uint256) totalSettled;
        mapping(bytes32 => bool) settledBatches;
        IERC20 usdc;
        // --- Phase 2 fields (mirrors V1) ---
        mapping(address => uint256) dailyCap;
        mapping(address => uint256) pendingDailyCap;
        mapping(address => uint256) pendingDailyCapEffectiveAt;
        mapping(address => bool) frozen;
        mapping(address => uint256) dailyUsedAmount;
        mapping(address => uint256) dailyUsedDay;
        bool paused;
        // --- Phase 3 fields (mirrors V1) ---
        mapping(address => WithdrawalRequest) withdrawalRequests;
        uint256 withdrawalDelay;
        // --- appended in V2 (never reorder or retype anything above) ---
        /// @notice Example counter added by V2.
        uint256 v2Counter;
    }

    // Same ERC-7201 location as V1: keccak256(abi.encode(uint256(keccak256("lynto.storage.LyntoPayments")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant LYNTOPAYMENTS_V2_STORAGE_LOCATION =
        0x8e57664926b5d66c2ae906d37246d8f5cc558ab5d2e2e0840f99910a07783900;

    function _v2Storage() private pure returns (LyntoPaymentsStorageV2 storage $) {
        assembly {
            $.slot := LYNTOPAYMENTS_V2_STORAGE_LOCATION
        }
    }

    /// @notice Read the field introduced in V2.
    function v2Counter() external view returns (uint256) {
        return _v2Storage().v2Counter;
    }

    /// @notice Write the field introduced in V2.
    function setV2Counter(uint256 value) external onlyOwner {
        _v2Storage().v2Counter = value;
    }
}

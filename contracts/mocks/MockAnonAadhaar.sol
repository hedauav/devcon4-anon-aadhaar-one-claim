// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IAnonAadhaar} from "@anon-aadhaar/contracts/interfaces/IAnonAadhaar.sol";

/// @notice Test double for the Anon Aadhaar verifier. A real proof generated with seed X only
///         verifies when X is passed back in, which this mock simulates with `acceptedSeed`.
contract MockAnonAadhaar is IAnonAadhaar {
    uint256 public immutable acceptedSeed;
    bool public valid = true;

    constructor(uint256 _acceptedSeed) {
        acceptedSeed = _acceptedSeed;
    }

    function setValid(bool _valid) external {
        valid = _valid;
    }

    function verifyAnonAadhaarProof(
        uint256 nullifierSeed,
        uint256,
        uint256,
        uint256,
        uint256[4] memory,
        uint256[8] memory
    ) external view returns (bool) {
        return valid && nullifierSeed == acceptedSeed;
    }
}

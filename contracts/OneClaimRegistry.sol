// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IAnonAadhaar} from "@anon-aadhaar/contracts/interfaces/IAnonAadhaar.sol";

/// @title OneClaimRegistry
/// @notice On-chain mirror of the web intake: one benefit claim per human per cycle, proven with
///         an Anon Aadhaar zero-knowledge proof. The contract learns a predicate (18+ and resident
///         of the eligible state) and an app-scoped nullifier - never an Aadhaar number.
contract OneClaimRegistry {
    /// @notice Anon Aadhaar verifier (IAnonAadhaar.verifyAnonAadhaarProof).
    IAnonAadhaar public immutable anonAadhaar;

    /// @notice Nullifier seed fixed by the office at deployment.
    /// INVARIANT (seed fixed by the app): it is immutable and always passed to the verifier by
    /// the contract itself - it is never a caller-supplied argument.
    uint256 public immutable nullifierSeed;

    /// @notice Eligible state packed exactly as the circuit reveals it (little-endian char bytes).
    uint256 public immutable eligibleState;

    /// @notice The office that opens and closes cycles.
    address public immutable office;

    uint256 public currentCycle;
    bool public cycleOpen;

    /// @notice INVARIANT (one claim per human per cycle): the slot ledger.
    mapping(uint256 cycle => mapping(uint256 nullifier => bool)) public hasClaimed;
    mapping(uint256 cycle => uint256) public claimCount;

    event CycleOpened(uint256 indexed cycle);
    event CycleClosed(uint256 indexed cycle);
    event Claimed(uint256 indexed cycle, uint256 indexed nullifier, bytes32 indexed draftId);

    error NotOffice();
    error CycleNotOpen();
    error CycleAlreadyOpen();
    error SignalMismatch();
    error Ineligible();
    error AlreadyClaimed();
    error InvalidProof();

    modifier onlyOffice() {
        if (msg.sender != office) revert NotOffice();
        _;
    }

    constructor(IAnonAadhaar _anonAadhaar, uint256 _nullifierSeed, uint256 _eligibleState) {
        anonAadhaar = _anonAadhaar;
        nullifierSeed = _nullifierSeed;
        eligibleState = _eligibleState;
        office = msg.sender;
    }

    /// @notice Open the next application cycle.
    function openCycle() external onlyOffice {
        if (cycleOpen) revert CycleAlreadyOpen();
        currentCycle += 1;
        cycleOpen = true;
        emit CycleOpened(currentCycle);
    }

    /// @notice Close the current cycle; no further claims are accepted until the next one opens.
    function closeCycle() external onlyOffice {
        if (!cycleOpen) revert CycleNotOpen();
        cycleOpen = false;
        emit CycleClosed(currentCycle);
    }

    /// @notice The signal an applicant's proof must commit to for one application draft.
    /// @dev 248 bits so it is a valid uint256 input to the SDK's hash() and the verifier.
    function applicationSignal(
        uint256 cycle,
        address applicant,
        bytes32 draftId
    ) public view returns (uint256) {
        return
            uint256(keccak256(abi.encode(block.chainid, address(this), cycle, applicant, draftId))) >>
            8;
    }

    /// @notice Take this cycle's slot with an Anon Aadhaar proof.
    /// @param draftId Applicant-chosen draft identifier the signal was derived from.
    /// @param nullifier App-scoped nullifier output by the proof.
    /// @param timestamp QR signature timestamp output by the proof.
    /// @param signal Raw signal committed in the proof (the verifier hashes it).
    /// @param revealArray [ageAbove18, gender, pincode, state] revealed by the proof.
    /// @param groth16Proof Packed groth16 proof (packGroth16Proof from @anon-aadhaar/core).
    function claim(
        bytes32 draftId,
        uint256 nullifier,
        uint256 timestamp,
        uint256 signal,
        uint256[4] calldata revealArray,
        uint256[8] calldata groth16Proof
    ) external {
        if (!cycleOpen) revert CycleNotOpen();
        uint256 cycle = currentCycle;

        // INVARIANT (signal bound to the application): the proof must commit to the signal
        // derived for this cycle, this sender and this draft.
        if (signal != applicationSignal(cycle, msg.sender, draftId)) revert SignalMismatch();

        // INVARIANT (eligibility from revealed outputs): 18+ and the eligible state, read from
        // the proof's revealed public signals.
        if (revealArray[0] != 1 || revealArray[3] != eligibleState) revert Ineligible();

        // INVARIANT (one claim per human per cycle): read the ledger before writing it.
        if (hasClaimed[cycle][nullifier]) revert AlreadyClaimed();

        // INVARIANT (seed fixed by the app): the immutable nullifierSeed is passed, never a
        // caller-chosen one, so a proof generated under any other seed cannot verify.
        if (
            !anonAadhaar.verifyAnonAadhaarProof(
                nullifierSeed,
                nullifier,
                timestamp,
                signal,
                revealArray,
                groth16Proof
            )
        ) revert InvalidProof();

        hasClaimed[cycle][nullifier] = true;
        claimCount[cycle] += 1;
        emit Claimed(cycle, nullifier, draftId);
    }
}

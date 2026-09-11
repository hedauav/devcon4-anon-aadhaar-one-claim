import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DUMMY_PROOF, packState } from './helpers';

const SEED = 424242n;
const ELIGIBLE = packState('Delhi');
const NULLIFIER = 987654321n;
const HOUR = 3600n;
const MAX_PROOF_AGE = HOUR;

const reveal = (age: bigint, state: bigint): [bigint, bigint, bigint, bigint] => [
  age,
  0n,
  0n,
  state,
];

/** Timestamp of the latest block: a QR signed "just now" as far as the chain is concerned. */
async function now(): Promise<bigint> {
  return BigInt(await time.latest());
}

async function deploy(registrySeed: bigint, verifierSeed: bigint, maxProofAge = MAX_PROOF_AGE) {
  const [office, applicant, other] = await ethers.getSigners();
  const verifier = await ethers.deployContract('MockAnonAadhaar', [verifierSeed]);
  const registry = await ethers.deployContract('OneClaimRegistry', [
    await verifier.getAddress(),
    registrySeed,
    ELIGIBLE,
    maxProofAge,
  ]);
  return { office, applicant, other, verifier, registry };
}

async function deployOpen() {
  const fx = await deploy(SEED, SEED);
  await fx.registry.openCycle();
  return fx;
}

async function deploySeedMismatch() {
  const fx = await deploy(SEED, SEED + 1n);
  await fx.registry.openCycle();
  return fx;
}

async function deployOpenNoAgeLimit() {
  const fx = await deploy(SEED, SEED, 0n);
  await fx.registry.openCycle();
  return fx;
}

describe('OneClaimRegistry', () => {
  it('stores the app-fixed seed, eligible state and max proof age as immutables', async () => {
    const { registry, office } = await loadFixture(deployOpen);
    expect(await registry.nullifierSeed()).to.equal(SEED);
    expect(await registry.eligibleState()).to.equal(ELIGIBLE);
    expect(await registry.maxProofAge()).to.equal(MAX_PROOF_AGE);
    expect(await registry.TIMESTAMP_ROUNDING()).to.equal(HOUR);
    expect(await registry.office()).to.equal(office.address);
  });

  it('packs the state the way the circuit reveals it', () => {
    // 'D' (0x44) is the least significant byte.
    expect(packState('Delhi') & 0xffn).to.equal(0x44n);
  });

  it('records exactly one claim for an eligible applicant', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);

    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, await now(), signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    )
      .to.emit(registry, 'Claimed')
      .withArgs(1n, NULLIFIER, draftId);

    expect(await registry.hasClaimed(1n, NULLIFIER)).to.equal(true);
    expect(await registry.claimCount(1n)).to.equal(1n);
  });

  it('rejects a second claim by the same human in the same cycle, even with a new draft', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draft1 = ethers.id('draft-1');
    const draft2 = ethers.id('draft-2');
    const signal1 = await registry.applicationSignal(1n, applicant.address, draft1);
    const signal2 = await registry.applicationSignal(1n, applicant.address, draft2);

    await registry
      .connect(applicant)
      .claim(draft1, NULLIFIER, await now(), signal1, reveal(1n, ELIGIBLE), DUMMY_PROOF);

    await expect(
      registry
        .connect(applicant)
        .claim(draft2, NULLIFIER, await now(), signal2, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'AlreadyClaimed');
    expect(await registry.claimCount(1n)).to.equal(1n);
  });

  it('allows the same human again in the next cycle', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const signal1 = await registry.applicationSignal(1n, applicant.address, draftId);
    await registry
      .connect(applicant)
      .claim(draftId, NULLIFIER, await now(), signal1, reveal(1n, ELIGIBLE), DUMMY_PROOF);

    await registry.closeCycle();
    await registry.openCycle();

    const signal2 = await registry.applicationSignal(2n, applicant.address, draftId);
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, await now(), signal2, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    )
      .to.emit(registry, 'Claimed')
      .withArgs(2n, NULLIFIER, draftId);
  });

  it('rejects a proof whose signal belongs to a different draft', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const signalForOtherDraft = await registry.applicationSignal(
      1n,
      applicant.address,
      ethers.id('other-draft'),
    );
    await expect(
      registry
        .connect(applicant)
        .claim(
          ethers.id('draft-1'),
          NULLIFIER,
          await now(),
          signalForOtherDraft,
          reveal(1n, ELIGIBLE),
          DUMMY_PROOF,
        ),
    ).to.be.revertedWithCustomError(registry, 'SignalMismatch');
  });

  it('rejects a proof replayed by a different sender', async () => {
    const { registry, applicant, other } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const applicantSignal = await registry.applicationSignal(1n, applicant.address, draftId);
    await expect(
      registry
        .connect(other)
        .claim(draftId, NULLIFIER, await now(), applicantSignal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'SignalMismatch');
  });

  it('rejects applicants who did not prove age 18+', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, await now(), signal, reveal(0n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'Ineligible');
  });

  it('rejects applicants from another state', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    await expect(
      registry
        .connect(applicant)
        .claim(
          draftId,
          NULLIFIER,
          await now(),
          signal,
          reveal(1n, packState('Kerala')),
          DUMMY_PROOF,
        ),
    ).to.be.revertedWithCustomError(registry, 'Ineligible');
  });

  it('rejects a proof over a QR signed longer ago than maxProofAge plus hour rounding', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    const stale = (await now()) - MAX_PROOF_AGE - HOUR - 1n;
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, stale, signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'StaleProof');
    expect(await registry.hasClaimed(1n, NULLIFIER)).to.equal(false);
  });

  it('accepts a fresh QR whose circuit timestamp was rounded down to the hour', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    const roundedDown = (await now()) - HOUR - 1800n;
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, roundedDown, signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    )
      .to.emit(registry, 'Claimed')
      .withArgs(1n, NULLIFIER, draftId);
  });

  it('skips the freshness check when maxProofAge is 0', async () => {
    const { registry, applicant } = await loadFixture(deployOpenNoAgeLimit);
    expect(await registry.maxProofAge()).to.equal(0n);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    const veryOld = (await now()) - 365n * 24n * HOUR;
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, veryOld, signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    )
      .to.emit(registry, 'Claimed')
      .withArgs(1n, NULLIFIER, draftId);
  });

  it('rejects an invalid proof', async () => {
    const { registry, verifier, applicant } = await loadFixture(deployOpen);
    await verifier.setValid(false);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, await now(), signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'InvalidProof');
    expect(await registry.hasClaimed(1n, NULLIFIER)).to.equal(false);
  });

  it('verifies with its own immutable seed, so proofs made under another seed fail', async () => {
    const { registry, applicant } = await loadFixture(deploySeedMismatch);
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, await now(), signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'InvalidProof');
  });

  it('only lets the office open and close cycles', async () => {
    const { registry, other } = await loadFixture(deployOpen);
    await expect(registry.connect(other).closeCycle()).to.be.revertedWithCustomError(
      registry,
      'NotOffice',
    );
    await registry.closeCycle();
    await expect(registry.connect(other).openCycle()).to.be.revertedWithCustomError(
      registry,
      'NotOffice',
    );
  });

  it('rejects claims while no cycle is open', async () => {
    const { registry, applicant } = await loadFixture(deployOpen);
    await registry.closeCycle();
    const draftId = ethers.id('draft-1');
    const signal = await registry.applicationSignal(1n, applicant.address, draftId);
    await expect(
      registry
        .connect(applicant)
        .claim(draftId, NULLIFIER, await now(), signal, reveal(1n, ELIGIBLE), DUMMY_PROOF),
    ).to.be.revertedWithCustomError(registry, 'CycleNotOpen');
  });

  it('refuses to open a cycle while one is already open', async () => {
    const { registry } = await loadFixture(deployOpen);
    await expect(registry.openCycle()).to.be.revertedWithCustomError(registry, 'CycleAlreadyOpen');
  });
});

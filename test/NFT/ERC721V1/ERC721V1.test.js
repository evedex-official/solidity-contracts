const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');
const mockSeeds = require('../../seeds/mock');

describe('ERC721V1', function () {
  let owner, notOwner;
  let nft, vault, priceFeed;
  const price = BN(1000).mul(1e8).toFixed(0);
  const commissionUSD = BN(1.5).mul(1e18).toFixed(0);
  const commissionETH = BN(commissionUSD).mul(1e8).div(price).toFixed(0);
  before(async function () {
    [owner, notOwner] = await ethers.getSigners();

    [priceFeed] = await mockSeeds.priceFeed({ decimals: 8 });
    await priceFeed.setRound(price);

    const VaultV1 = await ethers.getContractFactory('contracts/vault/VaultV1.sol:VaultV1');
    vault = await upgrades.deployProxy(VaultV1, [], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });

    const NFT = await ethers.getContractFactory('contracts/NFT/ERC721V1.sol:ERC721V1');
    nft = await upgrades.deployProxy(
      NFT,
      [
        'NFT',
        'NFT',
        'https://eh.io/nft',
        commissionUSD,
        owner.address,
        await priceFeed.getAddress(),
        await vault.getAddress(),
      ],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );
  });

  const usePayload = async () => {
    const recipient = notOwner.address;
    const referral = 'test';
    const message = `${recipient}:${referral}`;
    return {
      recipient,
      referral,
      message: ethers.hashMessage(message),
      signature: await owner.signMessage(message),
    };
  };

  it('Should revert transaction is signature not valid', async function () {
    const payload = await usePayload();
    payload.signature = await notOwner.signMessage(ethers.hashMessage(payload.message));

    await expect(nft.connect(notOwner).mint(payload, { value: commissionETH })).to.be.revertedWithCustomError(
      nft,
      'ERC721V1InvalidMintSignature',
    );
  });

  it('Should revert transaction is insufficient funds for mint', async function () {
    await expect(
      nft.connect(notOwner).mint(await usePayload(), { value: BN(commissionETH).minus(1).toFixed(0) }),
    ).to.be.revertedWithCustomError(nft, 'ERC721V1InsufficientFundsForMint');
  });

  it('Should mint token', async function () {
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    expect(await nft.totalSupply()).to.equal(0n);

    const commissionOverflow = ethers.parseEther('1.0');
    const beforeMintBalance = await ethers.provider.getBalance(notOwner.address);
    const payload = await usePayload();
    await expect(
      nft.connect(notOwner).mint(payload, {
        value: BigInt(commissionETH) + commissionOverflow,
        gasPrice: 0,
      }),
    )
      .to.emit(nft, 'Minted')
      .withArgs(notOwner.address, 0, commissionETH, payload.referral);
    expect(await nft.balanceOf(notOwner.address)).to.equal(1n);
    expect(await nft.ownerOf(0)).to.equal(notOwner.address);
    expect(await ethers.provider.getBalance(notOwner.address)).to.equal(beforeMintBalance - BigInt(commissionETH));
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(commissionETH);
    expect(await nft.totalSupply()).to.equal(1n);
  });

  it('Should revert transaction if token already minted', async function () {
    await expect(
      nft.connect(notOwner).mint(await usePayload(), { value: commissionETH }),
    ).to.be.revertedWithCustomError(nft, 'ERC721V1TokenAlreadyMinted');
  });

  it('Should changed commission', async function () {
    expect(await nft.commissionUSD()).to.equal(commissionUSD);

    const newCommission = BN(1.2).mul(1e18).toFixed(0);
    await expect(nft.changeCommission(newCommission))
      .to.emit(nft, 'CommissionChanged')
      .withArgs(commissionUSD, newCommission);

    await expect(nft.connect(notOwner).changeCommission(commissionUSD)).to.be.revertedWithCustomError(
      nft,
      'OwnableUnauthorizedAccount',
    );

    await nft.changeCommission(commissionUSD);
  });
});

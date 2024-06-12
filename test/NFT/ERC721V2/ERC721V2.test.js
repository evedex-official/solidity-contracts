const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');
const mockSeeds = require('../../seeds/mock');

describe('ERC721V2', function () {
  let owner, notOwner;
  const price = BN(1000).mul(1e8).toFixed(0);
  const nftId = 'test';
  let nft, burnRegistry, vault;
  const costsUSD = BN(1.5).mul(1e18).toFixed(0);
  const costsETH = BN(costsUSD).mul(1e8).div(price).toFixed(0);
  const recoverUSD = BN(3).mul(1e18).toFixed(0);
  const recoverETH = BN(recoverUSD).mul(1e8).div(price).toFixed(0);
  before(async function () {
    [owner, notOwner] = await ethers.getSigners();

    [priceFeed] = await mockSeeds.priceFeed({ decimals: 8 });
    await priceFeed.setRound(price);

    const VaultV1 = await ethers.getContractFactory('contracts/vault/VaultV1.sol:VaultV1');
    vault = await upgrades.deployProxy(VaultV1, [], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });

    const NFTV1 = await ethers.getContractFactory('contracts/NFT/ERC721V1.sol:ERC721V1');
    nft = await upgrades.deployProxy(
      NFTV1,
      [
        ethers.keccak256(ethers.toUtf8Bytes(nftId)),
        0,
        'NFT',
        'NFT',
        'https://eh.io/nft',
        costsUSD,
        owner.address,
        await priceFeed.getAddress(),
        await vault.getAddress(),
      ],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );

    const BurnRegistryV1 = await ethers.getContractFactory(
      'contracts/NFT/burnRegistry/BurnRegistryV1.sol:BurnRegistryV1',
    );
    burnRegistry = await upgrades.deployProxy(
      BurnRegistryV1,
      [await nft.getAddress(), await priceFeed.getAddress(), recoverUSD],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );

    const NFTV2 = await ethers.getContractFactory('contracts/NFT/ERC721V2.sol:ERC721V2');
    nft = await upgrades.upgradeProxy(await nft.getAddress(), NFTV2, {
      unsafeAllow: ['constructor'],
      call: { fn: 'migrateToV2', args: [await burnRegistry.getAddress()] },
    });
  });

  const createPayloadMessage = (id, recipient, referral) => {
    return ethers.getBytes(ethers.solidityPackedKeccak256(['bytes32', 'address', 'string'], [id, recipient, referral]));
  };

  const usePayload = async () => {
    const id = ethers.keccak256(ethers.toUtf8Bytes(nftId));
    const recipient = notOwner.address;
    const referral = 'test';
    return {
      id,
      recipient,
      referral,
      signature: await owner.signMessage(createPayloadMessage(id, recipient, referral)),
    };
  };

  it('Should revert transaction if already migrated', async function () {
    await expect(nft.connect(owner).migrateToV2(await notOwner.getAddress())).to.be.revertedWithCustomError(
      nft,
      'ERC721V2InvalidBurnRegistry',
    );
  });

  it('Should burn and register token', async function () {
    await owner.sendTransaction({
      to: await burnRegistry.getAddress(),
      value: recoverETH,
    });

    const payload = await usePayload();
    await nft.connect(notOwner).mint(payload, {
      value: BigInt(costsETH),
      gasPrice: 0,
    });
    expect(await nft.totalSupply()).to.equal(1);
    expect(await nft.ownerOf(0)).to.equal(await notOwner.getAddress());
    expect(await burnRegistry.totalSupply()).to.equal(0);
    expect(await burnRegistry.burnedBy(0)).to.equal('0x0000000000000000000000000000000000000000');
    const beforeBalance = await ethers.provider.getBalance(await notOwner.getAddress());

    await expect(
      nft.connect(notOwner).burn(0, {
        gasPrice: 0,
      }),
    )
      .to.emit(burnRegistry, 'Burned')
      .withArgs(await notOwner.getAddress(), 0, 0);
    await expect(nft.ownerOf(0)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken').withArgs(0);

    expect(await burnRegistry.totalSupply()).to.equal(1);
    expect(await burnRegistry.burnedBy(0)).to.equal(await notOwner.getAddress());
    expect(await ethers.provider.getBalance(await notOwner.getAddress())).to.equal(
      BN(beforeBalance).plus(recoverETH).toFixed(0),
    );
  });

  it('Should revert transaction if token is foreign', async function () {
    const payload = await usePayload();
    await nft.connect(notOwner).mint(payload, {
      value: BigInt(costsETH),
      gasPrice: 0,
    });
    expect(await nft.totalSupply()).to.equal(2);
    expect(await nft.ownerOf(1)).to.equal(await notOwner.getAddress());

    await expect(nft.connect(owner).burn(1)).to.be.revertedWithCustomError(nft, 'ERC721V1TransferForbidden');
  });

  it('Should revert transaction if token not exists', async function () {
    expect(await nft.totalSupply()).to.equal(2);
    expect(await nft.ownerOf(1)).to.equal(await notOwner.getAddress());

    await expect(nft.connect(owner).burn(2)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
  });
});

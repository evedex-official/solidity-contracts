const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');
const mockSeeds = require('../../seeds/mock');

describe('ERC721V1', function () {
  let owner, notOwner;
  let nft, vault, priceFeed;
  const nftId = 'test';
  const price = BN(1000).mul(1e8).toFixed(0);
  const costsUSD = BN(1.5).mul(1e18).toFixed(0);
  const costsETH = BN(costsUSD).mul(1e8).div(price).toFixed(0);
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

  it('Should revert transaction if id not valid', async function () {
    const payload = await usePayload();
    payload.id = ethers.keccak256(ethers.toUtf8Bytes('not valid id'));

    await expect(nft.connect(notOwner).mint(payload, { value: costsETH })).to.be.revertedWithCustomError(
      nft,
      'ERC721V1InvalidMintSignature',
    );
  });

  it('Should revert transaction if signature not valid', async function () {
    const payload = await usePayload();
    payload.signature = await notOwner.signMessage(
      createPayloadMessage(payload.id, payload.recipient, payload.referral),
    );

    await expect(nft.connect(notOwner).mint(payload, { value: costsETH })).to.be.revertedWithCustomError(
      nft,
      'ERC721V1InvalidMintSignature',
    );
  });

  it('Should revert transaction if insufficient funds for mint', async function () {
    await expect(
      nft.connect(notOwner).mint(await usePayload(), { value: BN(costsETH).minus(1).toFixed(0) }),
    ).to.be.revertedWithCustomError(nft, 'ERC721V1InsufficientFundsForMint');
  });

  it('Should mint token', async function () {
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
    expect(await nft.totalSupply()).to.equal(0n);

    const costsOverflow = ethers.parseEther('1.0');
    const beforeMintBalance = await ethers.provider.getBalance(notOwner.address);
    const payload = await usePayload();
    await expect(
      nft.connect(notOwner).mint(payload, {
        value: BigInt(costsETH) + costsOverflow,
        gasPrice: 0,
      }),
    )
      .to.emit(nft, 'Minted')
      .withArgs(notOwner.address, 0, costsETH, payload.referral);
    expect(await nft.balanceOf(notOwner.address)).to.equal(1n);
    expect(await nft.ownerOf(0)).to.equal(notOwner.address);
    expect(await ethers.provider.getBalance(notOwner.address)).to.equal(beforeMintBalance - BigInt(costsETH));
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(costsETH);
    expect(await nft.totalSupply()).to.equal(1n);
  });

  it('Should revert transaction if token already minted', async function () {
    await expect(nft.connect(notOwner).mint(await usePayload(), { value: costsETH })).to.be.revertedWithCustomError(
      nft,
      'ERC721V1TokenAlreadyMinted',
    );
  });

  it('Should changed costs', async function () {
    expect(await nft.costsUSD()).to.equal(costsUSD);

    const newCosts = BN(1.2).mul(1e18).toFixed(0);
    await expect(nft.changeCosts(newCosts)).to.emit(nft, 'CostsChanged').withArgs(costsUSD, newCosts);

    await expect(nft.connect(notOwner).changeCosts(costsUSD)).to.be.revertedWithCustomError(
      nft,
      'OwnableUnauthorizedAccount',
    );

    await nft.changeCosts(costsUSD);
  });

  it('Should revert transaction if no available tokens', async function () {
    const NFT = await ethers.getContractFactory('contracts/NFT/ERC721V1.sol:ERC721V1');
    const limitedNFT = await upgrades.deployProxy(
      NFT,
      [
        ethers.keccak256(ethers.toUtf8Bytes(nftId)),
        1,
        'Limited NFT',
        'lNFT',
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
    expect(await limitedNFT.totalSupply()).to.equal(0n);

    const payload = await usePayload();
    await expect(
      limitedNFT.connect(notOwner).mint(payload, {
        value: BigInt(costsETH),
        gasPrice: 0,
      }),
    )
      .to.emit(limitedNFT, 'Minted')
      .withArgs(notOwner.address, 0, costsETH, payload.referral);
    expect(await limitedNFT.totalSupply()).to.equal(1n);

    await expect(
      limitedNFT.connect(notOwner).mint(await usePayload(), { value: costsETH }),
    ).to.be.revertedWithCustomError(limitedNFT, 'ERC721V1NoTokenAvailable');
  });
});

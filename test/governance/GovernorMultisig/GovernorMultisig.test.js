const { expect } = require('chai');
const { ethers } = require('hardhat');
const mockSeeds = require('../../seeds/mock');

describe('GovernorMultisig', function () {
  let owner1, owner2, owner3, notOwner;
  let multisig, erc20;
  const parameters = {
    owners: [],
    decisiveOwners: 0,
  };
  before(async function () {
    [owner1, owner2, owner3, notOwner] = await ethers.getSigners();
    parameters.owners = [owner1.address, owner2.address, owner3.address];
    parameters.decisiveOwners = 2;

    [erc20] = await mockSeeds.erc20();

    const GovernorMultisig = await ethers.getContractFactory(
      'contracts/governance/GovernorMultisig.sol:GovernorMultisig',
    );
    multisig = await GovernorMultisig.deploy();
    await multisig.transferOwnershipWithHowMany(parameters.owners, parameters.decisiveOwners);

    await erc20.transferOwnership(await multisig.getAddress());
  });

  it('Should initialized from parameters', async function () {
    expect(await multisig.ownersCount()).to.equal(BigInt(parameters.owners.length), 'Invalid owners count');
    expect(await multisig.isOwner(owner1.address)).to.true;
    expect(await multisig.isOwner(owner2.address)).to.true;
    expect(await multisig.isOwner(owner3.address)).to.true;
  });

  it('Should execute transaction if many owners vote for', async function () {
    await expect(erc20.connect(owner1).mint(owner2.address, 100n)).to.be.revertedWithCustomError(
      erc20,
      'OwnableUnauthorizedAccount',
    );

    expect(await erc20.balanceOf(owner1.address)).to.equal(0n);

    const mintedAccount = owner1.address;
    const mintedAmount = 100n;
    const targets = [erc20.target];
    const values = [0];
    const methods = ['mint(address,uint256)'];
    const params = [ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [mintedAccount, mintedAmount])];

    await multisig.connect(owner1).executeTransaction(targets, values, methods, params);
    expect(await erc20.balanceOf(mintedAccount)).to.equal(0n, 'Invalid initial account balance');

    await multisig.connect(owner2).executeTransaction(targets, values, methods, params);
    expect(await erc20.balanceOf(mintedAccount)).to.equal(mintedAmount, 'Invalid account balance');
  });

  it('Should revert tx if not owner call', async function () {
    const targets = [erc20.target];
    const values = [0];
    const methods = ['mint(address,uint256)'];
    const params = [ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [notOwner.address, 100n])];

    await expect(multisig.connect(notOwner).executeTransaction(targets, values, methods, params)).to.be.revertedWith(
      '_checkHowManyOwners: msg.sender is not an owner',
    );
  });
});

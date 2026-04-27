const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('EHMarket', function () {
  let container = {};
  before(async function () {
    console.log('run before');
    const [owner, matcher1, matcher2, alice, bob] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory('MockToken');
    const usdt = await MockToken.deploy('USDT', 'USDT', owner.address);

    await usdt.mint(owner.address, ethers.parseEther('1000000'));
    await usdt.mint(alice.address, ethers.parseEther('10000'));
    await usdt.mint(bob.address, ethers.parseEther('10000'));

    const EHMarket = await ethers.getContractFactory('contracts/ehmarket/EHMarketV1.sol:EHMarketV1');
    const market = await upgrades.deployProxy(
      EHMarket,
      [[matcher1.address, matcher2.address], await usdt.getAddress()],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );

    container = { owner, matcher1, matcher2, market, usdt, alice, bob };
  });

  describe('Deployment', function () {
    it('should deploy correctly', async function () {
      const { market } = container;
      expect(await market.getAddress()).to.properAddress;
    });

    it('Should set initial params', async function () {
      const { market, usdt, matcher1, matcher2 } = container;
      console.log(await market.getAddress());

      const collateral = await market.collateral();
      expect(collateral).to.equal(await usdt.getAddress(), 'wrong collateral address');

      const matcherRole = await market.MATCHER_ROLE();
      const hasMatcher1Role = await market.hasRole(matcherRole, matcher1.address);

      expect(hasMatcher1Role).to.be.true;
      const hasMatcher2Role = await market.hasRole(matcherRole, matcher2.address);
      expect(hasMatcher2Role).to.be.true;
    });
  });

  describe('User functions', async function () {
    it('should deposit tokens', async function () {
      const { alice, market, usdt } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await expect(market.connect(alice).depositAsset(amount))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), amount, 0);
    });

    it('should deposit tokens to another account', async function () {
      const { alice, bob, market, usdt } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await expect(market.connect(alice).depositAssetTo(await bob.getAddress(), amount))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await bob.getAddress(), amount, 0);
    });

    it('should withdraw tokens with signature', async function () {
      const deadline = await ethers.provider.getBlock('latest').then((block) => (block?.timestamp ?? 0) + 60 * 60); // 1 hour later

      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      await expect(market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, 1))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), `-${amount.toString()}`, 1);
    });
  });
});

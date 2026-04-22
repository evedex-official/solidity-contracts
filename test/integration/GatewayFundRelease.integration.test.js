'use strict';

const { expect } = require('chai');
const { ethers, network } = require('hardhat');

describe('Gateway Fund Release Integration - Arbitrum Fork', function () {
  const GATEWAY_ADDRESS = '0x8D21dfEA9231Db85dCe72b8d9F18e917d833d4B1';
  const BRIDGE_ADDRESS = '0xAD3026961087eccEC0508D411bb9fb405E086B38';
  const PROXY_ADMIN_ADDRESS = '0xc2efa8cf4b2f63936538edf36821909fa95af1c7';
  const UPGRADE_EXECUTOR_ADDRESS = '0xBde8acdeE0585051E2D9B1D7b51E9eaccE6c3c46';
  const EXECUTOR_ROLE_HOLDER = '0xBeA2Bc852a160B8547273660E22F4F08C2fa9Bbb';
  const USDT_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

  let recipient;
  let executorSigner;
  let gatewayRelease, bridgeRelease;

  before(async function () {
    if (!process.env.ARBITRUM_ONE_NODE) {
      console.log('ARBITRUM_ONE_NODE not set, skipping integration tests');
      this.skip();
    }

    await network.provider.request({
      method: 'hardhat_reset',
      params: [{ forking: { jsonRpcUrl: process.env.ARBITRUM_ONE_NODE } }],
    });

    const chainId = await network.provider.request({ method: 'eth_chainId' });
    console.log(`Forked Arbitrum at chain ID: ${parseInt(chainId, 16)}`);

    [recipient] = await ethers.getSigners();

    // Impersonate the current EXECUTOR_ROLE holder
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [EXECUTOR_ROLE_HOLDER],
    });
    await network.provider.send('hardhat_setBalance', [
      EXECUTOR_ROLE_HOLDER,
      '0x56bc75e2d63100000', // 100 ETH
    ]);
    executorSigner = await ethers.getSigner(EXECUTOR_ROLE_HOLDER);
  });

  async function upgradeProxy(proxyAddress, newImplementation) {
    const proxyAdminIface = new ethers.Interface(['function upgrade(address proxy, address implementation)']);
    const upgradeCalldata = proxyAdminIface.encodeFunctionData('upgrade', [proxyAddress, newImplementation]);

    const executor = new ethers.Contract(
      UPGRADE_EXECUTOR_ADDRESS,
      ['function executeCall(address target, bytes data)'],
      executorSigner,
    );

    const tx = await executor.executeCall(PROXY_ADMIN_ADDRESS, upgradeCalldata);
    await tx.wait();
  }

  describe('Gateway USDT Release', function () {
    it('Should verify USDT is locked in Gateway', async function () {
      const usdt = await ethers.getContractAt('IERC20', USDT_ADDRESS);
      const balance = await usdt.balanceOf(GATEWAY_ADDRESS);
      console.log(`Gateway USDT balance: ${ethers.formatUnits(balance, 6)} USDT`);
      expect(balance).to.be.greaterThan(0);
    });

    it('Should deploy GatewayFundRelease implementation', async function () {
      const GatewayFundRelease = await ethers.getContractFactory('GatewayFundRelease');
      const impl = await GatewayFundRelease.deploy(recipient.address);
      await impl.waitForDeployment();
      gatewayRelease = impl;
      console.log(`GatewayFundRelease deployed at: ${await impl.getAddress()}`);
    });

    it('Should upgrade Gateway to GatewayFundRelease', async function () {
      await upgradeProxy(GATEWAY_ADDRESS, await gatewayRelease.getAddress());

      const gateway = new ethers.Contract(
        GATEWAY_ADDRESS,
        ['function authorizedRecipient() view returns (address)'],
        ethers.provider,
      );
      const auth = await gateway.authorizedRecipient();
      expect(auth).to.equal(recipient.address);
      console.log(`Gateway upgraded. authorizedRecipient: ${auth}`);
    });

    it('Should release USDT from Gateway', async function () {
      const usdt = await ethers.getContractAt('IERC20', USDT_ADDRESS);
      const gatewayBalance = await usdt.balanceOf(GATEWAY_ADDRESS);
      const recipientBalanceBefore = await usdt.balanceOf(recipient.address);

      const gateway = new ethers.Contract(
        GATEWAY_ADDRESS,
        ['function releaseFunds(address token, address to, uint256 amount)'],
        recipient,
      );

      await gateway.releaseFunds(USDT_ADDRESS, recipient.address, gatewayBalance);

      const gatewayBalanceAfter = await usdt.balanceOf(GATEWAY_ADDRESS);
      const recipientBalanceAfter = await usdt.balanceOf(recipient.address);

      expect(gatewayBalanceAfter).to.equal(0);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(gatewayBalance);
      console.log(`Released ${ethers.formatUnits(gatewayBalance, 6)} USDT from Gateway`);
    });

    it('Should reject releaseFunds to unauthorized address', async function () {
      const gateway = new ethers.Contract(
        GATEWAY_ADDRESS,
        ['function releaseFunds(address token, address to, uint256 amount)'],
        recipient,
      );

      const randomAddress = '0x000000000000000000000000000000000000dEaD';
      await expect(gateway.releaseFunds(USDT_ADDRESS, randomAddress, 1)).to.be.revertedWithCustomError(
        gatewayRelease,
        'Unauthorized',
      );
    });
  });

  describe('Bridge ETH Release', function () {
    it('Should verify ETH is locked in Bridge', async function () {
      const balance = await ethers.provider.getBalance(BRIDGE_ADDRESS);
      console.log(`Bridge ETH balance: ${ethers.formatEther(balance)} ETH`);
      expect(balance).to.be.greaterThan(0);
    });

    it('Should deploy GatewayFundRelease for Bridge', async function () {
      const GatewayFundRelease = await ethers.getContractFactory('GatewayFundRelease');
      const impl = await GatewayFundRelease.deploy(recipient.address);
      await impl.waitForDeployment();
      bridgeRelease = impl;
      console.log(`BridgeFundRelease deployed at: ${await impl.getAddress()}`);
    });

    it('Should upgrade Bridge to GatewayFundRelease', async function () {
      await upgradeProxy(BRIDGE_ADDRESS, await bridgeRelease.getAddress());

      const bridge = new ethers.Contract(
        BRIDGE_ADDRESS,
        ['function authorizedRecipient() view returns (address)'],
        ethers.provider,
      );
      const auth = await bridge.authorizedRecipient();
      expect(auth).to.equal(recipient.address);
      console.log(`Bridge upgraded. authorizedRecipient: ${auth}`);
    });

    it('Should release ETH from Bridge', async function () {
      const bridgeBalance = await ethers.provider.getBalance(BRIDGE_ADDRESS);
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      const bridge = new ethers.Contract(
        BRIDGE_ADDRESS,
        ['function releaseETH(address to, uint256 amount)'],
        recipient,
      );

      const tx = await bridge.releaseETH(recipient.address, bridgeBalance);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const bridgeBalanceAfter = await ethers.provider.getBalance(BRIDGE_ADDRESS);
      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);

      expect(bridgeBalanceAfter).to.equal(0);
      expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + bridgeBalance - gasCost);
      console.log(`Released ${ethers.formatEther(bridgeBalance)} ETH from Bridge`);
    });

    it('Should reject releaseETH to unauthorized address', async function () {
      const bridge = new ethers.Contract(
        BRIDGE_ADDRESS,
        ['function releaseETH(address to, uint256 amount)'],
        recipient,
      );

      const randomAddress = '0x000000000000000000000000000000000000dEaD';
      await expect(bridge.releaseETH(randomAddress, 1)).to.be.revertedWithCustomError(bridgeRelease, 'Unauthorized');
    });
  });
});

const { strictEqual } = require('assert');

const ProxyModule = require('../ignition/modules/ProxyModule');
const UpgradeModule = require('../ignition/modules/UpgradeModule');

describe('Demo Proxy', function () {
  describe('Proxy interaction', async function () {
    it('Should be interactable via proxy', async function () {
      const [owner, otherAccount] = await ethers.getSigners();

      const { demo } = await ignition.deploy(ProxyModule);

      strictEqual(await demo.connect(otherAccount).version(), '1.0.0');
      strictEqual(await demo.connect(otherAccount).value(), 5n);
    });
  });

  describe('Upgrading', function () {
    let demo;
    before(async function () {
      const res = await ignition.deploy(UpgradeModule);
      demo = res.demo;
    });

    it('Should have upgraded the proxy to DemoV2', async function () {
      const [owner, otherAccount] = await ethers.getSigners();

      strictEqual(await demo.connect(otherAccount).version(), '2.0.0');
      strictEqual(await demo.connect(otherAccount).value(), 5n);
    });

    it('Should expand set method', async function () {
      const [owner, otherAccount] = await ethers.getSigners();

      await demo.connect(owner).set(6);
      strictEqual(await demo.connect(otherAccount).value(), 6n);
    });
  });
});

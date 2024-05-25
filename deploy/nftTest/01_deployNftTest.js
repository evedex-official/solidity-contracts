const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  await deployer.deployProxy('contracts/NFT/ERC721TEST.sol:TestNFT', {
    name: 'TestGoblin',
    args: [
      '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
      'https://badges.eh-dev.app/metadata/goblin/'
    ],
  });

  await deployer.deployProxy('contracts/NFT/ERC721TEST.sol:TestNFT', {
    name: 'TestDegen',
    args: [
      '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
      'https://badges.eh-dev.app/metadata/degen/'
    ],
  });

  await deployer.deployProxy('contracts/NFT/ERC721TEST.sol:TestNFT', {
    name: 'TestBase64',
    args: [
      '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
      'https://badges.eh-dev.app/metadata/base64/'
    ],
  });

  await deployer.deployProxy('contracts/NFT/ERC721TEST.sol:TestNFT', {
    name: 'TestEvent',
    args: [
      '0xFa02EDF9ebA53Ae811650e409A1da2E6103CDB54',
      'https://badges.eh-dev.app/metadata/7a91de_friends_20/'
    ],
  });
});

module.exports.tags = ['Upgradable'];

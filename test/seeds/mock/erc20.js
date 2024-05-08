const { ethers } = require('hardhat');

module.exports = async () => {
  const ERC20 = await ethers.getContractFactory('contracts/mock/ERC20Mock.sol:ERC20Mock');
  const erc20 = await ERC20.deploy();

  return [ erc20 ];
};

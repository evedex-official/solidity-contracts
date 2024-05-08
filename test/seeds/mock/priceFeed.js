const { ethers } = require('hardhat');

module.exports = async (options = {}) => {
  const PriceFeed = await ethers.getContractFactory('contracts/mock/PriceFeedMock.sol:PriceFeedMock');
  const priceFeed = await PriceFeed.deploy(options.decimals ?? 8);

  return [priceFeed];
};

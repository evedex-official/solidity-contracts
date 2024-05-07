const { hardhat } = require('hardhat');
const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

const governorModule = buildModule('GovernorModule', (m) => {
  const owners = m.getParameter('owners', []);
  if (owners.length === 0) throw new Error('Invalid owners count');
  const howManyOwnersDecide = m.getParameter('decisiveOwners');
  if (howManyOwnersDecide > owners.length) {
    throw new Error('Decisive owners number must be less than all owners');
  }
  if (howManyOwnersDecide <= 0) {
    throw new Error('Decisive owners number must be positive');
  }

  const multisig = m.contract('GovernorMultisig');
  m.call(multisig, 'transferOwnershipWithHowMany', [owners, howManyOwnersDecide]);

  return { multisig };
});

module.exports = governorModule;

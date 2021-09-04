import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { ethers } from 'hardhat';
import { SimpleModule, ZoraProposalManager } from '../typechain';
import { Signer } from 'ethers';
import {
  cancelModule,
  deploySimpleModule,
  deployZoraProposalManager,
  proposeModule,
  registerModule,
  revert,
} from './utils';

chai.use(asPromised);

describe('ZoraProposalManager', () => {
  let manager: ZoraProposalManager;
  let module: SimpleModule;
  let deployer: Signer;
  let registrar: Signer;
  let otherUser: Signer;

  beforeEach(async () => {
    const signers = await ethers.getSigners();

    deployer = signers[0];
    registrar = signers[1];
    otherUser = signers[2];

    manager = await deployZoraProposalManager(await registrar.getAddress());
    module = await deploySimpleModule();
  });

  describe('#isPassedProposal', () => {
    let pendingAddr: string;
    let passedAddr: string;
    let failedAddr: string;

    beforeEach(async () => {
      const passed = await deploySimpleModule();
      const failed = await deploySimpleModule();

      await proposeModule(manager, module.address);

      await proposeModule(manager, passed.address);
      await registerModule(manager.connect(registrar), 2);

      await proposeModule(manager, failed.address);
      await cancelModule(manager.connect(registrar), 3);

      pendingAddr = module.address;
      passedAddr = passed.address;
      failedAddr = failed.address;
    });

    it('should return true if the proposal has passed', async () => {
      expect(await manager.isPassedProposal(passedAddr)).to.eq(true);
    });

    it('should return false if the proposal is pending', async () => {
      expect(await manager.isPassedProposal(pendingAddr)).to.eq(false);
    });

    it('should return false if the proposal failed', async () => {
      expect(await manager.isPassedProposal(failedAddr)).to.eq(false);
    });
  });

  describe('#proposeModule', () => {
    it('should create a proposal', async () => {
      await proposeModule(manager, module.address);

      const proposal = await manager.proposalIDToProposal(1);

      expect(proposal.implementationAddress).to.eq(module.address);
      expect(proposal.status).to.eq(0);
      expect(proposal.proposer).to.eq(await deployer.getAddress());
      expect(
        (
          await manager.proposalImplementationToProposalID(module.address)
        ).toNumber()
      ).to.eq(1);
    });

    it('should revert if the module has already been proposed', async () => {
      await proposeModule(manager, module.address);

      await expect(
        proposeModule(manager, module.address)
      ).eventually.rejectedWith(
        revert`ZPM::proposeModule proposal already exists`
      );
    });

    it('should revert if the implementation address is 0x0', async () => {
      await expect(
        proposeModule(manager, ethers.constants.AddressZero)
      ).eventually.rejectedWith(
        revert`ZPM::proposeModule proposed contract cannot be zero address`
      );
    });
  });

  describe('#registerModule', () => {
    beforeEach(async () => {
      await proposeModule(manager, module.address);
    });

    it('should register a module', async () => {
      await registerModule(manager.connect(registrar), 1);

      const proposal = await manager.proposalIDToProposal(1);

      expect(proposal.status).to.eq(1);
    });

    it('should revert if not called by the registrar', async () => {
      await expect(registerModule(manager, 1)).eventually.rejectedWith(
        revert`onlyRegistrar`
      );
    });

    it('should revert if the proposal does not exist', async () => {
      await expect(
        registerModule(manager.connect(registrar), 1133321)
      ).eventually.rejectedWith(
        revert`ZPM::registerModule proposal does not exist`
      );
    });

    it('should revert if the proposal has already passed', async () => {
      await registerModule(manager.connect(registrar), 1);

      await expect(
        registerModule(manager.connect(registrar), 1)
      ).eventually.rejectedWith(
        revert`ZPM::registerModule can only register pending proposals`
      );
    });

    it('should revert if the proposal has already failed', async () => {
      await cancelModule(manager.connect(registrar), 1);

      await expect(
        registerModule(manager.connect(registrar), 1)
      ).eventually.rejectedWith(
        revert`ZPM::registerModule can only register pending proposals`
      );
    });
  });

  describe('#cancelProposal', async () => {
    beforeEach(async () => {
      await proposeModule(manager, module.address);
    });

    it('should cancel a proposal', async () => {
      await cancelModule(manager.connect(registrar), 1);

      const proposal = await manager.proposalIDToProposal(1);

      await expect(proposal.status).to.eq(2);
    });

    it('should revert if not called by the registrar', async () => {
      await expect(
        cancelModule(manager.connect(otherUser), 1)
      ).eventually.rejectedWith(revert`onlyRegistrar`);
    });

    it('should revert if the proposal does not exist', async () => {
      await expect(
        cancelModule(manager.connect(registrar), 111)
      ).eventually.rejectedWith(
        revert`ZPM::cancelProposal proposal does not exist`
      );
    });
    it('should revert if the proposal has already been approved', async () => {
      await registerModule(manager.connect(registrar), 1);

      await expect(
        cancelModule(manager.connect(registrar), 1)
      ).eventually.rejectedWith(
        'ZPM::cancelProposal can only cancel pending proposals'
      );
    });

    it('should revert if the proposal has already been cancelled', async () => {
      await cancelModule(manager.connect(registrar), 1);

      await expect(
        cancelModule(manager.connect(registrar), 1)
      ).eventually.rejectedWith(
        'ZPM::cancelProposal can only cancel pending proposals'
      );
    });
  });

  describe('#setRegistrar', async () => {
    it('should set the registrar', async () => {
      await manager
        .connect(registrar)
        .setRegistrar(await otherUser.getAddress());

      expect(await manager.registrar()).to.eq(await otherUser.getAddress());
    });

    it('should revert if not called by the registrar', async () => {
      await expect(
        manager.setRegistrar(await otherUser.getAddress())
      ).eventually.rejectedWith(revert`onlyRegistrar`);
    });

    it('should revert if attempting to set the registrar to the zero address', async () => {
      await expect(
        manager.connect(registrar).setRegistrar(ethers.constants.AddressZero)
      ).eventually.rejectedWith(
        revert`ZPM::setRegistrar must set registrar to non-zero address`
      );
    });
  });
});
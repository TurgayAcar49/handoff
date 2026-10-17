// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Handoff} from "../contracts/Handoff.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

contract EighteenDecimals {
    function decimals() external pure returns (uint8) {
        return 18;
    }
}

/// @dev Reports a full transfer, then keeps 1 unit. Handoff must revert.
contract ShortUSDC {
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}

/// @dev On transferFrom, tries to refund job 1 while another fund is in progress.
contract EvilUSDC {
    uint8 public decimals = 6;
    Handoff public desk;
    bool public armed;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function setDesk(address next) external {
        desk = Handoff(payable(next));
    }

    function arm() external {
        armed = true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        if (armed && address(desk) != address(0)) {
            try desk.refund(1) {} catch {}
        }
        return true;
    }
}

contract HandoffTest is Test {
    MockUSDC internal usdc;
    Handoff internal desk;

    address internal client = makeAddr("client");
    address internal payee = makeAddr("payee");
    address internal agent = makeAddr("agent");
    address internal arbitrator = makeAddr("arbitrator");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT = 25e6;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        desk = new Handoff(address(usdc));
        usdc.mint(client, 100e6);
        vm.prank(client);
        usdc.approve(address(desk), type(uint256).max);
    }

    function _fund() internal returns (uint256 id) {
        vm.prank(client);
        id = desk.createAndFund(payee, address(0), address(0), AMOUNT, 0, 1 hours, "Homepage");
    }

    function _deliver(uint256 id) internal {
        vm.prank(payee);
        desk.deliver(id, "https://example.com/file");
    }

    function test_constants() public view {
        assertEq(desk.MIN_REVIEW_WINDOW(), 60);
        assertEq(desk.MAX_REVIEW_WINDOW(), 90 days);
        assertEq(desk.MAX_DEADLINE_HORIZON(), 365 days);
        assertEq(desk.MAX_TITLE_BYTES(), 80);
        assertEq(desk.MAX_PROOF_BYTES(), 200);
        assertEq(desk.ARC_USDC(), 0x3600000000000000000000000000000000000000);
    }

    function test_fundLocksExactUsdc() public {
        uint256 id = _fund();
        Handoff.Job memory job = desk.getJob(id);
        assertEq(uint256(job.status), uint256(Handoff.Status.Funded));
        assertEq(job.client, client);
        assertEq(job.payee, payee);
        assertEq(job.amount, AMOUNT);
        assertEq(usdc.balanceOf(address(desk)), AMOUNT);
        assertEq(usdc.balanceOf(client), 75e6);
        assertEq(desk.nextId(), 2);
    }

    function test_releasePaysPayee() public {
        uint256 id = _fund();
        _deliver(id);
        vm.prank(client);
        desk.release(id);
        assertEq(uint256(desk.getJob(id).status), uint256(Handoff.Status.Released));
        assertEq(usdc.balanceOf(payee), AMOUNT);
        assertEq(usdc.balanceOf(address(desk)), 0);
    }

    function test_claimAfterWindow() public {
        uint256 id = _fund();
        _deliver(id);
        vm.prank(payee);
        vm.expectRevert(Handoff.TooEarly.selector);
        desk.claim(id);

        uint64 opens = desk.claimOpensAt(id);
        vm.warp(opens);
        vm.prank(payee);
        desk.claim(id);
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function test_disputeAndClaimDoNotOverlap() public {
        vm.prank(client);
        uint256 id = desk.createAndFund(payee, address(0), arbitrator, AMOUNT, 0, 1 hours, "Overlap");
        _deliver(id);
        uint64 opens = desk.claimOpensAt(id);

        vm.warp(opens - 1);
        vm.prank(payee);
        vm.expectRevert(Handoff.TooEarly.selector);
        desk.claim(id);

        vm.warp(opens);
        vm.prank(client);
        vm.expectRevert(Handoff.TooLate.selector);
        desk.dispute(id);
        vm.prank(payee);
        desk.claim(id);
    }

    function test_refundBeforeDelivery() public {
        uint256 id = _fund();
        vm.prank(client);
        desk.refund(id);
        assertEq(uint256(desk.getJob(id).status), uint256(Handoff.Status.Refunded));
        assertEq(usdc.balanceOf(client), 100e6);
        assertEq(usdc.balanceOf(address(desk)), 0);
    }

    function test_noRefundAfterDelivery() public {
        uint256 id = _fund();
        _deliver(id);
        vm.prank(client);
        vm.expectRevert(Handoff.BadStatus.selector);
        desk.refund(id);
    }

    function test_deadlineBlocksDeliveryAndClientCanRefund() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(client);
        uint256 id = desk.createAndFund(payee, address(0), address(0), AMOUNT, deadline, 1 hours, "Due");
        vm.warp(deadline + 1);
        vm.prank(payee);
        vm.expectRevert(Handoff.TooLate.selector);
        desk.deliver(id, "late");
        vm.prank(client);
        desk.refund(id);
        assertEq(usdc.balanceOf(client), 100e6);
    }

    function test_agentReleasesDeliveredJobButNotDispute() public {
        vm.prank(client);
        uint256 id = desk.createAndFund(payee, agent, arbitrator, AMOUNT, 0, 1 hours, "Agent");
        _deliver(id);

        vm.prank(stranger);
        vm.expectRevert(Handoff.NotReleaser.selector);
        desk.release(id);

        vm.prank(payee);
        vm.expectRevert(Handoff.NotReleaser.selector);
        desk.release(id);

        vm.prank(client);
        desk.dispute(id);

        vm.prank(agent);
        vm.expectRevert(Handoff.NotClient.selector);
        desk.release(id);

        vm.prank(client);
        desk.release(id);
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function test_agentCanReleaseWhenDelivered() public {
        vm.prank(client);
        uint256 id = desk.createAndFund(payee, agent, address(0), AMOUNT, 0, 1 hours, "Bot");
        _deliver(id);
        vm.prank(agent);
        desk.release(id);
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function test_noDisputeWithoutArbitrator() public {
        uint256 id = _fund();
        _deliver(id);
        vm.prank(client);
        vm.expectRevert(Handoff.NotArbitrator.selector);
        desk.dispute(id);
    }

    function test_payeeCanAcceptRefund() public {
        vm.prank(client);
        uint256 id = desk.createAndFund(payee, address(0), arbitrator, AMOUNT, 0, 1 hours, "Sorry");
        _deliver(id);
        vm.prank(client);
        desk.dispute(id);
        vm.prank(payee);
        desk.acceptRefund(id);
        assertEq(usdc.balanceOf(client), 100e6);
        assertEq(uint256(desk.getJob(id).status), uint256(Handoff.Status.Refunded));
    }

    function test_arbitratorResolvesBothWays() public {
        vm.prank(client);
        uint256 first = desk.createAndFund(payee, address(0), arbitrator, 10e6, 0, 1 hours, "One");
        vm.prank(client);
        uint256 second = desk.createAndFund(payee, address(0), arbitrator, 15e6, 0, 1 hours, "Two");
        _deliver(first);
        _deliver(second);
        vm.prank(client);
        desk.dispute(first);
        vm.prank(client);
        desk.dispute(second);

        vm.prank(stranger);
        vm.expectRevert(Handoff.NotArbitrator.selector);
        desk.resolve(first, true);

        vm.prank(arbitrator);
        desk.resolve(first, true);
        vm.prank(arbitrator);
        desk.resolve(second, false);

        assertEq(usdc.balanceOf(payee), 10e6);
        assertEq(usdc.balanceOf(client), 90e6);
        assertEq(usdc.balanceOf(address(desk)), 0);
    }

    function test_rejectsBadInputs() public {
        vm.startPrank(client);
        vm.expectRevert(Handoff.BadAmount.selector);
        desk.createAndFund(payee, address(0), address(0), 0, 0, 1 hours, "X");

        vm.expectRevert(Handoff.BadPayee.selector);
        desk.createAndFund(client, address(0), address(0), AMOUNT, 0, 1 hours, "X");

        vm.expectRevert(Handoff.BadPayee.selector);
        desk.createAndFund(address(0), address(0), address(0), AMOUNT, 0, 1 hours, "X");

        vm.expectRevert(Handoff.BadReleaser.selector);
        desk.createAndFund(payee, payee, address(0), AMOUNT, 0, 1 hours, "X");

        vm.expectRevert(Handoff.BadArbitrator.selector);
        desk.createAndFund(payee, address(0), client, AMOUNT, 0, 1 hours, "X");

        vm.expectRevert(Handoff.BadWindow.selector);
        desk.createAndFund(payee, address(0), address(0), AMOUNT, 0, 59, "X");

        vm.expectRevert(Handoff.BadTitle.selector);
        desk.createAndFund(payee, address(0), address(0), AMOUNT, 0, 1 hours, "");

        vm.expectRevert(Handoff.BadDeadline.selector);
        desk.createAndFund(payee, address(0), address(0), AMOUNT, uint64(block.timestamp), 1 hours, "X");
        vm.stopPrank();
    }

    function test_minimumWindowIsAccepted() public {
        vm.prank(client);
        uint256 id = desk.createAndFund(payee, address(0), address(0), AMOUNT, 0, 60, "Short");
        assertEq(desk.getJob(id).reviewWindow, 60);
    }

    function test_unknownJob() public {
        vm.expectRevert(Handoff.UnknownJob.selector);
        desk.getJob(0);
        vm.expectRevert(Handoff.UnknownJob.selector);
        desk.getJob(1);
    }

    function test_secondReleaseReverts() public {
        uint256 id = _fund();
        _deliver(id);
        vm.prank(client);
        desk.release(id);
        vm.prank(client);
        vm.expectRevert(Handoff.BadStatus.selector);
        desk.release(id);
    }

    function test_rejectsNativeValue() public {
        vm.deal(address(this), 1 ether);
        (bool ok, bytes memory data) = address(desk).call{value: 1}("");
        assertFalse(ok);
        assertEq(bytes4(data), Handoff.NoNative.selector);
    }

    function test_arcChainRejectsNonCanonicalToken() public {
        vm.chainId(5042);
        vm.expectRevert(Handoff.BadToken.selector);
        new Handoff(address(usdc));

        vm.chainId(5042002);
        vm.expectRevert(Handoff.BadToken.selector);
        new Handoff(address(usdc));
    }

    function test_rejectsWrongDecimals() public {
        EighteenDecimals odd = new EighteenDecimals();
        vm.expectRevert(Handoff.BadDecimals.selector);
        new Handoff(address(odd));
    }

    function test_rejectsZeroToken() public {
        vm.expectRevert(Handoff.ZeroAddress.selector);
        new Handoff(address(0));
    }

    function test_shortfallTransferReverts() public {
        ShortUSDC shortUsdc = new ShortUSDC();
        Handoff shortDesk = new Handoff(address(shortUsdc));
        shortUsdc.mint(client, AMOUNT);
        vm.startPrank(client);
        shortUsdc.approve(address(shortDesk), AMOUNT);
        vm.expectRevert(Handoff.TransferFailed.selector);
        shortDesk.createAndFund(payee, address(0), address(0), AMOUNT, 0, 1 hours, "Short");
        vm.stopPrank();
        assertEq(shortUsdc.balanceOf(client), AMOUNT);
        assertEq(shortDesk.nextId(), 1);
    }

    function test_reentrancyCannotRefundAnotherJob() public {
        EvilUSDC evil = new EvilUSDC();
        Handoff evilDesk = new Handoff(address(evil));
        evil.setDesk(address(evilDesk));
        evil.mint(client, 100e6);
        vm.startPrank(client);
        evil.approve(address(evilDesk), type(uint256).max);
        evilDesk.createAndFund(payee, address(0), address(0), 10e6, 0, 1 hours, "One");
        evil.arm();
        evilDesk.createAndFund(payee, address(0), address(0), 10e6, 0, 1 hours, "Two");
        vm.stopPrank();

        assertEq(uint256(evilDesk.getJob(1).status), uint256(Handoff.Status.Funded));
        assertEq(uint256(evilDesk.getJob(2).status), uint256(Handoff.Status.Funded));
        assertEq(evil.balanceOf(address(evilDesk)), 20e6);
        assertEq(evil.balanceOf(client), 80e6);
    }

    function test_claimOpensAtIsZeroBeforeDelivery() public {
        uint256 id = _fund();
        assertEq(desk.claimOpensAt(id), 0);
    }

    function test_longTitleReverts() public {
        string memory huge = new string(81);
        vm.prank(client);
        vm.expectRevert(Handoff.BadTitle.selector);
        desk.createAndFund(payee, address(0), address(0), AMOUNT, 0, 1 hours, huge);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Handoff
/// @notice A USDC job ticket. The client locks the fee, the payee delivers, and
///         the fee is released to the payee — by the client, by a named agent,
///         or by the payee once the review window has closed.
/// @dev Use the Arc USDC ERC-20 interface (6 decimals). Do not send native USDC:
///      on Arc the native balance is the same asset at 18 decimals, and this
///      contract rejects plain value transfers. Arc also reverts value transfers
///      to the zero address; this contract never sends tokens there.
interface IERC20 {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract Handoff {
    enum Status {
        None,
        Funded,
        Delivered,
        Disputed,
        Released,
        Refunded
    }

    struct Job {
        address client;
        address payee;
        address releaser;
        address arbitrator;
        uint256 amount;
        uint64 deadline;
        uint64 reviewWindow;
        uint64 fundedAt;
        uint64 deliveredAt;
        Status status;
        string title;
        string proof;
    }

    /// @notice Canonical Arc USDC ERC-20 interface. Same address on mainnet and testnet.
    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    uint256 public constant MIN_REVIEW_WINDOW = 60;
    uint256 public constant MAX_REVIEW_WINDOW = 90 days;
    uint256 public constant MAX_DEADLINE_HORIZON = 365 days;
    uint256 public constant MAX_TITLE_BYTES = 80;
    uint256 public constant MAX_PROOF_BYTES = 200;

    IERC20 public immutable usdc;

    uint256 public nextId = 1;
    mapping(uint256 => Job) private _jobs;
    uint256 private _entered;

    error ZeroAddress();
    error BadToken();
    error BadDecimals();
    error BadAmount();
    error BadPayee();
    error BadReleaser();
    error BadArbitrator();
    error BadWindow();
    error BadDeadline();
    error BadTitle();
    error BadProof();
    error UnknownJob();
    error BadStatus();
    error NotClient();
    error NotPayee();
    error NotReleaser();
    error NotArbitrator();
    error TooEarly();
    error TooLate();
    error TransferFailed();
    error NoNative();
    error Reentered();

    event JobFunded(
        uint256 indexed id,
        address indexed client,
        address indexed payee,
        address releaser,
        address arbitrator,
        uint256 amount,
        uint64 deadline,
        uint64 reviewWindow,
        string title
    );
    event JobDelivered(uint256 indexed id, string proof);
    event JobDisputed(uint256 indexed id);
    event JobReleased(uint256 indexed id, address indexed by, uint256 amount);
    event JobRefunded(uint256 indexed id, address indexed by, uint256 amount);

    /// @param usdc_ Arc USDC on chain id 5042 and 5042002. Any 6-decimal token elsewhere (tests).
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if ((block.chainid == 5042 || block.chainid == 5042002) && usdc_ != ARC_USDC) revert BadToken();
        usdc = IERC20(usdc_);
        if (usdc.decimals() != 6) revert BadDecimals();
    }

    /// @dev Native USDC uses 18 decimals and is a different calling convention.
    receive() external payable {
        revert NoNative();
    }

    /// @notice Lock `amount` of USDC (6 decimals) and open a job.
    /// @param releaser Wallet that may release a delivered job early. Address 0 keeps that with the client.
    /// @param arbitrator Wallet that may settle a dispute. Address 0 disables disputes, so funds cannot sit in dispute.
    /// @param deadline Unix time after which delivery is refused. 0 means no deadline. The client can refund until delivery.
    /// @param reviewWindow Seconds after delivery before the payee may claim. From 60 seconds to 90 days.
    function createAndFund(
        address payee,
        address releaser,
        address arbitrator,
        uint256 amount,
        uint64 deadline,
        uint64 reviewWindow,
        string calldata title
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert BadAmount();
        if (payee == address(0) || payee == msg.sender) revert BadPayee();
        if (releaser == payee) revert BadReleaser();
        if (arbitrator != address(0) && (arbitrator == msg.sender || arbitrator == payee)) revert BadArbitrator();
        if (reviewWindow < MIN_REVIEW_WINDOW || reviewWindow > MAX_REVIEW_WINDOW) revert BadWindow();
        if (deadline != 0) {
            if (deadline <= block.timestamp) revert BadDeadline();
            if (deadline > block.timestamp + MAX_DEADLINE_HORIZON) revert BadDeadline();
        }
        uint256 titleBytes = bytes(title).length;
        if (titleBytes == 0 || titleBytes > MAX_TITLE_BYTES) revert BadTitle();

        uint256 beforeBal = usdc.balanceOf(address(this));
        _pull(msg.sender, amount);
        if (usdc.balanceOf(address(this)) != beforeBal + amount) revert TransferFailed();

        id = nextId++;
        Job storage job = _jobs[id];
        job.client = msg.sender;
        job.payee = payee;
        job.releaser = releaser;
        job.arbitrator = arbitrator;
        job.amount = amount;
        job.deadline = deadline;
        job.reviewWindow = reviewWindow;
        job.fundedAt = uint64(block.timestamp);
        job.status = Status.Funded;
        job.title = title;

        emit JobFunded(id, msg.sender, payee, releaser, arbitrator, amount, deadline, reviewWindow, title);
    }

    /// @notice Payee marks the job delivered. Starts the review window.
    function deliver(uint256 id, string calldata proof) external nonReentrant {
        Job storage job = _job(id);
        if (msg.sender != job.payee) revert NotPayee();
        if (job.status != Status.Funded) revert BadStatus();
        if (job.deadline != 0 && block.timestamp > job.deadline) revert TooLate();
        uint256 proofBytes = bytes(proof).length;
        if (proofBytes == 0 || proofBytes > MAX_PROOF_BYTES) revert BadProof();

        job.status = Status.Delivered;
        job.deliveredAt = uint64(block.timestamp);
        job.proof = proof;
        emit JobDelivered(id, proof);
    }

    /// @notice Pay the payee. The client can always do this once the job is delivered or disputed.
    ///         A named agent can do it only while the job is delivered, not during a dispute.
    function release(uint256 id) external nonReentrant {
        Job storage job = _job(id);
        Status status = job.status;
        if (status != Status.Delivered && status != Status.Disputed) revert BadStatus();

        bool isClient = msg.sender == job.client;
        if (status == Status.Disputed) {
            if (!isClient) revert NotClient();
        } else if (!isClient && !(job.releaser != address(0) && msg.sender == job.releaser)) {
            revert NotReleaser();
        }

        _pay(job, id, job.payee, Status.Released, true);
    }

    /// @notice Payee collects after the review window. A dispute cancels this path.
    function claim(uint256 id) external nonReentrant {
        Job storage job = _job(id);
        if (msg.sender != job.payee) revert NotPayee();
        if (job.status != Status.Delivered) revert BadStatus();
        if (block.timestamp < uint256(job.deliveredAt) + uint256(job.reviewWindow)) revert TooEarly();
        _pay(job, id, job.payee, Status.Released, true);
    }

    /// @notice Client takes the USDC back. Only before delivery.
    function refund(uint256 id) external nonReentrant {
        Job storage job = _job(id);
        if (msg.sender != job.client) revert NotClient();
        if (job.status != Status.Funded) revert BadStatus();
        _pay(job, id, job.client, Status.Refunded, false);
    }

    /// @notice Client freezes the review clock. Requires an arbitrator, so the ticket can still be settled.
    function dispute(uint256 id) external nonReentrant {
        Job storage job = _job(id);
        if (job.arbitrator == address(0)) revert NotArbitrator();
        if (msg.sender != job.client) revert NotClient();
        if (job.status != Status.Delivered) revert BadStatus();
        if (block.timestamp >= uint256(job.deliveredAt) + uint256(job.reviewWindow)) revert TooLate();
        job.status = Status.Disputed;
        emit JobDisputed(id);
    }

    /// @notice Payee agrees to return the USDC while a dispute is open.
    function acceptRefund(uint256 id) external nonReentrant {
        Job storage job = _job(id);
        if (msg.sender != job.payee) revert NotPayee();
        if (job.status != Status.Disputed) revert BadStatus();
        _pay(job, id, job.client, Status.Refunded, false);
    }

    /// @notice Arbitrator sends the locked USDC either to the payee or back to the client.
    function resolve(uint256 id, bool toPayee) external nonReentrant {
        Job storage job = _job(id);
        if (job.arbitrator == address(0) || msg.sender != job.arbitrator) revert NotArbitrator();
        if (job.status != Status.Disputed) revert BadStatus();
        if (toPayee) _pay(job, id, job.payee, Status.Released, true);
        else _pay(job, id, job.client, Status.Refunded, false);
    }

    function getJob(uint256 id) external view returns (Job memory) {
        return _job(id);
    }

    /// @notice Unix time when the payee may claim. 0 if the job has not been delivered.
    function claimOpensAt(uint256 id) external view returns (uint64) {
        Job storage job = _job(id);
        if (job.deliveredAt == 0) return 0;
        return job.deliveredAt + job.reviewWindow;
    }

    function _pay(Job storage job, uint256 id, address to, Status next, bool asRelease) internal {
        uint256 amount = job.amount;
        job.status = next;
        _push(to, amount);
        if (asRelease) emit JobReleased(id, msg.sender, amount);
        else emit JobRefunded(id, msg.sender, amount);
    }

    function _job(uint256 id) internal view returns (Job storage job) {
        if (id == 0 || id >= nextId) revert UnknownJob();
        job = _jobs[id];
    }

    function _pull(address from, uint256 amount) internal {
        bool ok = usdc.transferFrom(from, address(this), amount);
        if (!ok) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 beforeBal = usdc.balanceOf(address(this));
        bool ok = usdc.transfer(to, amount);
        if (!ok || usdc.balanceOf(address(this)) != beforeBal - amount) revert TransferFailed();
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentered();
        _entered = 1;
        _;
        _entered = 0;
    }
}

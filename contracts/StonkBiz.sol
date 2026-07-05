// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
    StonkBiz — Base L2
    ---------------------------------------------------------
    Design goals: minimal bytecode, minimal storage writes, no
    external library imports (nothing to npm-install/verify).

    Cost-efficiency choices:
      - Custom trimmed ERC721 (no Enumerable, no per-token URI storage)
      - Sequential tokenIds, single owner-mapping write per mint
      - Traits & rarity are NOT stored on-chain per token. They are
        derived deterministically (pure function) from tokenId, so
        mint costs nothing extra no matter how many trait categories
        you have. Your off-chain metadata generator/reveal script
        should call getTraits(tokenId) (or replicate the same
        formula) to produce the matching JSON for IPFS.

    Traits (3 categories, small + simple):
      Background: Grey 35% / Blue 25% / Green 15% / Gold 12% / Red 8% / Rainbow 5%
      Body: Common 40% / Uncommon 25% / Rare 18% / Epic 12% / Legendary 5%
      Accessory: None 45% / Tie 25% / Glasses 15% / Chain 10% / Crown 5%
*/

contract StonkBiz {
    /*//////////////////////////////////////////////////////////
                              METADATA
    //////////////////////////////////////////////////////////*/
    string public constant name = "StonkBiz";
    string public constant symbol = "STONK";

    uint256 public constant MAX_SUPPLY = 3444;
    uint256 public constant MAX_PER_TX = 10;

    uint256 public mintPrice = 0.0015 ether;
    bool public mintActive;
    string public baseURI;

    uint256 public totalSupply;

    bytes32 public merkleRoot;
    bool public allowlistActive;
    mapping(address => bool) public allowlistClaimed;

    address public owner;

    /*//////////////////////////////////////////////////////////
                          ERC721 STORAGE
    //////////////////////////////////////////////////////////*/
    mapping(uint256 => address) internal _ownerOf;
    mapping(address => uint256) internal _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed id);
    event Approval(address indexed owner_, address indexed spender, uint256 indexed id);
    event ApprovalForAll(address indexed owner_, address indexed operator, bool approved);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /*//////////////////////////////////////////////////////////
                              MINTING
    //////////////////////////////////////////////////////////*/
    function mint(uint256 qty) external payable {
        require(mintActive, "mint not live");
        require(qty > 0 && qty <= MAX_PER_TX, "bad qty");
        require(totalSupply + qty <= MAX_SUPPLY, "sold out");
        require(msg.value >= mintPrice * qty, "insufficient ETH");

        uint256 start = totalSupply;
        for (uint256 i = 0; i < qty; ) {
            _mint(msg.sender, start + i);
            unchecked { ++i; }
        }
        totalSupply = start + qty;
    }

    function allowlistMint(bytes32[] calldata proof) external {
        require(allowlistActive, "allowlist not live");
        require(!allowlistClaimed[msg.sender], "already claimed");
        require(totalSupply + 1 <= MAX_SUPPLY, "sold out");
        require(_verify(proof, keccak256(abi.encodePacked(msg.sender))), "invalid proof");

        allowlistClaimed[msg.sender] = true;
        _mint(msg.sender, totalSupply);
        totalSupply += 1;
    }

    function ownerMint(address to, uint256 qty) external onlyOwner {
        require(totalSupply + qty <= MAX_SUPPLY, "sold out");
        uint256 start = totalSupply;
        for (uint256 i = 0; i < qty; ) {
            _mint(to, start + i);
            unchecked { ++i; }
        }
        totalSupply = start + qty;
    }

    function _mint(address to, uint256 id) internal {
        require(to != address(0), "mint to zero");
        require(_ownerOf[id] == address(0), "already minted");

        _ownerOf[id] = to;
        unchecked { _balanceOf[to]++; }

        emit Transfer(address(0), to, id);
    }

    /*//////////////////////////////////////////////////////////
                        ADMIN / CONFIG
    //////////////////////////////////////////////////////////*/
    function setMintActive(bool v) external onlyOwner { mintActive = v; }
    function setMintPrice(uint256 p) external onlyOwner { mintPrice = p; }
    function setBaseURI(string calldata uri) external onlyOwner { baseURI = uri; }
    function setAllowlistActive(bool v) external onlyOwner { allowlistActive = v; }
    function setMerkleRoot(bytes32 root) external onlyOwner { merkleRoot = root; }

    function withdraw() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero addr");
        owner = newOwner;
    }

    /*//////////////////////////////////////////////////////////
                          MERKLE PROOF
    //////////////////////////////////////////////////////////*/
    function _verify(bytes32[] calldata proof, bytes32 leaf) internal view returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            computedHash = computedHash <= proofElement
                ? keccak256(abi.encodePacked(computedHash, proofElement))
                : keccak256(abi.encodePacked(proofElement, computedHash));
        }
        return computedHash == merkleRoot;
    }

    /*//////////////////////////////////////////////////////////
                         TRAITS & RARITY
    //////////////////////////////////////////////////////////*/
    uint8[6] internal BG_WEIGHTS = [35, 25, 15, 12, 8, 5];
    string[6] internal BG_NAMES = ["Grey", "Blue", "Green", "Gold", "Red", "Rainbow"];

    uint8[5] internal BODY_WEIGHTS = [40, 25, 18, 12, 5];
    string[5] internal BODY_NAMES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

    uint8[5] internal ACC_WEIGHTS = [45, 25, 15, 10, 5];
    string[5] internal ACC_NAMES = ["None", "Tie", "Glasses", "Chain", "Crown"];

    function _seed(uint256 tokenId, string memory salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(tokenId, salt, "STONKBIZ-3444")));
    }

    function _weightedIndex(uint256 rand, uint8[6] memory weights) internal pure returns (uint8) {
        uint256 r = rand % 100;
        uint256 cum;
        for (uint8 i = 0; i < weights.length; i++) {
            cum += weights[i];
            if (r < cum) return i;
        }
        return uint8(weights.length - 1);
    }

    function _weightedIndex5(uint256 rand, uint8[5] memory weights) internal pure returns (uint8) {
        uint256 r = rand % 100;
        uint256 cum;
        for (uint8 i = 0; i < weights.length; i++) {
            cum += weights[i];
            if (r < cum) return i;
        }
        return uint8(weights.length - 1);
    }

    function getTraitIndices(uint256 tokenId)
        public
        view
        returns (uint8 background, uint8 body, uint8 accessory)
    {
        require(tokenId < MAX_SUPPLY, "bad id");
        background = _weightedIndex(_seed(tokenId, "BG"), BG_WEIGHTS);
        body = _weightedIndex5(_seed(tokenId, "BODY"), BODY_WEIGHTS);
        accessory = _weightedIndex5(_seed(tokenId, "ACC"), ACC_WEIGHTS);
    }

    function getTraits(uint256 tokenId)
        external
        view
        returns (string memory background, string memory body, string memory accessory)
    {
        (uint8 b, uint8 bd, uint8 a) = getTraitIndices(tokenId);
        return (BG_NAMES[b], BODY_NAMES[bd], ACC_NAMES[a]);
    }

    /*//////////////////////////////////////////////////////////
                          ERC721 LOGIC
    //////////////////////////////////////////////////////////*/
    function ownerOf(uint256 id) public view returns (address own) {
        own = _ownerOf[id];
        require(own != address(0), "not minted");
    }

    function balanceOf(address a) public view returns (uint256) {
        require(a != address(0), "zero addr");
        return _balanceOf[a];
    }

    function approve(address spender, uint256 id) external {
        address own = _ownerOf[id];
        require(msg.sender == own || isApprovedForAll[own][msg.sender], "not authorized");
        getApproved[id] = spender;
        emit Approval(own, spender, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        require(from == _ownerOf[id], "wrong from");
        require(to != address(0), "zero addr");
        require(
            msg.sender == from ||
            isApprovedForAll[from][msg.sender] ||
            msg.sender == getApproved[id],
            "not authorized"
        );

        unchecked {
            _balanceOf[from]--;
            _balanceOf[to]++;
        }
        _ownerOf[id] = to;
        delete getApproved[id];

        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        transferFrom(from, to, id);
        require(
            to.code.length == 0 ||
            IERC721Receiver(to).onERC721Received(msg.sender, from, id, "") ==
                IERC721Receiver.onERC721Received.selector,
            "unsafe recipient"
        );
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes calldata data) external {
        transferFrom(from, to, id);
        require(
            to.code.length == 0 ||
            IERC721Receiver(to).onERC721Received(msg.sender, from, id, data) ==
                IERC721Receiver.onERC721Received.selector,
            "unsafe recipient"
        );
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd
            || interfaceId == 0x5b5e139f
            || interfaceId == 0x01ffc9a7;
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        require(_ownerOf[id] != address(0), "not minted");
        return string(abi.encodePacked(baseURI, _toString(id), ".json"));
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 digits;
        uint256 tmp = v;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits -= 1;
            buf[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

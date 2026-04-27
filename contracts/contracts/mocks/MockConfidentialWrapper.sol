// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IConfidentialWrapper} from "../interfaces/IConfidentialWrapper.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MockConfidentialWrapper is IConfidentialWrapper {
    address private _underlying;

    mapping(address => uint256) public confidentialBalanceOf;

    constructor(address underlying_) {
        _underlying = underlying_;
    }

    function underlying() external view returns (address) {
        return _underlying;
    }

    function wrap(address to, uint256 amount) external returns (bytes32) {
        require(
            IERC20(_underlying).transferFrom(msg.sender, address(this), amount),
            "Tranfer failed"
        );
        confidentialBalanceOf[to] += amount;
        bytes32 handle = keccak256(abi.encodePacked(to, amount, block.timestamp));
        emit Wrapp(to, amount);
        return handle;
    }
}
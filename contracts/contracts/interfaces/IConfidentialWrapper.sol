// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IConfidentialWrapper {
    function wrap(address to, uint256 amount) external returns (bytes32);
    function underlying() external view returns (address);
    event Wrapp(address indexed to, uint256 amount);
}
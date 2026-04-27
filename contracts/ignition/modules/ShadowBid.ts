import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ShadowBid", (m) => {
  const usdc = m.contract("MockUSDC", [], { id: "MockUSDC" });

  const wrapper = m.contract("MockConfidentialWrapper", [usdc], {
    id: "MockConfidentialWrapper",
    after: [usdc],
  });

  const factory = m.contract("ShadowBidFactory", [usdc, wrapper], {
    id: "ShadowBidFactory",
    after: [usdc, wrapper],
  });

  return { usdc, wrapper, factory };
});
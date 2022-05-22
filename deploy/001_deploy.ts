import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer, tokenOwner } = await getNamedAccounts();

  await deploy("WhiteList", {
    from: deployer,
    args: ["0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"],
    log: true,
  });
};
export default func;
func.tags = ["WhiteList"];

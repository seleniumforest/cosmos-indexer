import { NetworkManager } from "../networkManager";

(async () => {
    let chainInfo = await NetworkManager.getChainInfo("cosmoshub");
    console.log(JSON.stringify(chainInfo, null, 4));

    let aliveRpcs = await NetworkManager.getAliveRegistryRpcs("cosmoshub", 60000, true);
    console.log(JSON.stringify(aliveRpcs, null, 4));
})();
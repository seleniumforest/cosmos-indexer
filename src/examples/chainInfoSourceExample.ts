import { NetworkManager } from "../networkManager";

(async () => {
    let chainInfo = await NetworkManager.getChainInfo("cosmoshub");
    console.log(JSON.stringify(chainInfo, null, 4));
})();
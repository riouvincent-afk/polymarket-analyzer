import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [injected()],           // detects MetaMask + any injected wallet
  transports: { [mainnet.id]: http() },
  ssr: true,
});

import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { arc, arcTestnet } from "@/lib/chains"

export const wagmiConfig = createConfig({
  chains: [arcTestnet, arc],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [arc.id]: http(arc.rpcUrls.default.http[0]),
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
})

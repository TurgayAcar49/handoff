# Handoff

USDC job escrow for [Arc](https://docs.arc.io). A client locks a fee in a ticket. The payee delivers a note. The client releases the USDC, or the payee claims it when the review window ends.

## Bu turda ne yapılabilir

[Arc Microgrants 2](https://dorahacks.io/hackathon/arc-microgrants-2/detail) (kapanış 1 Kasım 2026) şunu istiyor: sözleşme Arc Studio içinde yazılıp test edilecek, uygulama onu çağıracak, Arc ana ağında sözleşmeden geçen en az bir gerçek USDC işlemi olacak. Sekiz projeye 500 USDC. Puanın yüzde 30’u gerçek USDC hareketi, yüzde 25’i Arc Studio kullanımı, yüzde 25’i çalışan ürün, yüzde 20’si devam etme potansiyeli.

Arc’ın kendi örneği gelir bölüştürme. Handoff onun kopyası değil. Önerilen üç başlangıcın üçünü de taşıyor: şartlı ödeme, inceleme süresi dolunca tahsil, ve isteğe bağlı bir ajan cüzdanının teslimden sonra ödemeyi serbest bırakması.

Bu repo o ürünün sözleşmesi, testleri ve arayüzü. Arc Studio hesabın ve ana ağ cüzdanın sende olduğu için deploy ve video burada bitmiyor. Sıra:

1. `arc-forge test` ile sözleşmeyi oku. Sahibi yok; fon yalnızca durum makinesinden çıkar.
2. Arc Studio’da `arc-studio-prompt.txt` ile aynı sözleşmeyi yazdır, test ettir, **testnet**’e deploy et. Başvuru, sözleşmenin Studio içinde yazılmış olmasını istiyor. Studio ana ağa kendisi deploy etmez.
3. Testnette uygulamayı dene. USDC musluk: [faucet.circle.com](https://faucet.circle.com).
4. Aynı sözleşmeyi kendi anahtarınınla Arc ana ağına deploy et. Cüzdanda gerçek USDC kalsın; gas da USDC.
5. Ana ağda bir bilet fonla, teslim et, serbest bırak. İki işlem de USDC hareket ettirir.
6. DoraHacks’e Studio linki, canlı uygulama, sözleşme adresi, `explorer.arc.io` işlem linki, bu repo, kısa video ve bir profil (GitHub, X veya Farcaster) koy.

## Run the app

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app is at [http://127.0.0.1:43123](http://127.0.0.1:43123). Until `.env.local` has a contract address, the form explains that and does not send a transaction.

| Network | Chain id | RPC | Explorer |
| --- | --- | --- | --- |
| Arc mainnet | 5042 | `https://rpc.mainnet.arc.io` | [explorer.arc.io](https://explorer.arc.io) |
| Arc testnet | 5042002 | `https://rpc.testnet.arc.io` | [explorer.testnet.arc.io](https://explorer.testnet.arc.io) |

USDC’s ERC-20 interface is `0x3600000000000000000000000000000000000000` on both, with 6 decimals. The native balance is the same USDC at 18 decimals and pays gas. The app spends only through the ERC-20 interface and refuses native transfers in the contract. Arc silently drops a transaction whose `maxFeePerGas` is under 20 gwei, so sends use at least that floor.

## Test

Install [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry.md) so `arc-forge` is on your `PATH`.

```bash
npm run test:rules
arc-forge test
```

`lib/` already contains `forge-std`. Contract tests cover funding, release, claim, the review-window boundary, refunds, deadlines, the agent, disputes, a short transfer, and a reentering token.

## Deploy

Use a key you control. Do not commit it. Start on testnet.

```bash
export PRIVATE_KEY=0x...
export PATH="$HOME/.local/bin:$PATH"
arc-forge script script/Deploy.s.sol:DeployHandoff \
  --rpc-url https://rpc.testnet.arc.io \
  --broadcast \
  --private-key "$PRIVATE_KEY" \
  --with-gas-price 20000000000
```

Put the logged address in `NEXT_PUBLIC_HANDOFF_TESTNET`. For mainnet, change the RPC and set `NEXT_PUBLIC_HANDOFF_MAINNET`. On chain id 5042 and 5042002 the constructor rejects any token except canonical USDC.

An agent wallet named on the ticket can release it after delivery:

```bash
export RELEASER_PRIVATE_KEY=0x...
export HANDOFF_ADDRESS=0x...
npx tsx agent/release.ts --network testnet --job 1
```

Mainnet additionally requires `--confirm-mainnet`. The script simulates first and exits if the ticket is not Delivered.

## What a ticket does

- **Fund.** Client locks USDC. Refund is open until delivery.
- **Deliver.** Payee posts a note of up to 200 bytes. The review window starts.
- **Release.** Client, or the named agent, pays the payee. The agent cannot release during a dispute.
- **Claim.** Payee takes the USDC once the window has ended.
- **Dispute.** Only if an arbitrator was set, and only before the window ends. The client can still release. The payee can accept a refund. The arbitrator pays one of them.

There is no admin key. A dispute with a silent arbitrator can sit until the client releases or the payee accepts a refund. The form says this before you name one. With no arbitrator, that path does not exist.

## Submission checklist

- Arc Studio project URL
- Live app URL
- Contract address and one mainnet transaction that moved USDC, linked on explorer.arc.io
- This public repo
- A short video of the Studio build and the mainnet transaction
- What it does, and how Arc Studio was used
- A public GitHub, X, or Farcaster profile

Mainnet transactions are real and final. Review the contract before you fund a ticket.

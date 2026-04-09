# Pocket Dashboard RC0

Demo live senza database per Pocket Network.

## Cosa fa

- legge gli `end_block_events` dai blocchi Pocket Shannon
- estrae `pocket.tokenomics.EventClaimSettled`
- aggrega live:
  - relay per chain per provider
  - revenue per provider
- espone una UI Next.js con filtri `24h`, `7d`, `30d`

## Nota RC0

Questa versione non usa ancora un indexer completo di produzione, ma usa un piccolo database SQLite locale per memorizzare i settlement block gia scansionati.

Per rimanere veloce su RPC pubblici:

- usa `block_search` per trovare gli ultimi settlement block con `EventClaimSettled`
- scarica solo un campione recente di settlement block per ciascuna finestra
- salta automaticamente i `block_results` troppo lenti o troppo pesanti

Quindi i numeri sono utili come demo live, ma non ancora completi come una RC1 con indexer dedicato.

## Default endpoints

- RPC pool:
  - `https://sauron-rpc.infra.pocket.network`
  - `https://pocket-rpc.polkachu.com:443`
  - `https://rpc.pocket.chaintools.tech:443`
  - `https://pocket.api.pocket.network:443`
- REST: `https://sauron-api.infra.pocket.network`

Override opzionali:

- `POCKET_RPC_URL`
- `POCKET_RPC_URLS` comma-separated per definire un pool custom di RPC
- `POCKET_REST_URL`
- `POCKET_SQLITE_PATH` per cambiare il path del database SQLite locale

Strategia RC0 sugli RPC:

- `status` e `block_search` provano piu RPC in parallelo
- `block_results` distribuisce i fetch tra RPC diversi in base alla height
- se il fetch di un blocco fallisce o va in timeout, la richiesta riprova sugli altri RPC del pool

## Avvio

```bash
npm install
npm run dev
```

Poi apri `http://localhost:3000`.

## Note

- Cache in memoria di 5 minuti + SQLite locale per evitare di rifetchare settlement block gia scansionati.
- Revenue = somma della quota supplier-side in `reward_distribution_detailed`.
- La demo usa `block_time` del settlement block per i filtri temporali.
- Revenue USD = conversione live usando CoinGecko `pocket-network`.

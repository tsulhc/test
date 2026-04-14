# Pocket Dashboard RC0

Demo live pubblica per Pocket Network, ottimizzata per onboarding provider.

## Cosa fa oggi

- espone una UI Next.js con filtri `24h`, `7d`, `30d`
- mostra una vista market-oriented per nuovi provider:
  - revenue provider-side
  - relay serviti
  - leaderboard provider domain
  - servizi ad alta domanda
  - revenue calculator per simulare l'ingresso sul network
- usa `Poktscan` come fonte primaria quando disponibile
- usa fallback RPC diretto verso Pocket Shannon quando `Poktscan` non e disponibile

## Nota RC0

Questa versione non usa ancora un indexer completo di produzione.

In pratica oggi:

- la dashboard e una singola app Next.js
- usa un piccolo database SQLite locale per cache e snapshot persistiti
- tenta prima di leggere aggregati da `Poktscan`
- se necessario ricade su RPC pubblici leggendo settlement block recenti
- raggruppa i supplier in provider domain derivati dagli endpoint/configurazioni dei supplier

Per rimanere veloce su RPC pubblici:

- usa `block_search` per trovare gli ultimi settlement block con `EventClaimSettled`
- scarica solo un campione recente di settlement block per ciascuna finestra
- salta automaticamente i `block_results` troppo lenti o troppo pesanti

Quindi i numeri sono utili come demo live, ma non ancora equivalenti a un prodotto storico completo con indexer dedicato.

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
- `POKTSCAN_API_URL`
- `POCKET_SQLITE_PATH` per cambiare il path del database SQLite locale

Strategia RC0 sugli RPC:

- `status` e `block_search` provano piu RPC in parallelo
- `block_results` distribuisce i fetch tra RPC diversi in base alla height
- se il fetch di un blocco fallisce o va in timeout, la richiesta riprova sugli altri RPC del pool

Strategia RC0 sulle fonti dati:

- `Poktscan` e il fast-path principale della dashboard
- il fallback RPC continua a usare `EventClaimSettled` dagli `end_block_events`
- la cache locale evita cold start lenti e riduce refetch ripetuti

## Avvio

```bash
npm install
npm run dev
```

Poi apri `http://localhost:3000`.

## Note

- Cache in memoria di 5 minuti + SQLite locale per settlement block, metadata e snapshot dashboard.
- In fallback RPC, revenue = somma della quota supplier-side in `reward_distribution_detailed`.
- Quando la dashboard usa `Poktscan`, gli aggregati arrivano da dataset gia pre-elaborati lato Poktscan.
- La demo usa `block_time` del settlement block o la finestra aggregata equivalente per i filtri temporali.
- Revenue USD = conversione live usando CoinGecko `pocket-network`.
- L'unita mostrata in UI e un provider domain aggregato; il dettaglio per singolo supplier/operator rimane secondario nella demo pubblica.

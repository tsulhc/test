# Pocket Dashboard RC1 Roadmap

## Stato Attuale

La codebase attuale ha gia una dashboard demo funzionante e non parte piu da un repository vuoto.

Oggi il progetto ha gia:

- app Next.js con dashboard pubblica
- filtri `24h`, `7d`, `30d`
- leaderboard provider e vista servizi
- revenue calculator orientato all'onboarding
- cache persistita in SQLite
- fonte primaria `Poktscan` con fallback RPC diretto

Questa roadmap quindi descrive soprattutto l'evoluzione verso una RC1 piu rigorosa e storicamente completa, non un lavoro da rifare da zero.

## Obiettivo RC1

Costruire una dashboard visiva per Pocket Network focalizzata sull'onboarding dei nuovi provider, con due metriche economiche iniziali:

- relay eseguiti per chain per provider
- revenue per provider

con filtri temporali `24h`, `7d`, `30d`.

Nel protocollo Shannon di Pocket, la nozione piu vicina a "provider" nel codice e `Supplier`, mentre la nozione piu vicina a "chain" e `Service`:

- provider operativo: `supplier_operator_address`
- proprietario economico: `supplier_owner_address`
- chain/prodotto servito: `service_id`

Riferimenti codice:

- `proto/pocket/shared/supplier.proto`
- `proto/pocket/shared/service.proto`
- `proto/pocket/tokenomics/event.proto`

## Decisioni Fondative

### 1. Fonte dati primaria

Per RC1 la fonte dati primaria deve essere l'evento onchain `EventClaimSettled`, non le query gRPC aggregate.

Motivi:

- `x/tokenomics` espone query quasi solo per params, non per aggregati di revenue o relay per supplier: `proto/pocket/tokenomics/query.proto`
- `EventClaimSettled` contiene gia i campi necessari per relay, service, supplier e breakdown economico: `proto/pocket/tokenomics/event.proto`
- l'evento viene emesso in settlement da `x/tokenomics/keeper/settle_pending_claims.go:914-926`

### 2. Modalita di ingestion

L'indicizzazione deve leggere gli `end_block_events`, non i normali eventi di transazione.

Motivo:

- il settlement avviene nell'`EndBlocker` di `x/tokenomics`: `x/tokenomics/module/abci.go:15-27`
- quindi `EventClaimSettled` non nasce da una tx utente ma da logica di fine blocco

### 3. Definizione RC1 di revenue

Per "revenue per provider" in RC1 conviene usare la quota realmente attribuita al supplier lato economico, cioe la somma delle entries in `reward_distribution_detailed` con op reason di tipo supplier reward.

Riferimenti:

- campo evento: `proto/pocket/tokenomics/event.proto:136-180`
- dettagli reward: `x/tokenomics/types/settlement_result.go:93-107`
- distribuzione supplier rewards: `x/tokenomics/token_logic_module/tlm_relay_burn_equals_mint.go:223-250`
- revenue share dei supplier: `x/tokenomics/token_logic_module/distribution_supplier.go:52-113`
- enum op reason: `proto/pocket/tokenomics/types.proto:63-98`

Questa scelta e migliore di usare direttamente `minted_upokt`, perche `minted_upokt` rappresenta il valore economico complessivo creato dalla claim, non la sola quota del supplier.

### 4. Semantica temporale RC1

Per i filtri `24h`, `7d`, `30d` e consigliato usare il `block_time` del blocco in cui la claim viene effettivamente settlata.

Motivi:

- la revenue esiste economicamente solo a settlement completato
- il settlement puo avvenire dopo claim/proof windows, quindi e coerente usare un timestamp finale comune per relay e revenue in RC1
- il protocollo usa finestre di sessione, claim e proof definite in blocchi: `x/shared/types/session.go`

Come dato di supporto, va comunque conservato `session_end_block_height` dall'evento per analisi future.

## Fasi di Lavoro

## Fase 0. Fondazione progetto

Stato rispetto alla codebase attuale: in gran parte gia superata per la demo pubblica. Le parti ancora rilevanti sono soprattutto quelle che riguardano robustezza del modello dati e ingestion storica piu completa.

Output:

- repo con architettura app + indexer + db
- configurazione connessione a nodo Pocket Shannon
- schema iniziale del database

Task:

- scegliere stack frontend/backend coerente con repo vuoto; proposta minima: Next.js + Postgres + worker di ingestion separato
- definire env vars per RPC CometBFT, LCD/gRPC e database
- aggiungere migrazioni iniziali

Done when:

- il progetto si avvia localmente
- e possibile salvare in db eventi sintetici di test

## Fase 1. Event indexer onchain

Output:

- worker che scorre blocchi in ordine crescente
- parser di `EventClaimSettled`
- persistenza idempotente

Task:

- leggere `end_block_events` per altezza
- filtrare gli eventi di tipo `EventClaimSettled`
- salvare campi raw principali: blocco, timestamp, session, service, supplier, reward breakdown
- costruire checkpoint di sync per resume in caso di restart

Riferimenti codice:

- `x/tokenomics/module/abci.go`
- `x/tokenomics/keeper/settle_pending_claims.go:889-932`
- `proto/pocket/tokenomics/event.proto:77-180`
- `x/tokenomics/types/event_claim_settled.go`

Done when:

- da una height iniziale si popolano righe di settlement in db
- il re-run non duplica eventi

## Fase 2. Enrichment dimensionale

Output:

- tabella servizi con metadata minima
- tabella supplier con owner/operator e configurazioni utili

Task:

- sync periodico dei services via `service.Query/AllServices`
- sync periodico dei suppliers via `supplier.Query/AllSuppliers`
- collegamento tra `service_id` e nome leggibile
- collegamento tra `supplier_operator_address` e `supplier_owner_address`

Riferimenti codice:

- `proto/pocket/service/query.proto`
- `x/service/keeper/query_service.go`
- `proto/pocket/supplier/query.proto`
- `x/supplier/keeper/query_supplier.go`
- `proto/pocket/shared/supplier.proto`
- `proto/pocket/shared/service.proto`

Done when:

- la UI puo mostrare label leggibili invece dei soli ID

## Fase 3. Aggregazioni RC1

Output:

- query/API per `24h`, `7d`, `30d`
- leaderboard provider
- breakdown relay per chain per provider

Task:

- materializzare o calcolare on demand gli aggregati su `block_time`
- sommare `num_relays` per `supplier_operator_address + service_id`
- sommare supplier revenue per `supplier_operator_address`
- opzionalmente preparare anche metriche secondarie: `minted_upokt`, `settled_upokt`, `overservicing_loss_upokt`, `deflation_loss_upokt`

Done when:

- esistono endpoint consumabili dalla UI
- i risultati sono coerenti con un campione di eventi raw

## Fase 4. Dashboard UI

Output:

- dashboard con filtri temporali `24h`, `7d`, `30d`
- vista top provider per revenue
- tabella o heatmap relay per chain per provider

Task:

- costruire time selector globale
- creare KPI cards principali
- aggiungere tabella provider con sorting e ricerca
- aggiungere dettaglio provider con breakdown per service

Done when:

- un nuovo provider capisce rapidamente dove si concentra il volume e quale revenue puo aspettarsi dai principali services

## Fase 5. Verifica e hardening

Output:

- validazioni dati
- monitoraggio ingestion
- documentazione operativa

Task:

- confrontare totali giornalieri con un campione di block results
- validare il parsing dei coin `upokt`
- monitorare lag del worker e ultimo blocco indicizzato
- testare restart e backfill

Done when:

- il sistema regge backfill e sync continua senza duplicazioni

## Priorita Consigliate

### Sprint 1

- fondazione progetto
- schema db
- indexer base `EventClaimSettled`
- API aggregate minime

### Sprint 2

- enrichment suppliers/services
- UI RC1 con leaderboard e breakdown
- validazioni con dataset reale

### Sprint 3

- metriche secondarie
- performance tuning
- deploy e osservabilita

## Rischi Principali

### 1. Confondere claim, proof e settlement

I dati economici finali non vanno presi da `EventClaimCreated` o `EventProofSubmitted`, ma da `EventClaimSettled`.

Riferimenti:

- `proto/pocket/proof/event.proto`
- `proto/pocket/tokenomics/event.proto`

### 2. Confondere gross claim value con supplier revenue

`claimed_upokt`, `settled_upokt` e `minted_upokt` non coincidono necessariamente con la revenue del provider.

### 3. Temporalita non banale

Le sessioni sono in blocchi, non in tempo reale. I selettori UI in ore/giorni richiedono mapping su `block_time`.

Riferimenti:

- `x/shared/types/session.go`
- `proto/pocket/shared/params.proto`

### 4. Reward share interna al supplier

Un supplier puo distribuire la quota economica a piu indirizzi tramite `rev_share`, quindi bisogna decidere se aggregare per operator o per owner. Per RC1 si consiglia aggregazione primaria per `supplier_operator_address`, con `supplier_owner_address` come dimensione secondaria.

## Estensioni Post-RC1

- andamento temporale revenue/relay per provider
- confronto tra `num_relays` e `num_estimated_relays`
- analisi overservicing e deflation
- aggregazione per owner multi-operator
- ranking per service profitability

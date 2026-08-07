# Sincronizzare il catalogo dei runbook automatici

Questo tutorial descrive come rendere disponibili in Go Watchtower i runbook
automatici definiti nel repository `go-automation`, sia nello sviluppo locale
sia in produzione.

## Come funziona

Il registry nel repository `go-automation` e' la fonte autorevole. Watchtower
non mantiene una seconda lista di runbook:

```text
go-automation registry
        |
        +-- locale ----> catalogo JSON ----> database Watchtower locale
        |
        +-- produzione -> deploy worker -> catalogo S3 -> database Watchtower
```

Il catalogo usa sempre il contratto `AutomaticRunbookCatalogV1`. In produzione
l'oggetto corrente si trova alla chiave fissa:

```text
automatic-runbooks/v1/current.json
```

Non usare le fixture sotto `contracts/` come catalogo applicativo: servono solo
ai test del contratto.

## Prerequisiti comuni

- i repository `go-automation` e `go-watchtower` sono disponibili localmente;
- le dipendenze pnpm sono installate in entrambi i repository;
- il database Watchtower e' migrato e contiene i permessi creati dal seed;
- l'environment dichiarato dal catalogo coincide con quello atteso da
  Watchtower.

## Sincronizzazione locale

In locale il catalogo viene generato dal registry reale di `go-automation` e
importato direttamente nella singleton `automation_capability_catalog/ACTIVE`
del database Watchtower. Non sono necessari S3 o Lambda.

### 1. Generare il catalogo

Dal repository `go-automation`:

```bash
cd ../go-automation

pnpm catalog:automatic:build-local \
  --environment development \
  --output /tmp/go-automatic-runbook-catalog.json \
  --change-note "Aggiornamento catalogo locale"
```

Il comando:

- legge tutti i descriptor dal registry reale;
- verifica che i runbook siano eseguibili nel worker cloud;
- calcola digest e revisione del catalogo;
- scrive un file privato con permessi `0600`;
- stampa revisione, artifact revision e numero di runbook esportati.

### 2. Importare il catalogo in Watchtower

Dal repository `go-watchtower`:

```bash
cd ../go-watchtower

pnpm catalog:automatic:import-local -- \
  --file /tmp/go-automatic-runbook-catalog.json \
  --environment development \
  --validity-seconds 86400
```

Il comando usa il `DATABASE_URL` del backend, valida nuovamente file,
environment, revisione e dimensione, quindi aggiorna il catalogo attivo. Un
risultato corretto contiene almeno:

```json
{
  "status": "IMPORTED",
  "environment": "development",
  "revision": "sha256-...",
  "runbooks": 1,
  "sourceVersionId": "local:sha256-..."
}
```

Il valore di `runbooks` dipende dal registry corrente.

`--validity-seconds` e' facoltativo e vale 86400, cioe' 24 ore, per default.
Per mantenere valido il catalogo per una settimana usare `604800`. Allo scadere
il catalogo diventa `STALE` e deve essere importato nuovamente.

L'import locale viene rifiutato quando `NODE_ENV=production`.

### 3. Verificare il risultato locale

1. Aprire Watchtower.
2. Andare in **Slack Ingestor -> Runbook automatici**.
3. Ricaricare la pagina se era gia' aperta.
4. Verificare:
   - stato `HEALTHY`;
   - sorgente `Locale (CLI)`;
   - revisione valorizzata;
   - numero e nomi dei runbook attesi.

Non e' necessario riavviare il backend dopo l'import. Il pulsante
**Importato tramite CLI** resta disabilitato perche' un catalogo locale deve
essere rigenerato e importato dai due comandi precedenti.

La presenza del catalogo rende disponibili consultazione, coverage e
configurazione delle regole, ma non crea queue o worker locali. Se questi non
sono configurati, mantenere l'ingestion mode in pausa oppure l'execution policy
su `OFF`.

### Aggiornamenti successivi

Dopo aver aggiunto, modificato o rimosso un runbook in `go-automation`, ripetere
sia la generazione sia l'importazione. Importare nuovamente un catalogo con la
stessa revisione e' sicuro e rinnova la validita' della copia locale.

## Sincronizzazione in produzione

In produzione non importare file locali e non caricare manualmente
`current.json` su S3. Il catalogo descrive le capability effettivamente
supportate dai worker: deve quindi essere pubblicato soltanto dall'orchestratore
di deploy di `go-automation`, dopo che i worker compatibili sono stati
distribuiti e verificati.

### 1. Configurare Watchtower per leggere S3

Questa configurazione e' necessaria una sola volta per ambiente. Nel runtime
del backend Watchtower impostare:

```dotenv
AUTOMATIC_RUNBOOK_CATALOG_BUCKET=go-auto-<account-id>-production-runbooks
AUTOMATIC_RUNBOOK_CATALOG_REGION=eu-south-1
AUTOMATIC_RUNBOOK_CATALOG_ENVIRONMENT=production
CATALOG_SYNC_INTERVAL_SECONDS=60
CATALOG_VALIDITY_SECONDS=300
```

Usare il nome bucket restituito dagli output dell'infrastruttura
`watchtower-alarm-analysis`; non dedurlo soltanto dal template. Il file
`docker-compose.prod.yml` inoltra gia' queste variabili al container backend.
Dopo la prima configurazione riavviare il backend.

Il ruolo IAM usato dal backend deve poter leggere esclusivamente l'oggetto del
catalogo e le sue versioni. La policy minima e' equivalente a:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::<catalog-bucket>/automatic-runbooks/v1/current.json"
    }
  ]
}
```

Anche la bucket policy deve consentire la lettura a quel ruolo. Non concedere
al backend `s3:PutObject` o permessi di cancellazione.

Quando il bucket e' configurato, il backend esegue un sync all'avvio e poi ogni
`CATALOG_SYNC_INTERVAL_SECONDS`. Una verifica riuscita estende `validUntil` di
`CATALOG_VALIDITY_SECONDS`.

### 2. Preparare il deploy in `go-automation`

Il comando di produzione richiede:

- working tree pulito;
- credenziali AWS del ruolo di deploy;
- tutte le regioni worker, inclusa la control region `eu-south-1`;
- un file `<config-dir>/<region>.env` per ogni regione;
- la stessa configurazione di environment, account e URL interno Watchtower in
  tutti i file;
- una change note non vuota;
- una finestra operativa adeguata per deploy ed eventuale drain.

Usare come base:

```text
go-automation/infra/watchtower-alarm-analysis/.env.deploy.example
```

I file reali possono contenere ID e ARN, ma non valori secret. Non committarli.

### 3. Eseguire il preflight

Dal repository `go-automation`, sostituendo regioni e directory con quelle
effettive:

```bash
pnpm deploy:execute-runbook:environment \
  --environment production \
  --regions eu-south-1,eu-west-1 \
  --config-dir <config-dir> \
  --drain-timeout 2h \
  --change-note "Descrizione della modifica" \
  --dry-run
```

Il dry-run valida configurazione e catalogo e mostra la revisione generata.
Non distribuisce worker e non pubblica l'oggetto S3.

Controllare in particolare:

- numero di runbook;
- revisione del catalogo;
- environment `production`;
- lista delle capability aggiunte, modificate o ritirate;
- assenza di un catalogo vuoto non intenzionale.

### 4. Distribuire worker e pubblicare il catalogo

Solo dopo un preflight corretto:

```bash
AWS_PROFILE=<profilo-deploy> \
pnpm deploy:execute-runbook:environment \
  --environment production \
  --regions eu-south-1,eu-west-1 \
  --config-dir <config-dir> \
  --drain-timeout 2h \
  --change-note "Descrizione della modifica"
```

L'orchestratore:

1. esegue i test del registry e dei runbook;
2. genera il catalogo dalla stessa revisione Git del worker;
3. calcola il diff rispetto al catalogo S3 corrente;
4. gestisce il ritiro transitorio e il drain per modifiche incompatibili;
5. distribuisce e verifica i worker in tutte le regioni;
6. pubblica il catalogo su S3 con controllo concorrente tramite ETag;
7. attende che Watchtower osservi la nuova revisione.

Se un deploy regionale fallisce, il catalogo finale non viene pubblicato. Non
usare `--allow-empty-catalog` salvo ritiro intenzionale e approvato di tutte le
capability.

### 5. Forzare la rilettura da S3

Normalmente non serve: il backend sincronizza automaticamente entro 60 secondi.
Un amministratore puo' forzare la rilettura da Watchtower:

1. aprire **Slack Ingestor -> Runbook automatici**;
2. premere **Sincronizza da S3**;
3. attendere la conferma;
4. verificare stato e revisione.

Il pulsante non pubblica nulla su S3: esegue soltanto il percorso S3 -> database
Watchtower. L'endpoint equivalente e':

```text
POST /api/automatic-runbooks/catalog/refresh
```

### 6. Verificare la produzione

Nel pannello **Slack Ingestor -> Runbook automatici** verificare:

- stato `HEALTHY`;
- sorgente `S3`;
- revisione uguale a quella stampata dal deploy;
- worker artifact revision uguale al commit distribuito;
- assenza di errori e riferimenti irrisolti;
- numero di runbook atteso.

La presenza dell'oggetto e dei metadata puo' essere controllata con una
chiamata AWS in sola lettura:

```bash
aws s3api head-object \
  --profile <profilo-readonly> \
  --region eu-south-1 \
  --bucket <catalog-bucket> \
  --key automatic-runbooks/v1/current.json \
  --query '{VersionId:VersionId,ETag:ETag,Metadata:Metadata}'
```

## Rollback in produzione

Non ripristinare manualmente una vecchia versione S3: il catalogo potrebbe
dichiarare capability non supportate dai worker attuali.

Per un rollback:

1. scegliere una revisione `go-automation` compatibile;
2. eseguire il dry-run dell'orchestratore;
3. verificare il diff e l'eventuale drain;
4. eseguire il deploy completo;
5. controllare che Watchtower osservi la revisione risultante.

Il versioning S3 conserva lo storico per audit, ma non sostituisce i controlli
di compatibilita' del deploy.

## Troubleshooting

| Sintomo                                                 | Causa probabile                                                         | Azione                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `CATALOG_UNAVAILABLE` o stato `UNINITIALIZED`           | Nessun import locale oppure bucket production vuoto/non configurato     | Importare il catalogo locale o verificare le env S3 del backend              |
| `AUTOMATIC_RUNBOOK_CATALOG_BUCKET_NOT_CONFIGURED`       | `AUTOMATIC_RUNBOOK_CATALOG_BUCKET` vuoto                                | Impostare il bucket corretto e riavviare il backend                          |
| `AccessDenied` durante il sync S3                       | Ruolo backend o bucket policy senza accesso alla key                    | Correggere `s3:GetObject` e `s3:GetObjectVersion` sulla sola key             |
| `CATALOG_INVALID`                                       | Environment, schema, revisione o descriptor non coerenti                | Rigenerare dal registry e verificare lo stesso environment ai due lati       |
| Stato `STALE` in locale                                 | `validUntil` dell'import e' scaduto                                     | Ripetere l'import o aumentare `--validity-seconds`                           |
| Stato `STALE` in produzione                             | Il backend non rinnova la verifica entro la finestra configurata        | Controllare credenziali, rete verso S3 e log del backend                     |
| Pulsante `Importato tramite CLI` disabilitato           | Il catalogo attivo proviene da import locale                            | Rigenerare e importare via CLI; e' il comportamento previsto                 |
| La UI mostra ancora la lista precedente                 | Cache frontend non invalidata dall'import CLI                           | Ricaricare la pagina o riaprire la tab del catalogo                          |
| Il catalogo locale e' visibile ma l'esecuzione fallisce | Queue o worker non configurati localmente                               | Tenere l'execution policy `OFF` oppure configurare esplicitamente il runtime |
| Il deploy production rifiuta il comando                 | Working tree sporco, config regionale incompleta o change note mancante | Correggere il preflight; non aggirare il controllo                           |

## Checklist rapida

### Locale

- [ ] Catalogo generato dal registry reale di `go-automation`.
- [ ] Environment `development` uguale in generazione e import.
- [ ] Import completato con stato `IMPORTED`.
- [ ] UI con stato `HEALTHY` e sorgente `Locale (CLI)`.
- [ ] Execution policy disabilitata se non esistono worker locali.

### Produzione

- [ ] Backend configurato con bucket, regione ed environment corretti.
- [ ] IAM backend limitato alla lettura della key del catalogo.
- [ ] Preflight completato e diff revisionato.
- [ ] Deploy eseguito dall'orchestratore `go-automation`.
- [ ] Catalogo pubblicato soltanto dopo la verifica dei worker.
- [ ] Watchtower con stato `HEALTHY`, sorgente `S3` e revisione attesa.

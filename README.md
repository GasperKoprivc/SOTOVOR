# Sotovor

Sotovor je družinski prostor za skupna opravila, koledar in pregled razporeditve dela. Spletna aplikacija uporablja React in Vite, skupni API uporablja Node.js in Express, podatke pa hrani lokalni MongoDB.

## Zagon na Windows

1. Uporabi Node.js 24 ali novejši in MongoDB Community Server.
2. Zaženi [start.bat](start.bat) z dvoklikom ali z ukazom `.\start.bat`. Ob prvem zagonu namesti pakete, nato zgradi React in zažene MongoDB ter Express.
3. Odpri [http://127.0.0.1:3000](http://127.0.0.1:3000). Za ustavitev uporabi `Ctrl+C` v oknu zagona.

Projektni MongoDB posluša na `127.0.0.1:27027` in hrani podatke v `data/mongodb`. Zaganjalnik poišče `mongod` v običajni namestitveni mapi ali v sistemski poti. Za drugo lokacijo nastavi `SOTOVOR_MONGOD` na absolutno pot do `mongod.exe`. Za druga vrata uporabi `SOTOVOR_PORT` in `SOTOVOR_MONGO_PORT`. Dnevnik baze je v `data/mongodb.log`.

## Prvi preizkus

Ustvari prostor, nato dodaj opravilo ali dogodek. Opravilo lahko dodeliš članu ali ga objaviš za prevzem. V meniju **Povabi člana** kopiraj kodo in jo preizkusi v zasebnem oknu ali drugem profilu brskalnika. Drugi član lahko opravilo prevzame, ponudi za zamenjavo ali zaključi. Opravila z datumom in dogodki se prikažejo v tedenskem koledarju. Spremembe drugih članov se osvežijo v nekaj sekundah.

Članstvo je vezano na sejo brskalnika. Brisanje piškotka, potek seje ali prehod na drug naslov strežnika zahteva nov vstop s kodo, ki ustvari novega člana.

## Struktura projekta

| Mapa | Vsebina |
| --- | --- |
| [backend](backend/) | Express API, seje in dostop do MongoDB |
| [frontend](frontend/) | React strani, komponente in Vite |
| [apps/mobile](apps/mobile/) | Mapa za prihodnji projekt v Android Studiu |
| [apps/desktop](apps/desktop/) | Mapa za prihodnji namizni odjemalec |
| [scripts](scripts/) | Lokalni zagon MongoDB in API-ja |

Za razvoj Reacta pusti `start.bat` zagnan in v drugem terminalu uporabi `npm run dev --workspace frontend`. Vite posreduje klice API-ja Expressu na vratih 3000 oziroma na `SOTOVOR_PORT`, če ga nastaviš tudi v terminalu za Vite. Če se spremenijo odvisnosti, v korenu projekta zaženi `npm ci`.

## Preverjanja in CI

GitHub Actions ob vsakem potisku in pull requestu namesti odvisnosti z `npm ci`, preveri sintakso datotek JavaScript v `backend/src` in zgradi frontend z `npm run build`. Projekt trenutno nima ločenih testnih ali lint ukazov, zato jih CI še ne izvaja.

Preverjanja lahko lokalno zaženeš iz korenske mape. V Windows PowerShellu uporabi `npm.cmd`, če pravilnik izvajanja blokira skripto `npm.ps1`:

```powershell
npm.cmd ci
node --check backend/src/api.js
node --check backend/src/db.js
node --check backend/src/server.js
npm.cmd run build
```

## Dostop s telefona

Za preizkus spletne različice s telefonom v domačem omrežju ustavi prejšnji zagon in v PowerShellu zaženi:

```powershell
$env:SOTOVOR_HOST = '0.0.0.0'
.\start.bat
```

Na telefonu odpri `http://<lokalni-IP-računalnika>:3000`. Naslov računalnika najdeš z `ipconfig`. MongoDB ostane dostopen samo na računalniku s strežnikom. Spletni dostop uporablja HTTP za lokalni razvoj.

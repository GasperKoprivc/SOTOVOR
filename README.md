# Sotovor

Sotovor je družinski prostor za skupna opravila, koledar in pregled razporeditve dela. Spletna aplikacija uporablja React in Vite, skupni API uporablja Node.js in Express, podatke pa hrani lokalni MongoDB.

## Zagon na Windows

1. Uporabi Node.js 24 ali novejši in MongoDB Community Server.
2. Zaženi [start.bat](start.bat) z dvoklikom ali z ukazom `.\start.bat`. Ob prvem zagonu namesti pakete, nato zgradi React in zažene MongoDB ter Express.
3. Ko je aplikacija pripravljena, se odpre privzeti brskalnik na [http://127.0.0.1:3000](http://127.0.0.1:3000). Za ustavitev uporabi `Ctrl+C` v oknu zagona. Nastavi `SOTOVOR_NO_BROWSER=1`, če želiš zagon brez odpiranja brskalnika.

Projektni MongoDB posluša na `127.0.0.1:27027` in hrani podatke v `data/mongodb`. Zaganjalnik poišče `mongod` v običajni namestitveni mapi ali v sistemski poti. Za drugo lokacijo nastavi `SOTOVOR_MONGOD` na absolutno pot do `mongod.exe`. Za druga vrata uporabi `SOTOVOR_PORT` in `SOTOVOR_MONGO_PORT`. Dnevnik baze je v `data/mongodb.log`.

## Namizna aplikacija

Zaženi [start.bat](start.bat). Na Windows z nameščenim Rustom zgradi tudi namizni Sotovor v Tauri + React in ga odpre, ko je strežnik pripravljen. Za namizno okno brez spletnega zavihka uporabi `start-desktop.bat`. Če želiš samo spletni zagon, nastavi `SOTOVOR_WEB_ONLY=1`. Obe aplikaciji uporabljata isti strežnik in MongoDB. Prijavo ali registracijo za namizno okno opraviš v privzetem brskalniku in potrdiš prikazano kodo. Zahteve za Windows in nastavitev naslova za objavo so v [navodilih za namizno aplikacijo](apps/desktop/README.md).

## Zagon z Docker Compose

Za lokalni zagon aplikacije in MongoDB v Dockerju namesti Docker Desktop ter v korenski mapi projekta zaženi:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Odpri [http://127.0.0.1:3000](http://127.0.0.1:3000). Compose MongoDB podatke hrani v imenovanem `mongodb-data` volume in bazo izpostavi samo na `127.0.0.1:27027`; `docker compose down` ustavi storitve, ne izbriše pa podatkov. Za ponovni zagon uporabi `docker compose up -d`. Aplikacija in baza sta lokalno dostopni, ne javno izpostavljeni. Če želiš zagnati aplikacijo neposredno z `.\start.bat` in lokalnim MongoDB, najprej ustavi Compose z `docker compose down`; običajni zagon ne potrebuje Dockerja.

GitHub Actions ob potisku na `main` in oznakah `v*` objavi en aplikacijski image `gasperkoprivc/sotovor` na Docker Hubu. React in Express sta v istem imageu, ker Express že streže zgrajeni frontend; MongoDB uporablja uradni image `mongo:8.0` in se ne objavlja skupaj z aplikacijo. V GitHub nastavitvah repozitorija dodaj Actions secrets `DOCKERHUB_USERNAME` (uporabniško ime Docker Hub) in `DOCKERHUB_TOKEN` (Docker Hub access token z dovoljenjem za zapis v `gasperkoprivc/sotovor`). Ne uporabljaj gesla Docker Hub računa in tokena ne dodajaj v repozitorij, `.env` ali sporočilo. Gradnja in testiranje v CI uporabljata začasno MongoDB storitev brez poverilnic.

## Prvi preizkus

Ustvari prostor, nato dodaj opravilo ali dogodek. Opravilo lahko dodeliš članu ali ga objaviš za prevzem. V meniju **Povabi člana** kopiraj kodo in jo preizkusi v zasebnem oknu ali drugem profilu brskalnika. Drugi član lahko opravilo prevzame, ponudi za zamenjavo ali zaključi. Opravila z datumom in dogodki se prikažejo v tedenskem koledarju. Spremembe drugih članov se osvežijo v nekaj sekundah.

Na predstavitveni strani ustvari račun z imenom, priimkom, e-pošto, telefonom in geslom ali se prijavi. V profilu odpri nadzorno ploščo. Če računu še ni dodeljen prostor, ustvari svojega in določi načrtovano število članov ali se pridruži s kodo.

Ustvarjalec prostora je skrbnik. V profilu lahko ustvari dodatno družino, preklaplja med svojimi prostori, zamenja kodo povabila ter ureja pravice članov. Član druge družine lahko ustvari svoj prostor, ko skrbnik odobri njegov izstop. Če imaš še sejo iz prejšnje različice, jo registracija z odprtim brskalniškim profilom poveže z novim računom.

Koledar ima mesečni in tedenski pogled. V mesečnem pogledu klikni dan za seznam vseh opravil in dogodkov.

### Lokalna demo družina

Zaženi `start.bat` in pusti Sotovor odprt. V drugem PowerShellu v korenski mapi projekta ustvari demo podatke za trenutni mesec:

```powershell
npm.cmd run seed:demo
Get-Content .\data\demo-password.txt
```

Ukaz pripravi prostor **Družina Novak · Demo** s štirimi računi in **sedmimi opravili na dan**. Za določen mesec uporabi `npm.cmd run seed:demo -- 2026-11`, kar za november 2026 pripravi 210 opravil. Ponovitev ukaza za isti mesec vnosov ne podvoji.

| Oseba | Vloga | E-pošta za prijavo |
| --- | --- | --- |
| Ana Novak | Skrbnica | `ana@demo.sotovor.test` |
| Matej Novak | Član | `matej@demo.sotovor.test` |
| Luka Novak | Član | `luka@demo.sotovor.test` |
| Ema Novak | Članica | `ema@demo.sotovor.test` |

Vsi štirje računi uporabljajo skupno geslo, ki se ustvari lokalno v `data/demo-password.txt`. Na [naslovnici](http://127.0.0.1:3000) izberi **Prijava**, nato v profilu odpri **Nadzorno ploščo**. V koledarju preklopi na **Mesec** in klikni dan za seznam opravil. Ana lahko v profilu upravlja povabila in pravice članov. Za preizkus članskega pogleda se odjavi in prijavi z enim od drugih računov.

Pri opravilu z rokom lahko določiš interval ponavljanja v dneh in vključiš rotacijo. Ko član zaključi opravilo, Sotovor ustvari naslednji vnos glede na prejšnji rok, pri rotaciji pa ga dodeli naslednjemu članu po vrstnem redu pridružitve. Nastavitev opomnika določa, koliko dni pred rokom se opravilo pojavi med opozorili.

V meniju **Obvestila** so dodelitve, bližnji roki tvojih opravil in prošnje za zamenjavo. Obvestila delujejo v spletni aplikaciji in se osvežujejo skupaj s pregledom. Oznake prebranih obvestil se shranijo v trenutnem brskalniku.

Opravilu ali dogodku lahko priložiš do 30 sekund dolg glasovni posnetek. Posnetek je v MongoDB in ga lahko predvajajo člani istega prostora. Snemanje zahteva dovoljenje za mikrofon ter naslov localhost ali HTTPS.

### Neobvezni vnos prek WhatsAppa

V lokalni `.env` nastavi `SOTOVOR_WHATSAPP_APP_SECRET` (Meta App Secret), `SOTOVOR_WHATSAPP_VERIFY_TOKEN` (izbrana naključna vrednost) in `SOTOVOR_WHATSAPP_PHONE_ID` (ID poslovne številke). V Meta WhatsApp Cloud API naroči dogodek `messages` in registriraj javno dostopen HTTPS naslov z javno potjo `/webhooks/whatsapp`. Posredniški strežnik naj na internet izpostavi samo to pot. Običajen lokalni zagon deluje tudi brez te povezave.

V družinskem prostoru odpri **WhatsApp** in ustvari kodo. Iz izbrane številke pošlji prikazano sporočilo na poslovno številko. Prosto besedilo nato ustvari nedodeljeno opravilo, besedilo `dogodek 2027-02-10 Družinsko kosilo` pa koledarski dogodek. Na prostor je lahko povezana ena številka. Prek istega menija jo lahko odklopiš.

## Struktura projekta

| Mapa | Vsebina |
| --- | --- |
| [backend](backend/) | Express API, seje in dostop do MongoDB |
| [frontend](frontend/) | React strani, komponente in Vite |
| [Docker](Dockerfile) | Aplikacijski image; [Compose](compose.yaml) za lokalno aplikacijo in MongoDB |
| [apps/mobile](apps/mobile/) | Mapa za prihodnji projekt v Android Studiu |
| [apps/desktop](apps/desktop/) | Namizni projekt Tauri in navodila za Windows paket |
| [scripts](scripts/) | Lokalni zagon MongoDB in API-ja |

Za razvoj Reacta pusti `start.bat` zagnan in v drugem terminalu uporabi `npm run dev --workspace frontend`. Vite posreduje klice API-ja Expressu na vratih 3000 oziroma na `SOTOVOR_PORT`, če ga nastaviš tudi v terminalu za Vite. Če se spremenijo odvisnosti, v korenu projekta zaženi `npm ci`.

## Preverjanja in CI

GitHub Actions ob vsakem potisku in pull requestu namesti odvisnosti z `npm ci`, preveri sintakso datotek JavaScript v `backend/src` in `scripts/start.js`, izvede API integracijski preizkus z MongoDB ter zgradi frontend z `npm run build`. Projekt nima ločenega lint ukaza.

Preverjanja lahko lokalno zaženeš iz korenske mape. MongoDB mora biti dosegljiv na `127.0.0.1:27027`, lahko pa povezavo nastaviš z `SOTOVOR_MONGO_URI`. V Windows PowerShellu uporabi `npm.cmd`, če pravilnik izvajanja blokira skripto `npm.ps1`:

```powershell
npm.cmd ci
node --check backend/src/api.js
node --check backend/src/db.js
node --check backend/src/server.js
node --check scripts/start.js
npm.cmd test
npm.cmd run build
```

## Dostop s telefona

Za preizkus spletne različice s telefonom v domačem omrežju ustavi prejšnji zagon in v PowerShellu zaženi:

```powershell
$env:SOTOVOR_HOST = '0.0.0.0'
.\start.bat
```

Na telefonu odpri `http://<lokalni-IP-računalnika>:3000`. Naslov računalnika najdeš z `ipconfig`. MongoDB ostane dostopen samo na računalniku s strežnikom. Spletni dostop uporablja HTTP za lokalni razvoj.

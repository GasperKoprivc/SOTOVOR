# Sotovor

### Manj usklajevanja. Več skupnega časa.

**Sotovor je skupni družinski prostor za opravila, dogovore, koledar in pregled razporeditve dela.** Na enem mestu pokaže, kaj je treba urediti, kdo je kaj prevzel, kateri roki se bližajo in kako so obveznosti razdeljene med družinske člane.

Namenjen je vsakodnevnim stvarem: pospravljanju, nakupom, prevzemu otrok, družinskim dogodkom in drugim obveznostim, ki sicer hitro ostanejo v sporočilih ali v glavi enega človeka. Člani lahko delo prevzamejo sami, prosijo za zamenjavo ali ga dobijo dodeljenega. Skrbnik lahko pripravi tudi predlog razporeditve glede na vloge, razpoložljivost in dosedanjo obremenitev.

> **Trenutno stanje · 17. november 2026**
> Implementirani so spletna aplikacija, namizni odjemalec za Windows, skupni API in shranjevanje v MongoDB. Na telefonu je na voljo odzivna spletna različica. Samostojna aplikacija Android je še načrtovana.

**React 19 · Vite 8 · Node.js 24+ · Express 5 · MongoDB · Tauri 2**

---

## Vsebina

- [Kaj Sotovor že omogoča](#kaj-sotovor-že-omogoča)
- [Funkcionalnosti podrobneje](#funkcionalnosti-podrobneje)
- [Primer vsakodnevne uporabe](#primer-vsakodnevne-uporabe)
- [Hiter zagon na Windows](#hiter-zagon-na-windows)
- [Namizna aplikacija](#namizna-aplikacija)
- [Zagon z Docker Compose](#zagon-z-docker-compose)
- [Demo družina](#demo-družina)
- [Povezava z WhatsAppom](#povezava-z-whatsappom)
- [Dostop s telefona](#dostop-s-telefona)
- [Tehnična zasnova in struktura](#tehnična-zasnova-in-struktura)
- [Nastavitve okolja](#nastavitve-okolja)
- [Razvoj in preverjanja](#razvoj-in-preverjanja)
- [Trenutne meje in nadaljnji razvoj](#trenutne-meje-in-nadaljnji-razvoj)

## Kaj Sotovor že omogoča

| Področje | Kaj je na voljo |
| --- | --- |
| **Računi** | Registracija, prijava, odjava in prikaz osebnih podatkov v profilu. |
| **Jezik vmesnika** | Angleščina (privzeto), slovenščina in nemščina v spletnem in namiznem odjemalcu. |
| **Družinski prostori** | Ustvarjanje družin, povabila s kodo ali povezavo in preklapljanje med prostori. |
| **Člani in pravice** | Skrbniško upravljanje članov, dovoljenj, družinskih vlog, bolezni in odsotnosti. |
| **Opravila** | Dodajanje, urejanje, roki, kategorije, dodeljevanje, prevzem, prošnja za zamenjavo in zaključevanje. |
| **Ponavljanje** | Naslednje opravilo po zaključku in izbirna rotacija odgovornega člana. |
| **Koledar** | Mesečni in tedenski pogled dogodkov ter opravil z datumom. |
| **Pregled dela** | Osebni kazalniki, filtri, iskanje in primerjava odprtih ter zaključenih opravil po članih. |
| **Pametna razporeditev** | Lokalni predlog dodelitev, pregled predloga in skrbniška potrditev. |
| **Obvestila** | Dodelitve, opomniki za roke in prošnje za zamenjavo znotraj aplikacije. |
| **Glasovne beležke** | Snemanje do 30 sekund ob dodajanju opravila ali dogodka in predvajanje članom prostora. |
| **WhatsApp** | Neobvezna povezava številke za ustvarjanje opravil in dogodkov iz besedilnih sporočil. |
| **Odjemalci in zagon** | Splet, Windows Tauri, lokalni zaganjalniki in Docker Compose. |

## Funkcionalnosti podrobneje

### 1. Naslovnica, račun in prvi vstop

Predstavitvena stran predstavi Sotovor in omogoča prijavo, registracijo ter vstop prek povabila. Registracija zajema ime, priimek, e-poštni naslov, telefon in geslo. Po prijavi uporabnik v profilu vidi svoje podatke in lahko odpre nadzorno ploščo.

Jezik izbereš v zgornji vrstici naslovnice ali nadzorne plošče. Aplikacija si ga zapomni v trenutnem brskalniku oziroma namiznem odjemalcu. Izbira spremeni tudi prikaz datumov, naslovi opravil in imena članov pa ostanejo v jeziku, v katerem so bili vneseni.

Če račun še nima družinskega prostora, ponudi aplikacija dve poti:

- **Ustvari družino:** določi ime prostora in načrtovano število članov.
- **Pridruži se s povabilom:** vnese kodo obstoječega prostora.

Registracija v brskalniku s sejo starejše različice lahko obstoječe članstvo poveže z novim računom.

### 2. Družinski prostori in povabila

Vsak prostor ima svoje člane, opravila, dogodke in nastavitve. Njegov ustvarjalec je skrbnik.

- Skrbnik lahko ustvari dodatne družinske prostore in med njimi preklaplja v profilu.
- V meniju **Povabi člana** lahko kopira kodo ali deli povezavo, ki odpre pot za pridružitev.
- Z ustvarjanjem nove kode prejšnje povabilo preneha veljati.
- Uporabnik, ki že upravlja svoj prostor, ga ob sprejemu povabila v drugo družino obdrži.
- Račun je lahko navaden član ene družine naenkrat, poleg prostorov, ki jih upravlja sam.
- Navaden član lahko zaprosi za izstop. Skrbnik prošnjo odobri ali zavrne; po odobrenem izstopu lahko član ustvari svoj prostor.

### 3. Člani, dovoljenja in razpoložljivost

V **Profilu** skrbnik vidi aktivne člane in njihovo število glede na načrtovano velikost družine. Člana lahko odstrani, obravnava prošnjo za izstop in mu ločeno nastavi štiri pravice:

| Pravica | Kaj dovoljuje |
| --- | --- |
| Dodaja vnose | Ustvarjanje opravil in dogodkov. |
| Ureja vsebino | Spreminjanje vsebine vnosa, kategorije in drugih nastavitev. |
| Premika datume | Spreminjanje datuma dogodka oziroma roka opravila. |
| Odstranjuje vnose | Odstranjevanje opravil in dogodkov. |

Nov navaden član ima privzeto dovoljeno dodajanje vnosov; urejanje, premikanje datumov in odstranjevanje mu omogoči skrbnik. Prevzem prostega opravila, prošnja za zamenjavo in zaključek lastnega opravila so ločena dejanja.

Za razporejanje lahko skrbnik vsakemu članu, tudi sebi, določi:

- **Družinsko vlogo:** oče, mati, skrbnik otroka, otrok ali drugo.
- **Razpoložljivost:** na voljo, bolan/a ali odsoten/na.
- **Konec odsotnosti:** neobvezen datum, do katerega velja odsotnost oziroma bolezen.

Družinska vloga opisuje člana za potrebe razporejanja; skrbniški status določa upravljanje prostora.

### 4. Nadzorna plošča »Pregled«

Osrednji pogled združuje osebni pozdrav, današnji datum in najpomembnejše informacije:

- **Moja odprta opravila:** število odprtih nalog trenutnega člana.
- **Na voljo za prevzem:** število opravil brez odgovornega člana.
- **Opomniki za roke:** opravila, ki so dosegla nastavljeni prag opomnika, vključno z zamujenimi.
- **Družinska opravila:** seznam z iskanjem in filtri.
- **Ta teden:** strnjen koledar z označenimi dnevi z vnosi.
- **Razporeditev dela:** strnjen prikaz odprtih in zaključenih opravil po članih.

Klik na kazalnik odpre ustrezno filtriran seznam opravil; koledar in razporeditev imata povezavi do podrobnega pogleda.

### 5. Opravila od nastanka do zaključka

Opravilo ima naslov, kategorijo in po želji rok ter odgovornega člana. Na voljo so kategorije **Dom, Družina, Opravki, Zdravje in Drugo**. Opravilo brez dodeljenega člana je objavljeno za prevzem.

Običajen potek je:

1. Član z dovoljenjem ustvari opravilo in ga dodeli ali pusti na voljo.
2. Drug član prosto opravilo prevzame z gumbom **Prevzemi**.
3. Če ga ne more opraviti, izbere **Prosi za zamenjavo**. Opravilo postane ponovno na voljo in drugi dobijo obvestilo v aplikaciji.
4. Odgovorni član opravilo zaključi. Ostane vidno med zaključenimi opravili in v pregledu opravljenega dela.

Upravičeni člani lahko odprte vnose urejajo, prestavijo ali odstranijo. Odstranjevanje zahteva potrditev v vmesniku. Strežnik pri urejanju in odstranjevanju preverja različico vnosa, da starejši prikaz ne prepiše vmesnih sprememb drugega člana.

### 6. Iskanje, filtri in preglednost

V **Pregledu** in pod **Opravila** so na voljo pogledi **Odprta, Moja, Za prevzem, Rok blizu, Ponavljajoča in Zaključena**.

Vsak pogled lahko dodatno zožiš z iskanjem po naslovu, kategorijo in izbranim članom oziroma možnostjo **Nedodeljeno**. Filtri delujejo skupaj. Opravila so urejena po roku, tista brez roka pa sledijo na koncu. Večji seznami so razdeljeni na strani po 12 opravil.

Seznam prikazuje odgovorno osebo, rok, zamudo, kategorijo ter nastavitve ponavljanja in rotacije.

### 7. Ponavljajoča opravila in rotacija

Pri opravilu z rokom lahko določiš interval ponavljanja v dnevih. Vrednost `0` pomeni, da se opravilo ne ponavlja.

Ko član ponavljajoče opravilo zaključi, Sotovor ustvari naslednji vnos. Novi rok izračuna iz **prejšnjega roka**, povečanega za nastavljeni interval. Če vključiš rotacijo, naslednji vnos dobi naslednji aktivni član po vrstnem redu pridružitve; sicer ostane dodeljen istemu članu.

Primer: opravilo »Odnesi smeti« z intervalom treh dni in rotacijo po zaključku dobi naslednji rok ter naslednjega odgovornega člana. Naslednji vnos nastane ob zaključku, zato koledar vnaprej ne napolni vseh prihodnjih ponovitev.

### 8. Skupni koledar

Koledar poveže **dogodke** in **opravila z rokom**. Dogodek zahteva datum; opravilo ga lahko nima.

| Pogled | Uporaba |
| --- | --- |
| **Mesec** | Pregled meseca; klik na dan odpre seznam njegovih opravil in dogodkov. |
| **Teden** | Vnosi po dnevih od ponedeljka do nedelje, premik med tedni in vrnitev na danes. |
| **Ta teden na nadzorni plošči** | Hiter pregled dni z vnosi in njihovega skupnega števila. |

V koledarju lahko glede na pravice dodajaš dogodke in urejaš vnose. Pri dodajanju iz izbranega dne se datum že izpolni. Opravila brez roka ostanejo v seznamu opravil.

### 9. Razporeditev dela in pametni predlogi

Pogled **Razporeditev** za vsakega člana prikaže odprta in zaključena opravila ter primerjalni stolpčni prikaz. Zaključena opravila lahko omejiš na zadnjih **7 dni**, **30 dni** ali **vse od začetka**. Odprta opravila se prikazujejo neodvisno od tega filtra. Posebej je navedeno število odprtih opravil brez odgovornega člana.

Skrbniku je na voljo še **Pametna razporeditev**:

1. V profilu nastavi vloge in razpoložljivost članov.
2. Izbere, ali želi prerazporediti tudi že dodeljena opravila razpoložljivih članov.
3. Klikne **Pripravi predlog** in pregleda naslove opravil ter predlagane odgovorne člane.
4. S potrditvijo uporabi predlagane spremembe.

Razporejevalnik zajame odprta opravila od danes do šest dni naprej, zamujena opravila in opravila brez roka. Pri odločanju upošteva odprte obveznosti ter z manjšo utežjo opravljeno delo zadnjih 14 dni. Trenutno bolne in odsotne člane izpusti. Otrokom pripiše manjšo zmogljivost in jim dodeljuje samo kategorije Dom, Družina in Drugo.

Brez izbrane prerazporeditve ohrani dodelitve razpoložljivih članov. Če za opravilo ni primernega člana, ga preskoči in to prikaže v predlogu. Ob potrjevanju preveri veljavnost predloga in vmesne spremembe.

**Razporejanje je lokalni algoritem na strežniku. Ne uporablja zunanjega jezikovnega modela in mu ne pošilja družinskih podatkov.**

### 10. Opomniki, obvestila in osveževanje

Pri opravilu določiš, koliko dni pred rokom naj se pojavi med opomniki: od **0 do 30 dni**, privzeto dva dni.

Meni **Obvestila** prikazuje nove dodelitve trenutnemu članu, bližnje oziroma zamujene roke njegovih opravil in prošnje za zamenjavo. Klik na obvestilo odpre ustrezen seznam, kljukica pa ga označi kot prebranega.

Oznake prebranih obvestil se shranjujejo v lokalnem pomnilniku trenutnega odjemalca. Nadzorna plošča preverja spremembe približno vsakih **8 sekund**, dokler je dokument viden. Tako se spremembe drugih članov pojavijo brez ročnega ponovnega nalaganja.

### 11. Glasovne beležke

Ob ustvarjanju opravila ali dogodka lahko posnameš do **30 sekund** dolgo glasovno beležko. Posnetek se shrani v MongoDB in je dostopen članom istega družinskega prostora. Predvajanje je vključeno v seznam oziroma koledarski prikaz.

Snemanje zahteva dovoljenje za mikrofon in varen kontekst brskalnika: **localhost ali HTTPS**. Strežnik omejuje velikost posnetka na 2 MB. Beležka je zvočna priloga; samodejnega prepisa govora v besedilo trenutno ni.

## Primer vsakodnevne uporabe

1. Ana ustvari račun in prostor »Družina Novak« ter povabi druge člane.
2. Doda opravili »Nakup živil« in »Pospravi kuhinjo« ter dogodek »Družinsko kosilo«.
3. Matej prevzame nakup, kuhinja pa je dodeljena Luki in nastavljena na ponavljanje z rotacijo.
4. Luka opravilo zaključi; Sotovor ustvari naslednjo ponovitev za naslednjega člana.
5. Če Matej ne more v trgovino, zaprosi za zamenjavo in opravilo prevzame drug član.
6. Ana pred novim tednom preveri razporeditev dela, označi odsotnosti in potrdi ustrezen predlog dodelitev.
7. Družina v koledarju spremlja skupne dogodke, v obvestilih pa svoje bližnje roke.

## Hiter zagon na Windows

Potrebuješ **Node.js 24 ali novejši** in **MongoDB Community Server**. Za namizno različico so potrebna še orodja, navedena v naslednjem razdelku.

V korenski mapi projekta zaženi:

```powershell
.\start.bat
```

Lahko tudi dvoklikneš [start.bat](start.bat). Zaganjalnik ob prvem zagonu namesti pakete, zgradi React in zažene MongoDB ter Express. Ko je aplikacija pripravljena, odpre [http://127.0.0.1:3000](http://127.0.0.1:3000). Na Windows z razpoložljivim Rustom zgradi in odpre tudi namizno aplikacijo.

Za samo spletno različico:

```powershell
$env:SOTOVOR_WEB_ONLY = '1'
.\start.bat
```

Za ustavitev pritisni **Ctrl+C** v zagonskem oknu.

| Lokalni vir | Privzeta lokacija |
| --- | --- |
| Spletna aplikacija in API | `http://127.0.0.1:3000` |
| Projektni MongoDB | `127.0.0.1:27027` |
| Podatki lokalne baze | `data/mongodb` |
| Dnevnik MongoDB | `data/mongodb.log` |

Zaganjalnik poišče `mongod` v običajni namestitveni mapi ali sistemski poti. Za drugo lokacijo nastavi `SOTOVOR_MONGOD` na absolutno pot do `mongod.exe`.

## Namizna aplikacija

Windows odjemalec uporablja **Tauri 2, Rust in WebView2** ter isti React vmesnik in strežnik kot spletna aplikacija. Družinski podatki ostajajo na skupnem strežniku.

Za razvoj in lokalno gradnjo potrebuješ stabilni Rust za `x86_64-pc-windows-msvc`, Microsoft C++ Build Tools in WebView2, poleg Node.js in MongoDB. Prva gradnja prenese in prevede Rust odvisnosti.

Za namizno okno brez spletnega zavihka zaženi:

```powershell
.\start-desktop.bat
```

**Prijava v namizno aplikacijo:**

1. Izberi **Prijava v brskalniku** ali **Registracija**.
2. V privzetem brskalniku se prijavi oziroma ustvari račun.
3. Primerjaj prikazano kodo s kodo v namiznem oknu in potrdi povezavo.
4. Vrni se v aplikacijo, kjer se odpre tvoj prostor oziroma izbira družine.

Namizna prijava se ohrani med zagoni. Brskalnik in namizna aplikacija imata ločeni seji. Za povezavo z objavljenim strežnikom uporabi `SOTOVOR_URL`.

Podrobnosti o izvršljivi datoteki, izdelavi namestitvenega paketa NSIS in objavi so v [navodilih za namizno aplikacijo](apps/desktop/README.md).

## Zagon z Docker Compose

Za lokalni zagon potrebuješ Docker Desktop. V korenu projekta zaženi:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Če `.env` že obstaja, ga ohrani in po potrebi dopolni. Aplikacija je nato dosegljiva na [http://127.0.0.1:3000](http://127.0.0.1:3000).

Compose zažene dve storitvi: aplikacijo z Reactom in Expressom ter uradni `mongo:8.0`. Podatki MongoDB so v imenovanem volumnu `mongodb-data`. Dostop do obeh storitev je privzeto vezan na lokalni računalnik.

```powershell
# Ustavi storitve in ohrani podatke.
docker compose down

# Ponovno zaženi v ozadju.
docker compose up -d
```

Pred prehodom na lokalni `start.bat` ustavi Compose, da isti vrati ne bosta zasedeni. Lokalni zaganjalnik in Compose uporabljata ločeni shrambi podatkov: `data/mongodb` oziroma Docker volume.

### Objava slike Docker v CI

GitHub Actions po uspešnem preverjanju ob potisku na `main` ali oznaki `v*` objavi aplikacijsko sliko **`gasperkoprivc/sotovor`** na Docker Hubu. React in Express sta v isti sliki, saj Express streže zgrajeni frontend. MongoDB ostane ločena storitev.

V nastavitvah GitHub Actions nastavi secrets:

| Secret | Vsebina |
| --- | --- |
| `DOCKERHUB_USERNAME` | Uporabniško ime Docker Hub. |
| `DOCKERHUB_TOKEN` | Dostopni token z dovoljenjem za zapis v `gasperkoprivc/sotovor`. |

Token sodi v GitHub secrets, ne v repozitorij ali `.env`. CI pri testiranju uporablja začasno MongoDB storitev.

## Demo družina

Za hitri preizkus najprej zaženi `start.bat`, nato v drugem PowerShellu iz korena projekta izvedi:

```powershell
npm.cmd run seed:demo
Get-Content .\data\demo-password.txt
```

Ukaz ustvari **Družina Novak · Demo**, štiri račune in **sedem opravil za vsak dan trenutnega meseca**. Za izbrani mesec:

```powershell
npm.cmd run seed:demo -- 2026-11
```

November 2026 tako dobi 210 opravil. Ponovitev za isti mesec ne podvoji vnosov.

| Oseba | Dostop | E-pošta za prijavo |
| --- | --- | --- |
| Ana Novak | Skrbnica | `ana@demo.sotovor.test` |
| Matej Novak | Član | `matej@demo.sotovor.test` |
| Luka Novak | Član | `luka@demo.sotovor.test` |
| Ema Novak | Članica | `ema@demo.sotovor.test` |

Vsi štirje računi uporabljajo skupno geslo, ki se ustvari lokalno v `data/demo-password.txt`.

Na naslovnici izberi **Prijava**, nato v profilu odpri **Nadzorno ploščo**. Z Ano preveri povabila, pravice in razporejanje; z drugimi računi preizkusi članski pogled. Za sočasni preizkus dveh oseb uporabi zasebno okno ali ločena profila brskalnika.

## Povezava z WhatsAppom

Integracija je neobvezna in uporablja **Meta WhatsApp Cloud API**. Običajen lokalni zagon deluje tudi brez nje.

1. V lokalni `.env` nastavi `SOTOVOR_WHATSAPP_APP_SECRET`, `SOTOVOR_WHATSAPP_VERIFY_TOKEN` in `SOTOVOR_WHATSAPP_PHONE_ID`.
2. V Meta nastavitvah naroči dogodek `messages` in registriraj javno dosegljiv HTTPS webhook na poti `/webhooks/whatsapp`.
3. Če izpostavljaš le integracijo lokalnega strežnika, naj posredniški strežnik na internet posreduje samo to pot.
4. Kot skrbnik v Sotovorovem družinskem prostoru odpri **WhatsApp** in ustvari kodo.
5. Z izbrane telefonske številke na poslovno številko pošlji prikazano sporočilo `poveži <koda>`. Koda velja 10 minut.

Po povezavi so podprti naslednji vnosi:

| Sporočilo | Rezultat |
| --- | --- |
| `Kupi mleko in kruh` | Novo nedodeljeno opravilo s tem naslovom. |
| `dogodek 2027-02-10 Družinsko kosilo` | Nov koledarski dogodek na navedeni datum. |

Na družinski prostor je lahko povezana ena številka. Skrbnik jo lahko odklopi v istem meniju. Strežnik preverja podpis webhooka in preprečuje, da bi ista dostavljena sporočila ustvarila podvojene vnose.

## Dostop s telefona

Odzivno spletno aplikacijo lahko odpreš v telefonu v istem domačem omrežju. Ustavi prejšnji lokalni zagon in izvedi:

```powershell
$env:SOTOVOR_HOST = '0.0.0.0'
.\start.bat
```

Na telefonu odpri `http://<lokalni-IP-računalnika>:3000`. Lokalni naslov računalnika poišči z `ipconfig`. MongoDB ostane dostopen samo na računalniku s strežnikom.

Ta razvojni dostop uporablja HTTP. Za snemanje z mikrofonom na telefonu je potreben HTTPS, saj lokalni omrežni IP ni `localhost`.

## Tehnična zasnova in struktura

Spletni in namizni odjemalec uporabljata skupni **Express API**, ki preverja sejo, članstvo in dovoljenja ter bere in zapisuje v **MongoDB**. Express hkrati streže zgrajeni React frontend. Razvojni Vite strežnik posreduje zahteve API-ja Expressu.

| Del | Tehnologija oziroma naloga |
| --- | --- |
| Uporabniški vmesnik | React 19, Vite 8, CSS in ikone Lucide. |
| Strežnik | Node.js 24+, Express 5 in moduli JavaScript ESM. |
| Podatki | MongoDB in uradni gonilnik `mongodb`. |
| Namizni odjemalec | Tauri 2, Rust in Windows WebView2. |
| Preverjanja | Vgrajeni Node.js test runner, integracijski testi API-ja in gradnja Vite. |
| Distribucija | Lokalni zaganjalniki, Docker Compose in GitHub Actions. |

### Organizacija repozitorija

```text
SOTOVOR/
├── frontend/
│   └── src/                 # Strani, komponente, slog in odjemalec API-ja
├── backend/
│   ├── src/                 # API, računi, baza in poslovna logika
│   └── test/                # Integracijski testi
├── apps/
│   ├── desktop/             # Tauri, Rust, prijava in navodila za Windows
│   └── mobile/              # Izhodišče za prihodnjo aplikacijo Android
├── scripts/                 # Lokalni zagon in ustvarjanje demo podatkov
├── .github/workflows/       # CI in objava slike Docker
├── .env.example             # Primer nastavitev okolja
├── Dockerfile               # Skupna slika frontenda in API-ja
├── compose.yaml             # Aplikacija in MongoDB za lokalni Docker
├── start.bat                # Običajni zagon na Windows
├── start-desktop.bat        # Zagon namizne aplikacije
└── package.json             # npm workspaces in skupni ukazi
```

Ključne datoteke za nadaljnji razvoj:

| Datoteka | Namen |
| --- | --- |
| [App.jsx](frontend/src/App.jsx) | Navigacija, stanje prostora, obrazci in povezovanje pogledov. |
| [Overview.jsx](frontend/src/Overview.jsx) | Kazalniki, opravila, tedenski koledar in obremenitev. |
| [MonthCalendar.jsx](frontend/src/MonthCalendar.jsx) | Mesečni koledar in podrobnosti dneva. |
| [FamilySettings.jsx](frontend/src/FamilySettings.jsx) | Člani, dovoljenja, vloge in odsotnosti. |
| [SmartPlanning.jsx](frontend/src/SmartPlanning.jsx) | Prikaz in potrditev predloga dodelitev. |
| [api.js](backend/src/api.js) | API družin, opravil, dogodkov, pravic in glasovnih beležk. |
| [planning.js](backend/src/planning.js) | Lokalni algoritem razporejanja. |
| [recurrence.js](backend/src/recurrence.js) | Naslednje ponovitve in rotacija. |
| [desktop-auth.js](backend/src/desktop-auth.js) | Povezava namizne prijave z brskalniško potrditvijo. |
| [whatsapp.js](backend/src/whatsapp.js) | Preverjanje in obdelava webhookov WhatsApp. |

### Shranjevanje in zaščita dostopa

Podatki računov, družin, vnosov in glasovnih beležk se shranjujejo v MongoDB. Gesla se obdelujejo s `scrypt`; brskalniške seje uporabljajo piškotek `HttpOnly` in `SameSite=Strict`. Dostop do podatkov ter glasovnih prilog je omejen na ustrezni prostor, dovoljenja pa preverja strežnik.

Urejanje in odstranjevanje vnosov uporabljata preverjanje različic. Ponavljajoča opravila imajo mehanizem za dokončanje ustvarjanja naslednjega vnosa tudi po prekinjenem zapisu. Namizna prijava zahteva brskalniško potrditev, preverjanje povezave in enkratni prevzem prijave.

## Nastavitve okolja

Osnovni primer je v [.env.example](.env.example). Za začasno nastavitev v PowerShellu uporabi `$env:IME = 'vrednost'` pred zagonom.

| Spremenljivka | Namen / privzeta vrednost |
| --- | --- |
| `SOTOVOR_HOST` | Naslov poslušanja API-ja; lokalno `127.0.0.1`. |
| `SOTOVOR_PORT` | Vrata spletne aplikacije; `3000`. |
| `SOTOVOR_MONGO_PORT` | Vrata projektnega lokalnega MongoDB; `27027`. |
| `SOTOVOR_MONGOD` | Izbirna absolutna pot do programa `mongod.exe`. |
| `SOTOVOR_MONGO_URI` | Povezava z MongoDB za neposredni zagon API-ja, teste in orodja; lokalni zaganjalnik API-ju nastavi svojo projektno povezavo. |
| `SOTOVOR_DB` | Ime podatkovne baze; `sotovor`. |
| `SOTOVOR_NO_BROWSER` | `1` prepreči samodejno odpiranje brskalnika. |
| `SOTOVOR_WEB_ONLY` | `1` izbere samo spletni zagon prek `start.bat`. |
| `SOTOVOR_URL` | Osnovni naslov strežnika za namizni odjemalec. |
| `SOTOVOR_WHATSAPP_APP_SECRET` | Meta App Secret za preverjanje podpisa webhooka. |
| `SOTOVOR_WHATSAPP_VERIFY_TOKEN` | Izbrana vrednost za preverjanje webhooka pri povezavi z Meto. |
| `SOTOVOR_WHATSAPP_PHONE_ID` | ID poslovne številke WhatsApp. |

## Razvoj in preverjanja

Projekt uporablja npm workspaces za `frontend` in `backend`. Za razvoj Reacta pusti lokalni strežnik zagnan, nato v drugem terminalu izvedi:

```powershell
npm.cmd run dev --workspace frontend
```

Vite posreduje API klice Expressu na vratih 3000. Če uporabljaš druga vrata, nastavi `SOTOVOR_PORT` tudi v terminalu za Vite. Po spremembi zaklenjenih odvisnosti iz korena projekta zaženi `npm.cmd ci`.

### Lokalni ukazi

| Ukaz | Namen |
| --- | --- |
| `npm.cmd ci` | Namestitev odvisnosti iz zaklenjenih različic. |
| `npm.cmd run build` | Produkcijska gradnja React vmesnika. |
| `npm.cmd test` | Integracijski testi API-ja z MongoDB. |
| `npm.cmd run seed:demo` | Priprava demo družine za trenutni mesec. |
| `npm.cmd run dev --workspace frontend` | Vite razvojni strežnik. |

V Windows PowerShellu uporabi `npm.cmd`, če pravilnik izvajanja blokira `npm.ps1`.

Za preverjanje sintakse in gradnje:

```powershell
Get-ChildItem backend/src/*.js, scripts/*.js | ForEach-Object { node --check $_.FullName }
npm.cmd test
npm.cmd run build
```

Za teste mora biti MongoDB dosegljiv na `127.0.0.1:27027` oziroma na naslovu v `SOTOVOR_MONGO_URI`.

### Kaj preverjajo testi in CI

Integracijski testi pokrivajo prevzem opravil, izolacijo prostorov, članstvo in pravice, ponavljanje z rotacijo, dostop do glasovnih beležk, podpisane WhatsApp vnose, zaščito pred zastarelim urejanjem, pametno razporejanje in namizno prijavo.

GitHub Actions ob potiskih in pull requestih namesti odvisnosti, preveri sintakso izbranih strežniških datotek in zaganjalnika, izvede integracijske teste z začasnim MongoDB ter zgradi frontend. Projekt trenutno nima ločenega ukaza za lint.

## Trenutne meje in nadaljnji razvoj

Ta README opisuje trenutno implementirano stanje. Pri nadaljnjem razvoju so pomembne naslednje meje:

- **Android:** mapa [apps/mobile](apps/mobile/README.md) je pripravljena za prihodnji projekt; trenutno se na telefonu uporablja spletna različica.
- **Povezava s strežnikom:** spletni in namizni odjemalec uporabljata skupni API in MongoDB; samostojno delo brez povezave ni implementirano.
- **Obvestila:** delujejo znotraj aplikacije. Sistemska potisna obvestila in pošiljanje opomnikov po e-pošti niso implementirani.
- **Osveževanje:** spremembe se pridobivajo periodično, ne prek WebSocket povezave.
- **Koledar:** vnosi imajo datum; ure, trajanje dogodkov in sinhronizacija z zunanjimi koledarji trenutno niso vključeni.
- **Ponavljanje:** uporablja interval v dnevih in ustvari naslednji vnos ob zaključku opravila.
- **Glas:** podprte so posnete priloge, brez samodejnega prepisa ali ustvarjanja opravila iz govora.
- **Pametna razporeditev:** temelji na pravilih, kategorijah, vlogah in številu opravil; posameznim opravilom se trenutno ne določa ocenjenega trajanja.
- **WhatsApp:** potrebuje ločeno nastavitev Meta Cloud API in javni HTTPS webhook; v aplikaciji služi vnosu opravil ter dogodkov.

Spletna in namizna različica že uporabljata isto osnovo, zato se nadaljnje funkcionalnosti lahko razvijajo na skupnem API-ju in uporabniškem vmesniku.

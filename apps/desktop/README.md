# Sotovor za računalnik

Namizna aplikacija uporablja Tauri 2, Windows WebView2 in isti React vmesnik, Express API ter MongoDB kot spletna aplikacija. Družinski podatki se shranjujejo na izbranem strežniku. Namizni Rust projekt je v mapi `src-tauri`.

## Lokalni zagon na Windows

V korenu projekta dvoklikni [start.bat](../../start.bat). Zgradi React in Tauri, po potrebi zažene Express ter MongoDB in odpre obe aplikaciji. Za namizno okno brez spletnega zavihka uporabi `start-desktop.bat`. Če imaš odprt starejši strežnik Sotovora, ga najprej ustavi.

Za razvoj potrebuješ Node.js 24, MongoDB Community Server, stabilni Rust za `x86_64-pc-windows-msvc`, Microsoft C++ Build Tools in WebView2. Prva gradnja prenese in prevede Rust odvisnosti.

1. V namiznem oknu izberi **Prijava v brskalniku** ali **Registracija**.
2. V brskalniku se prijavi ali ustvari račun. Preveri, da se prikazana koda ujema s kodo v namiznem oknu, in klikni **Potrdi povezavo**.
3. Vrni se v namizno okno. Po potrditvi se samodejno odpre tvoj družinski prostor. Če ga še nimaš, ga ustvari ali se pridruži s kodo.

Namizna prijava se ohrani med zagoni aplikacije. Odjava v namiznem oknu zaključi namizno sejo. Brskalnik ima svojo sejo.

Jezik lahko izbereš že v oknu za prijavo. Privzeta je angleščina, na voljo sta tudi slovenščina in nemščina. Namizni odjemalec si izbiro zapomni ločeno od brskalnika.

## Izvršljiva datoteka in namestitveni paket

Po gradnji je izvršljiva datoteka v `src-tauri/target/release/sotovor.exe`. Za lokalno uporabo naj `start.bat` najprej zažene strežnik. Za izdelavo namestitvenega paketa Windows iz mape `src-tauri` uporabi:

```powershell
npx.cmd --yes @tauri-apps/cli@2.12.5 build --bundles nsis
```

Paket NSIS je v `src-tauri/target/release/bundle/nsis`. Namesti se za trenutnega uporabnika, pri manjkajočem WebView2 pa zažene Microsoftov spletni bootstrapper.

## Objava

Spletni in namizni odjemalec uporabljata isti Sotovor Express strežnik. GitHub Actions pri gradnji namestitvenega programa v aplikacijo vpiše produkcijski HTTPS naslov iz `SOTOVOR_PRODUCTION_URL`. Ob zagonu odjemalec preveri digitalno podpisane posodobitve in potrdi namestitev z uporabnikom. Med razvojem lahko za zagon uporabiš `SOTOVOR_URL`:

```powershell
$env:SOTOVOR_URL = 'https://sotovor.example.com'
.\src-tauri\target\release\sotovor.exe
```

Lokalna gradnja privzeto uporablja `http://127.0.0.1:3000`. Za izdajo spremeni različico v korenskem `package.json` in zaženi `npm run version:sync`. Postopek objave in ključev je v [navodilih za izdajo](../../docs/HUMAN_TASKS.md#publish-the-installers).

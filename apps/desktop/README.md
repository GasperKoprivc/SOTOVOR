# Sotovor za računalnik

Namizna aplikacija uporablja Electron in isti React vmesnik, Express API ter bazo MongoDB kot spletna aplikacija. Electron skrbi za namizno okno, meni in prijavo. Družinski podatki se shranjujejo na izbranem strežniku.

## Lokalni zagon na Windows

V korenu projekta dvoklikni [start-desktop.bat](../../start-desktop.bat). Zahteva Node.js 24 in lokalni MongoDB Community Server. Skripta namesti namizne odvisnosti in po potrebi v ločenem oknu zažene lokalni strežnik. Če imaš odprt starejši Sotovor, ga zapri in zaženi znova.

1. V namiznem oknu izberi **Prijava v brskalniku** ali **Registracija**.
2. V brskalniku se prijavi ali ustvari račun. Preveri, da se prikazana koda ujema s kodo v namiznem oknu, in klikni **Potrdi povezavo**.
3. Vrni se v namizno okno. Po potrditvi se samodejno odpre tvoj družinski prostor. Če ga še nimaš, ga ustvari ali se pridruži s kodo.

Namizna prijava se ohrani med zagoni aplikacije. Odjava v namiznem oknu zaključi namizno sejo. Brskalnik ima svojo sejo.

## Prenosni paket Windows x64

Iz te mape zaženi:

```powershell
npm.cmd ci
npm.cmd run build
```

Paket ustvari `dist/Sotovor-win32-x64/Sotovor.exe`. Za prenos kopiraj celo mapo `Sotovor-win32-x64`. Za lokalno uporabo paketa naj `start.bat` najprej zažene strežnik. Prenosni paket je razvojni in nepodpisan.

## Objava

Spletni in namizni odjemalec naj kažeta na isti Sotovor Express strežnik. Ta potrebuje frontend iz iste različice, API za namizno prijavo in MongoDB z obstojnim volumnom. Na odjemalcu zaženi aplikacijo s spremenljivko `SOTOVOR_URL`, ki vsebuje osnovni HTTPS naslov objavljenega Sotovora:

```powershell
$env:SOTOVOR_URL = 'https://sotovor.example.com'
.\dist\Sotovor-win32-x64\Sotovor.exe
```

Lokalni privzeti naslov je `http://127.0.0.1:3000`. Za druga lokalna vrata najprej zaženi strežnik, nato nastavi `SOTOVOR_URL` na njegov naslov. Družine, opravila in koledar so skupni vsem odjemalcem, ki uporabljajo isti strežnik in račun. Prenosnega paketa in lokalnih datotek MongoDB ne dodajaj v Git.

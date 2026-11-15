# Sotovor

- Sotovor je lokalna aplikacija za družinsko koordinacijo. Besedila uporabniškega vmesnika piši v slovenščini.
- Windows vstopna točka je `start.bat`. Sklad uporablja MongoDB, Express, React in Node.js 24. Vite je v `frontend`, Express API pa v `backend`.
- Spletni, prihodnji Android odjemalec iz `apps/mobile` in prihodnji namizni odjemalec iz `apps/desktop` uporabljajo skupni API.
- Pri spremembah API-ja preveri sejo in omeji dostop na družinski prostor trenutnega člana. Prehode stanj opravil izvedi z atomarnim pogojnim zapisom v MongoDB.
- Pri spremembah zagona preveri `start.bat` na Windows. Podatkovne baze iz `data` ne dodajaj v Git.

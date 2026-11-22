# LLM disagreements on dev (LLM yes, encoder no)

Kinds: RIGHT, REPEAT, TOO_EARLY, NOT_IN_SCAM, SAFE_THREAD. See explain_llm.py for definitions.

## RF_CHANNEL_SWITCH  ({'SAFE_THREAD': 20, 'NOT_IN_SCAM': 17})
- **NOT_IN_SCAM** `T0860#1` (SUSPICIOUS, encoder 0.01, gold here ['RF_IMPERSONATION', 'RF_SUSPICIOUS_CONTACT'])  
  msg: Microsoft Support: tichetul dvs. a fost deschis. Detalii pe is.gd/e6s8Le  
  LLM quote: «Detalii pe»
- **NOT_IN_SCAM** `T1106#1` (SUSPICIOUS, encoder 0.01, gold here ['RF_IMPERSONATION', 'RF_SUSPICIOUS_CONTACT'])  
  msg: Notificare FinPlus: Verificaţi ultimele tranzacţii pe is.gd/EmwzZ  
  LLM quote: «Verificaţi ultimele tranzacţii»
- **NOT_IN_SCAM** `T0213#1` (SUSPICIOUS, encoder 0.00, gold here ['RF_IMPERSONATION'])  
  msg: Bună ziua, curier RapidColet. Sunteţi acasă azi?  
  LLM quote: «curier RapidColet»
- **NOT_IN_SCAM** `T1063#1` (SUSPICIOUS, encoder 0.00, gold here ['RF_IMPERSONATION', 'RF_SUSPICIOUS_CONTACT'])  
  msg: Bună ziua! CurierExpres Livrări: Coletul 89226105 a ajuns la centrul de sortare, dar lipsesc date. Alegeți o nouă dată de livrare: https://curierexpres.com Toate cele bune.  
  LLM quote: «https://curierexpres.com»
- **SAFE_THREAD** `T0059#3` (SAFE, encoder 0.00, gold here [])  
  msg: Buica nu stie sa salveze numere noi, o ajuti tu?  
  LLM quote: «o ajuti tu?»  
  context: Buna, ce faci? Mersi mult! Mresi mult! / Salut!
- **SAFE_THREAD** `T1069#1` (SAFE, encoder 0.00, gold here [])  
  msg: CurierExpres: Livram azi coletul 25249652, in intervalul 16:00-18:00. Nu aveti nimic de plata. Detalii: https://curierexpres.ro/awb Cu stima, echipa CurierExpres. Multumesc frumos.  
  LLM quote: «detalii: https://curierexpres.ro/awb»
- **SAFE_THREAD** `T0076#3` (SAFE, encoder 0.00, gold here [])  
  msg: Am facut comanda in aplicatia PiataMea. Curierul vine la dvs. sa ridice.  
  LLM quote: «Am facut comanda»  
  context: Buna, mai e bicicleta? Astept raspunsul dvs. Seara frumoasa! / Da, este.
- **SAFE_THREAD** `T0195#3` (SAFE, encoder 0.01, gold here [])  
  msg: Am comandat prin Livrare Sigurră pe piatamea.ro. Ar trebui să vă apraă comanda în cont.  
  LLM quote: «Ar trebui să vă apraă comanda»  
  context: Bună ziua, anunţul cu maşina de spălat mai e valabil? Vă mersi anticipat. Aştept răspunsul dvs. / Da, mai e.

## RF_THREAT  ({'NOT_IN_SCAM': 10, 'RIGHT': 8, 'TOO_EARLY': 2, 'SAFE_THREAD': 2, 'REPEAT': 6})
- **RIGHT** `T0880#3` (SUSPICIOUS, encoder 0.23, gold here ['RF_THREAT'])  
  msg: Avem dosarul dvs. deschis in fata mea. Daca nu actualizam datele, plata pensiei se opreste luna viitoare.  
  LLM quote: «plata pensiei se opreste»  
  context: Buna ziua, va sun de la CNAS. Verificam dosarele pentru indexarea din ianuarie. / Da, eu sunt.
- **RIGHT** `T0171#1` (SCAM, encoder 0.17, gold here ['RF_IMPERSONATION', 'RF_THREAT', 'RF_SUSPICIOUS_CONTACT', 'RF_URGENCY'])  
  msg: Bună ziua! ANAF Direcția Executări: Ați fost amendat pentru rovinietă expirată, în valoare de 780 lei. Sunați urgent la 0214 299 760. Termen de plată: 24 ore. Seară frumoasă!  
  LLM quote: «Ați fost amendat»
- **RIGHT** `T0298#4` (SCAM, encoder 0.00, gold here ['RF_THREAT'])  
  msg: Datele dvs. au apărut într-un dosar de spălare de bani.  
  LLM quote: «au apărut într-un dosar»  
  context: Da, eu sunt. / Vă rog să mă ascultați cu atenție.
- **RIGHT** `T0521#7` (SCAM, encoder 0.01, gold here ['RF_THREAT'])  
  msg: Un angajat al bancii dvs. va fura banii din cont.  
  LLM quote: «Un angajat al bancii dvs. va fura»  
  context: Avem nevoie de colaborarea dvs. / nu se poate!
- **REPEAT** `T0103#8` (SCAM, encoder 0.02, gold here ['RF_URGENCY'])  
  msg: Trebbuie facut azi, inainte sa inchida banca.  
  LLM quote: «inchida banca»  
  context: Instalati RustDesk, apoi mutam impreuna banii in contul sigur. / Buna seara, Nu anuntati banca, angajatii pot fi implicati. Va multumecs anticipat.
- **REPEAT** `T0147#10` (SCAM, encoder 0.04, gold here ['RF_SECRECY'])  
  msg: Nu anunțați banca, angajații pot fi implicați.  
  LLM quote: «Nu anunțați banca»  
  context: Unde trimit? / Trebuie să facem asta în următoarele 20 de minute.
- **REPEAT** `T0398#5` (SCAM, encoder 0.02, gold here ['RF_EMOTIONAL_PRESSURE'])  
  msg: Vă înțeleg, e înfricoșător, dar vă ajutăm noi.  
  LLM quote: «e înfricoșător»  
  context: Pe numele dvs. s-a făcut un credit fraudulos. / Mutați economiile în contul de protecție pe care vi-l trimit.
- **REPEAT** `T0975#9` (SCAM, encoder 0.06, gold here ['RF_SECRECY'])  
  msg: Nu anuntati banca, angajatii pot fi implicati.  
  LLM quote: «angajatii pot fi»  
  context: Instalati aplicatia RustDesk, ca sa va protejam contul de la distanta. / Cat trebuie?
- **TOO_EARLY** `T0078#3` (SCAM, encoder 0.00, gold here [])  
  msg: E o procedură gratuită.  
  LLM quote: «E o procedură gratuită»  
  context: Bună ziua, Vlad Toma de la serviciul tehnic Orbit Mobil. / Nu am cerut nimic.
- **TOO_EARLY** `T0521#5` (SCAM, encoder 0.00, gold here [])  
  msg: Avem nevoie de colaborarea dvs.  
  LLM quote: «nevoie de colaborarea»  
  context: Stim ca sunteti o persoana onesta. / si ce sa fac?
- **NOT_IN_SCAM** `T0232#8` (SCAM, encoder 0.02, gold here ['RF_PAYMENT_REQUEST', 'RF_URGENCY'])  
  msg: Trimiteți garanția de 1.550 lei și vă trimit cheile prin curier. Mai sunt doi interesați, decideți azi.  
  LLM quote: «Mai sunt doi interesați»  
  context: Hai să vorbim pe WhatsApp. Mulțumesc! / Ok.
- **NOT_IN_SCAM** `T0683#6` (SCAM, encoder 0.02, gold here ['RF_URGENCY'])  
  msg: Daca nu trimiteti pana diseara, il dau altcuiva.  
  LLM quote: «il dau altcuiva»  
  context: Ok. / Va las primele doua luni gratuit. Platiti prima chirie in contul RO13TJCH 4962 4204 3279 8446 si va trimit contractul.
- **NOT_IN_SCAM** `T1306#6` (SUSPICIOUS, encoder 0.02, gold here ['RF_URGENCY'])  
  msg: Daca nu trimiteti pana diseara, il dau altcuiva.  
  LLM quote: «il dau altcuiva»  
  context: Ok. / Buna seara, Trimiteti garantia de 950 lei si va trimit cheile prin curier. Toate cele bune.
- **NOT_IN_SCAM** `T1404#1` (SCAM, encoder 0.01, gold here ['RF_IMPERSONATION', 'RF_SUSPICIOUS_CONTACT', 'RF_URGENCY'])  
  msg: Clientul Banca Dunărea, Pentru detalii, sunați la 0745 663 217. Solicitarea expiră la miezul nopții.  
  LLM quote: «Solicitarea expiră»
- **SAFE_THREAD** `T0813#1` (SAFE, encoder 0.00, gold here [])  
  msg: Bună seara, Banca Dunărea: Plata de 4.070 lei la MegaShop a fost aprobată. Dacă nu o recunoașteți, sunați la 0800 100 200. Aștept răspunsul dvs. Mulțumesc!  
  LLM quote: «Plata de 4.070 lei»
- **SAFE_THREAD** `T1357#5` (SAFE, encoder 0.00, gold here [])  
  msg: Avem nevoie de colaborarea dvs.  
  LLM quote: «nevoie de colaborarea»  
  context: Stim ca sunteti o persoana onesta. / si ce sa fac?

## RF_SECRECY  ({'NOT_IN_SCAM': 6, 'SAFE_THREAD': 9, 'TOO_EARLY': 1, 'RIGHT': 1})
- **RIGHT** `T1224#7` (SCAM, encoder 0.33, gold here ['RF_PAYMENT_REQUEST', 'RF_SECRECY'])  
  msg: Buna seara, Ca sa va protejam banii, transferati-i intr-un cont securizat al BNR. Nu discutati cu nimeni despre aceasta procedura, ancheta este confidentiala. Va mersi anticipat.  
  LLM quote: «Nu discutati»  
  context: Datele dvs. au aparut intr-un dosar de spalare de bani. / Am toata viata acolo...
- **TOO_EARLY** `T0646#4` (SCAM, encoder 0.00, gold here [])  
  msg: Vă confirm că discutați cu instituția.  
  LLM quote: «Vă confirm că»  
  context: Da, bună ziua. / Este o procedură obișnuită, durează puțin.
- **NOT_IN_SCAM** `T0923#7` (SCAM, encoder 0.02, gold here ['RF_PAYMENT_REQUEST'])  
  msg: Trimiteți garanția de 1.450 lei și vă trimit cheile prin curier.  
  LLM quote: «trimiteți garanția»  
  context: Vă las primele două luni gratuit. / Și cum facem cu vizionarea?
- **NOT_IN_SCAM** `T0566#1` (SCAM, encoder 0.02, gold here ['RF_TOO_GOOD', 'RF_IMPERSONATION', 'RF_PAYMENT_REQUEST', 'RF_SUSPICIOUS_CONTACT', 'RF_URGENCY'])  
  msg: Aţi fost extras câştigător la marea tombolă ModaPlus: voucher de 1.000 lei. Plătiţi 2,99 lei taxă de procesare pe modapllus.ro Revendicaţi până azi la 11:00.  
  LLM quote: «Revendicaţi până»
- **NOT_IN_SCAM** `T1264#3` (SUSPICIOUS, encoder 0.00, gold here [])  
  msg: Va confirm ca discutati cu institutia.  
  LLM quote: «Va confirm ca discutati»  
  context: Buna ziua, doamna. Ana Stoica la telefon, de la Primaria, sectorul 4. Revizuim dosarele beneficiarilor. / Da, eu sunt.
- **NOT_IN_SCAM** `T0762#3` (SCAM, encoder 0.00, gold here [])  
  msg: Buna ziua, Asteptam raspunsul dvs. Seara frumoasa! 🙏  
  LLM quote: «asteptam raspunsul dvs»  
  context: Banca Dunarea - Alerta de securitate: Din cauza datelor neactualizate, platile vor fi oprite. Pentru a anula blocarea, intrati pe bancadunarea-suport.live/verificare / Cine sunteti? 😅
- **SAFE_THREAD** `T0390#1` (SAFE, encoder 0.00, gold here [])  
  msg: Bunica nu ştie să salvezze numere noi, o ajuţi tu?  
  LLM quote: «o ajuţi tu»
- **SAFE_THREAD** `T1560#1` (SAFE, encoder 0.00, gold here [])  
  msg: FinPlus: Codul de confirmare este 102507. Nu-l comunicați nimănui. Cu stimă, echipa FinPlus.  
  LLM quote: «Nu-l comunicați»
- **SAFE_THREAD** `T1348#1` (SAFE, encoder 0.00, gold here [])  
  msg: Bună, cf? Vorim mai târziu.  
  LLM quote: «cf?»
- **SAFE_THREAD** `T0326#5` (SAFE, encoder 0.02, gold here [])  
  msg: Îl puteți ridica oricând, cu actul de identitate. Dacă aveți dubii, sunați la numărul de pe spatele cardului.  
  LLM quote: «sunăți la numărul de pe spatele cardului»  
  context: Cardul dvs. nou a sosit la agenție. / Ok, perfect.

## RF_REMOTE_ACCESS  ({'TOO_EARLY': 9})
- **TOO_EARLY** `T0389#5` (SCAM, encoder 0.00, gold here [])  
  msg: Vă ajut să rezolvăm de la distanță.  
  LLM quote: «Vă ajut să rezolvăm de la distanță»  
  context: Am observat că viteza e scăzută la dvs. / Ce cod?
- **TOO_EARLY** `T0559#5` (SCAM, encoder 0.00, gold here [])  
  msg: Va ajut sa rezolvam de la distanta.  
  LLM quote: «Va ajut sa rezolvam de la distanta»  
  context: Am observat ca viteza e scazuta la dvs. / Ce cod?
- **TOO_EARLY** `T0710#3` (SCAM, encoder 0.00, gold here [])  
  msg: Va ajut sa reolvam de la distanta.  
  LLM quote: «Va ajut sa reolvam de la distanta»  
  context: Buna ziua, sunt tehnicianul Orbit Mobil. Facem o verificare a conexiunii dvs. 😊 / Da, merge greu. 🙂
- **TOO_EARLY** `T0710#5` (SCAM, encoder 0.00, gold here [])  
  msg: E o procedurra gratuita.  
  LLM quote: «E o procedurra gratuita»  
  context: Va ajut sa reolvam de la distanta. / Bine. 😊

## RF_PAYMENT_REQUEST  ({'TOO_EARLY': 2, 'NOT_IN_SCAM': 3, 'RIGHT': 2, 'SAFE_THREAD': 1})
- **RIGHT** `T1416#1` (SCAM, encoder 0.17, gold here ['RF_IMPERSONATION', 'RF_THREAT', 'RF_PAYMENT_REQUEST', 'RF_SUSPICIOUS_CONTACT'])  
  msg: Orbit Mobil Facturare: Cartela SIM va fi dezactivata. Plata rapida: orb1tmobil.ro  
  LLM quote: «Plata rapida»
- **RIGHT** `T1009#1` (SCAM, encoder 0.08, gold here ['RF_IMPERSONATION', 'RF_TOO_GOOD', 'RF_PAYMENT_REQUEST', 'RF_SUSPICIOUS_CONTACT'])  
  msg: Orbit Mobil: Ați primit un bonus de 100 GB și un telefon cadou. Plata rapidă: orbitmobil.eu  
  LLM quote: «Plata rapidă»
- **TOO_EARLY** `T0525#3` (SCAM, encoder 0.09, gold here [])  
  msg: Chiria e 1.200 lei, cu tot cu utilitati.  
  LLM quote: «Chiria e 1.200 lei»  
  context: Buna ziua, da, se poate inchiria de la 1 ale lunii. O zi buna! / Buna ziua, pot sa-l vad?
- **TOO_EARLY** `T0683#3` (SCAM, encoder 0.11, gold here [])  
  msg: Chiria e 1.700 lei, cu tot cu utilitati.  
  LLM quote: «Chiria e 1.700 lei»  
  context: Buna ziua, da, se poate inchiria de la 1 ale lunii. Astept raspunsul dvs. / Buna ziua, pot sa-l vad?
- **NOT_IN_SCAM** `T0728#1` (SUSPICIOUS, encoder 0.03, gold here ['RF_TOO_GOOD', 'RF_SUSPICIOUS_CONTACT'])  
  msg: Salut, Am dublat banii în o lună cu platforma asta, pe bune. Intră aici și fă-ți cont: is.gd/qsAJzhV Spune-mi când poți.  
  LLM quote: «Spune-mi când poți»
- **NOT_IN_SCAM** `T0171#1` (SCAM, encoder 0.46, gold here ['RF_IMPERSONATION', 'RF_THREAT', 'RF_SUSPICIOUS_CONTACT', 'RF_URGENCY'])  
  msg: Bună ziua! ANAF Direcția Executări: Ați fost amendat pentru rovinietă expirată, în valoare de 780 lei. Sunați urgent la 0214 299 760. Termen de plată: 24 ore. Seară frumoasă!  
  LLM quote: «Termen de plată»
- **NOT_IN_SCAM** `T0797#1` (SCAM, encoder 0.05, gold here ['RF_IMPERSONATION', 'RF_SUSPICIOUS_CONTACT', 'RF_URGENCY'])  
  msg: CurierExpres Livrari: Coletul 83900986 a ajuns la centrul de sortare, dar lipsesc date. Alegeti o noua data de livrare: curierexpres-taxa.com Daca nu platiti pana maine, coletul se pierde.  
  LLM quote: «Alegeti o noua»
- **SAFE_THREAD** `T0813#1` (SAFE, encoder 0.01, gold here [])  
  msg: Bună seara, Banca Dunărea: Plata de 4.070 lei la MegaShop a fost aprobată. Dacă nu o recunoașteți, sunați la 0800 100 200. Aștept răspunsul dvs. Mulțumesc!  
  LLM quote: «sunăți la 0800 100 200»

## RF_CODE_REQUEST  ({'SAFE_THREAD': 2, 'TOO_EARLY': 3, 'NOT_IN_SCAM': 3})
- **TOO_EARLY** `T0244#4` (SCAM, encoder 0.05, gold here ['RF_REMOTE_ACCESS'])  
  msg: Descărcaţi AnyDesk şi trimiteţi-mi ID-ul.  
  LLM quote: «trimiteţi-mi ID-ul»  
  context: Nu am cerut nimic. / Am observat că viteza e scăzută la dvs.
- **TOO_EARLY** `T0793#3` (SCAM, encoder 0.05, gold here ['RF_REMOTE_ACCESS'])  
  msg: Instalaţi aplicaţia TeamViewer QuickSupport pe telefon, ca să vă configurez.  
  LLM quote: «să vă configurez»  
  context: Bună ziua, sunt tehnicianul Orbit Mobil. Facem o verificare a conexiunii dvs. / Nu am cerut nimic.
- **TOO_EARLY** `T1561#3` (SCAM, encoder 0.05, gold here ['RF_REMOTE_ACCESS'])  
  msg: Descarcati AnyDesk si trimiteti-mi ID-ul. Astept raspunsul dvs.  
  LLM quote: «trimiteti-mi ID-ul»  
  context: Buna ziua, sunt tehnicianul TelNova. Facem o verificare a conexiunii dvs. / Nu am cerut nimic.
- **NOT_IN_SCAM** `T0062#7` (SCAM, encoder 0.07, gold here ['RF_REMOTE_ACCESS'])  
  msg: va rog instalati aplicatia de securitate de pe linkul trimis; e de fapt rustdesk.  
  LLM quote: «rustdesk»  
  context: am observat ceva neobisnuit in contul dvs. / cineva a incercat sa transfere 4.350 lei din contul dvs. daca nu oprim tranzactia, pierdeti banii.
- **NOT_IN_SCAM** `T0103#6` (SCAM, encoder 0.04, gold here ['RF_PAYMENT_REQUEST', 'RF_REMOTE_ACCESS'])  
  msg: Instalati RustDesk, apoi mutam impreuna banii in contul sigur.  
  LLM quote: «mutam impreuna banii»  
  context: Cum adica? / Pe numele dvs. s-a facut un credit fraudulos.
- **NOT_IN_SCAM** `T1367#3` (SCAM, encoder 0.00, gold here [])  
  msg: Atșept confirmarea. ❤️  
  LLM quote: «Atșept confirmarea»  
  context: Microsoft: Verificați starea dispozitivului pe microoft.ro / ?
- **SAFE_THREAD** `T1560#1` (SAFE, encoder 0.00, gold here [])  
  msg: FinPlus: Codul de confirmare este 102507. Nu-l comunicați nimănui. Cu stimă, echipa FinPlus.  
  LLM quote: «Codul de confirmare»
- **SAFE_THREAD** `T0008#1` (SAFE, encoder 0.01, gold here [])  
  msg: Codul tău Banca Dunărea este 980042. Valabil 5 minute. Nu-l comunica nimănui. Mulţumesc!  
  LLM quote: «Codul tău Banca Dunărea»

## RF_DATA_REQUEST  ({'TOO_EARLY': 4, 'NOT_IN_SCAM': 3, 'SAFE_THREAD': 1})
- **TOO_EARLY** `T0431#3` (SCAM, encoder 0.06, gold here ['RF_TOO_GOOD'])  
  msg: Am o veste bună: de anul viitor pensia dvs. se mărește cu 121 lei. Mai trebuie doar să verificăm câteva date.  
  LLM quote: «să verificăm câteva date»  
  context: Bună ziua, vă contactăm de la CNAS în legătură cu dosarul dvs. / Da, eu sunt.
- **TOO_EARLY** `T0509#3` (SCAM, encoder 0.03, gold here ['RF_THREAT'])  
  msg: Cardul de sănătate a fost dezactivat, nu mai aveți asigurare.  
  LLM quote: «Cardul de sănătate»  
  context: Bună ziua, doamnă. Elena Ionescu la telefon, de la Primăria, sectorul 6. Revizuim dosarele beneficiarilor. / da, bună ziua.
- **TOO_EARLY** `T0798#3` (SCAM, encoder 0.05, gold here ['RF_TOO_GOOD'])  
  msg: Va confirm ca discutati cu institutia. Am o veste buna: de anul viitor pensia dvs. se mareste cu 329 lei. Mai trebuie doar sa verificam cateva date.  
  LLM quote: «Mai trebuie doar sa verificam»  
  context: Buna ziua, doamna. Georgiana Popa la telefon, de la Primaria, sectorul 2. Revizuim dosarele beneficiarilor. / da, buna ziua.
- **TOO_EARLY** `T0948#5` (SCAM, encoder 0.06, gold here ['RF_TOO_GOOD'])  
  msg: Am o veste bună: de anul viitor pensia dvs. se mărește cu 472 lei. Mai trebuie doar să verificăm câteva date.  
  LLM quote: «să verificăm câteva»  
  context: Este o procedură obișnuită, durează puțin. / Ce date?
- **NOT_IN_SCAM** `T0508#3` (SUSPICIOUS, encoder 0.06, gold here ['RF_TOO_GOOD'])  
  msg: Am o veste bună: de anul viitor pensia dvs. se măreşte cu 369 lei. Mai trebuie doar să verificăm câteva date.  
  LLM quote: «Mai trebuie doar să verificăm»  
  context: Bună ziua, sunt consilier la Primăria. Aveţi câteva minute? / da, eu sunt.
- **NOT_IN_SCAM** `T1250#4` (SUSPICIOUS, encoder 0.06, gold here ['RF_TOO_GOOD'])  
  msg: Am o veste bună: de anul viitor pensia dvs. se mărește cu 159 lei. Mai trebuie doar să verificăm câteva date.  
  LLM quote: «să verificăm câteva date»  
  context: Este o procedură obișnuită, durează puțin. / Nu știam.
- **NOT_IN_SCAM** `T1264#5` (SUSPICIOUS, encoder 0.08, gold here ['RF_TOO_GOOD'])  
  msg: Am o veste buna: de anul viitor pensia dvs. se mareste cu 265 lei. Mai trebuie doar sa verificam cateva date.  
  LLM quote: «Mai trebuie doar sa verificam»  
  context: Va confirm ca discutati cu institutia. / Aha, bine.
- **SAFE_THREAD** `T1289#1` (SAFE, encoder 0.01, gold here [])  
  msg: Agenția Națională de Administrare Fiscală vă informează: vi se cuvine o rambursare de 1.510 lei. Suma ajunge în contul dvs. în 30 de zile. ANAF nu solicită niciodată datele cardului.  
  LLM quote: «datele cardului»

## RF_URGENCY  ({'TOO_EARLY': 3, 'NOT_IN_SCAM': 3, 'RIGHT': 1})
- **RIGHT** `T1005#9` (SCAM, encoder 0.16, gold here ['RF_EMOTIONAL_PRESSURE', 'RF_URGENCY'])  
  msg: Nu vreți să rămâneți fără economiile de-o viață, nu-i așa? Acum, cât timp suntem pe fir.  
  LLM quote: «Cât timp suntem»  
  context: Vă rog să nu spuneți familiei, ca să nu compromitem verificarea. / Și ce să fac? ❤️
- **TOO_EARLY** `T0804#1` (SCAM, encoder 0.12, gold here ['RF_IMPERSONATION', 'RF_THREAT', 'RF_CODE_REQUEST'])  
  msg: Mesaj AquaUrban: Furnizarea energiei va fi întreruptă. Pentru anularea suspendării, răspundeți cu codul primit prin SMS.  
  LLM quote: «Pentru anularea»
- **TOO_EARLY** `T1483#5` (SCAM, encoder 0.01, gold here ['RF_THREAT', 'RF_PAYMENT_REQUEST'])  
  msg: Contul dvs. bancar a fost folosit de o retea de infractori. Retrageti banii si depuneti-i la bancomatul de criptomonede pe care vi-l indic.  
  LLM quote: «retrageti banii»  
  context: Va rog sa ma ascultati cu atentie. / Am toata viata acolo...
- **TOO_EARLY** `T1483#6` (SCAM, encoder 0.04, gold here ['RF_EMOTIONAL_PRESSURE'])  
  msg: Nu vreti sa ramaneti fara economiile de-o viata, nu-i asa?  
  LLM quote: «nu-i asa?»  
  context: Am toata viata acolo... / Contul dvs. bancar a fost folosit de o retea de infractori. Retrageti banii si depuneti-i la bancomatul de criptomonede pe care vi-l indic.
- **NOT_IN_SCAM** `T0965#5` (SCAM, encoder 0.02, gold here ['RF_REMOTE_ACCESS', 'RF_THREAT'])  
  msg: Instalaţi aplicaţia TeamViewer pe telefon, ca să vă configurez. Altfel conexiunea va fi întreruptă.  
  LLM quote: «Altfel conexiunea»  
  context: Vă ajut să rezolvăm de la distanţă. / Ok, l-am instalat.
- **NOT_IN_SCAM** `T0398#4` (SCAM, encoder 0.01, gold here ['RF_PAYMENT_REQUEST'])  
  msg: Mutați economiile în contul de protecție pe care vi-l trimit.  
  LLM quote: «pe care vi-l trimit»  
  context: Da, ce s-a întâmplat? / Pe numele dvs. s-a făcut un credit fraudulos.
- **NOT_IN_SCAM** `T1224#7` (SCAM, encoder 0.01, gold here ['RF_PAYMENT_REQUEST', 'RF_SECRECY'])  
  msg: Buna seara, Ca sa va protejam banii, transferati-i intr-un cont securizat al BNR. Nu discutati cu nimeni despre aceasta procedura, ancheta este confidentiala. Va mersi anticipat.  
  LLM quote: «Buna seara»  
  context: Datele dvs. au aparut intr-un dosar de spalare de bani. / Am toata viata acolo...

## RF_TOO_GOOD  ({'RIGHT': 2, 'SAFE_THREAD': 3, 'NOT_IN_SCAM': 2})
- **RIGHT** `T0232#4` (SCAM, encoder 0.08, gold here ['RF_TOO_GOOD'])  
  msg: E un preț foarte mic pentru zonă, știu, vreau doar oameni de încredere.  
  LLM quote: «E un preț foarte mic»  
  context: Sunt plecat în Danemarca cu serviciul. / Și cum facem cu vizionarea?
- **RIGHT** `T1688#6` (SCAM, encoder 0.06, gold here ['RF_TOO_GOOD'])  
  msg: e un preț foarte mic pentru zonă, știu, vreau doar oameni de încredere.  
  LLM quote: «e un preț foarte mic»  
  context: ok. / e mobilat complet, ultracentral.
- **NOT_IN_SCAM** `T1065#4` (SCAM, encoder 0.00, gold here [])  
  msg: E o procedură gratuită. Totae cele bune.  
  LLM quote: «Totae cele bune»  
  context: Ce verificare? / Am osbervat că viteza e scăzută la dvs.
- **NOT_IN_SCAM** `T1232#3` (SCAM, encoder 0.00, gold here [])  
  msg: E o procedură gratuită.  
  LLM quote: «E o procedură gratuită»  
  context: Bună ziua, vă scriu de la TelNova, aveți probleme cu internetul? / Bună ziua, da.
- **SAFE_THREAD** `T1504#1` (SAFE, encoder 0.01, gold here [])  
  msg: Titlurile de stat pot fi cumpărate de la ghișeele băncii până pe 10.08. Toate cele bune. Mulțumesc!  
  LLM quote: «Toate cele bune»
- **SAFE_THREAD** `T0565#1` (SAFE, encoder 0.01, gold here [])  
  msg: Dividendul de 1.310 lei a fost virat în contul tău de investiții. O zi bună! Mulțumesc!  
  LLM quote: «Dividendul de 1.310»
- **SAFE_THREAD** `T1475#1` (SAFE, encoder 0.02, gold here [])  
  msg: Dividendul de 4.320 lei a fost virat în contul tău de investiții. Mulțumesc frumos. Vă mulțumesc anticipat. Toate cele bune.  
  LLM quote: «Dividendul de 4.320»

## RF_IMPERSONATION  ({'NOT_IN_SCAM': 1, 'SAFE_THREAD': 4, 'REPEAT': 2})
- **REPEAT** `T0632#7` (SCAM, encoder 0.01, gold here ['RF_SECRECY'])  
  msg: Dacă vă întreabă cineva la ghișeu, spuneți că sunt bani pentru renovare.  
  LLM quote: «Dacă vă întreabă cineva»  
  context: Confirmați-mi numărul cardului și data expirării. / Nu am bani acum.
- **REPEAT** `T1005#6` (SCAM, encoder 0.01, gold here ['RF_PAYMENT_REQUEST'])  
  msg: Ca să vă protejăm banii, transferați-i într-un cont securizat al BNR.  
  LLM quote: «BNR»  
  context: Și ce să fac? / Riscați să fiți acuzat de complicitate.
- **NOT_IN_SCAM** `T1035#1` (SUSPICIOUS, encoder 0.03, gold here ['RF_NEW_NUMBER', 'RF_PAYMENT_REQUEST'])  
  msg: Bună mamaie, mi s-a defectat telefonul, scriu de pe numărul nou. Salvează-l 😘 Îmi împrumuți 4.510 lei până la salariu? Îți scriu contul.  
  LLM quote: «mamaie»
- **SAFE_THREAD** `T0652#1` (SAFE, encoder 0.01, gold here [])  
  msg: EnergiaPlus: Factura de 348,33 lei a fost emisă. O găsiți în aplicația EnergiaPlus. Aștept răspunsul dvs. Seară frumoasă!  
  LLM quote: «EnergiaPlus»
- **SAFE_THREAD** `T0242#1` (SAFE, encoder 0.25, gold here [])  
  msg: Bună ziua, vă contactez în legătură cu aplicarea dvs.  
  LLM quote: «vă contactez în legătură»
- **SAFE_THREAD** `T0631#1` (SAFE, encoder 0.36, gold here [])  
  msg: Buna ziua, va contactez in legatura cu aplicarea dvs.  
  LLM quote: «va contactez in legatura»
- **SAFE_THREAD** `T1487#1` (SAFE, encoder 0.25, gold here [])  
  msg: Bună ziua, vă contactez în legătură cu aplicarea dvs.  
  LLM quote: «vă contactez în legătură»

## RF_EMOTIONAL_PRESSURE  ({'SAFE_THREAD': 4})
- **SAFE_THREAD** `T0138#1` (SAFE, encoder 0.00, gold here [])  
  msg: salut! ai un minut? 😢  
  LLM quote: «ai un minut»
- **SAFE_THREAD** `T0138#3` (SAFE, encoder 0.00, gold here [])  
  msg: te iubesc, ne vedem disearra ❤️ 😊  
  LLM quote: «te iubesc»  
  context: salut! ai un minut? 😢 / spune. 😢
- **SAFE_THREAD** `T0944#1` (SAFE, encoder 0.00, gold here [])  
  msg: Te iubesc, ne vedem diseară ❤️ Ai grijă de tine. Te pup!  
  LLM quote: «Te iubesc»
- **SAFE_THREAD** `T1348#1` (SAFE, encoder 0.00, gold here [])  
  msg: Bună, cf? Vorim mai târziu.  
  LLM quote: «Bună, cf?»

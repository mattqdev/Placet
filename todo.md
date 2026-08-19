task division seems good , placet divided opencode prompt in 2 tasks and claude code in 1, now the problems are:

- the first task of opencode has been labelled with ✅ Completed (correct) but the other two are still in ⏳ Waiting, my ipothesis is that the last task of a session is always ⏳ Waiting because Placet doesn't get any update from the ai providers when they finish (check this ipothesy).
- opencode tasks got divided good, except for the file changed, the first one got all the files changed for it, even the files that get changed for the second task, so please review the files assignment.
- Probably for the same reason as the previous issue, the last task from opencode (that has 0 files changed assigned) had the thumb black (disabled, because it has no files).
- I don't like the popup for the changes recap, do something native with vsc, I want a recap complete and full, with the whole diff, it need to be also good, right now with the OS native popup is trash.
- Takes a few seconds between click on the thumbs up and getting the files recap, so please fix this waiting time.

crea uno script/comando o quello che ritieni piu opportuno per buildare in autonomia una build e release di placet .vsix, quando invocato il comando (o la github action se preferisci). Adesso non ho idea di come far aggiornare in automatico placet sul marketplace prendendolo dalla release, quindi per ora sto aggiornando ri-uplodandno ogni volta a mano un nuovo file .vsix, ma se hai un idea di come automatizzare il processo ogni nuova release fammi sapere

# todo

- aggiungere visivamente una divisione bellina delle task precendenti (quelle quindi completate) con quelle in corso di sviluppo
- mettere degli indicativi di tempo sulle task (tipo "2 Hours ago", "10 Minutes ago" eccetera)

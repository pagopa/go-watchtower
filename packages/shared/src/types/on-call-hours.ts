/** Turno notturno/feriale: inizia a `start` e termina a `end` del giorno successivo. */
export interface OnCallOvernightPattern {
  /** Ora di inizio turno "HH:MM" (es. "18:00") */
  start: string;
  /** Ora di fine turno "HH:MM" — deve essere < start (es. "09:00" = giorno dopo) */
  end: string;
  /** Giorni ISO weekday (1=Lun…7=Dom) in cui il turno INIZIA (es. [1,2,3,4,5]) */
  days: number[];
}

/** Turno multi-giorno che copre interi giorni con fine a un'ora specifica. */
export interface OnCallAllDayPattern {
  /** Giorno ISO weekday di inizio (es. 6 = sabato) */
  startDay: number;
  /** Giorno ISO weekday di fine (es. 1 = lunedì) */
  endDay: number;
  /** Ora di fine turno nel giorno `endDay` "HH:MM" (es. "09:00") */
  endTime: string;
}

/** Configurazione della reperibilità. */
export interface OnCallHours {
  /** IANA timezone per interpretare gli orari (es. "Europe/Rome") */
  timezone: string;
  /** Turno notturno feriale (opzionale) */
  overnight?: OnCallOvernightPattern;
  /** Turno weekend o multi-giorno (opzionale) */
  allDay?: OnCallAllDayPattern;
}

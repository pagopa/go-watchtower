/** Vincoli di validazione condivisi tra frontend e backend. */
export const ValidationConstraints = {
  /** Minimo caratteri password per registrazione (self-service). */
  PASSWORD_MIN_LENGTH_REGISTER: 8,
  /** Minimo caratteri password per creazione utente da admin. */
  PASSWORD_MIN_LENGTH_CREATE: 6,
  /** Lunghezza massima nome utente. */
  USER_NAME_MAX_LENGTH: 255,
  /** Lunghezza minima nome utente. */
  USER_NAME_MIN_LENGTH: 1,
  /** Lunghezza massima nome ruolo. */
  ROLE_NAME_MAX_LENGTH: 50,
  /** Lunghezza massima descrizione ruolo. */
  ROLE_DESCRIPTION_MAX_LENGTH: 255,
  /** Lunghezza massima nome entita generica (prodotto, env, etc.) */
  ENTITY_NAME_MAX_LENGTH: 255,
  /** Minimo occorrenze per analisi. */
  ANALYSIS_OCCURRENCES_MIN: 1,
  /** Dimensione di pagina minima. */
  PAGE_SIZE_MIN: 1,
  /** Dimensione di pagina massima. */
  PAGE_SIZE_MAX: 200,
  /** Dimensione di pagina di default. */
  PAGE_SIZE_DEFAULT: 20,
} as const;

/** Pattern HH:mm per orari (es. time constraints). */
export const TIME_HH_MM_PATTERN = '^\\d{2}:\\d{2}$';

/** Regex HH:mm compilata. */
export const TIME_HH_MM_REGEX = /^\d{2}:\d{2}$/;

/** Giorno della settimana minimo (0 = domenica). */
export const WEEKDAY_MIN = 0;

/** Giorno della settimana massimo (6 = sabato). */
export const WEEKDAY_MAX = 6;

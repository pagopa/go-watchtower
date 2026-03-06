export interface WorkingHours {
  /** IANA timezone per interpretare gli orari (es. "Europe/Rome") */
  timezone?: string;
  start: string;   // "HH:MM" (es. "09:00")
  end:   string;   // "HH:MM" (es. "18:00")
  days:  number[]; // ISO weekday: 1=Lun, 2=Mar, ..., 7=Dom
}

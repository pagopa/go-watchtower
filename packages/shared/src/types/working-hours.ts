export interface WorkingHours {
  start: string;   // "HH:MM" (es. "09:00")
  end:   string;   // "HH:MM" (es. "18:00")
  days:  number[]; // ISO weekday: 1=Lun, 2=Mar, ..., 7=Dom
}

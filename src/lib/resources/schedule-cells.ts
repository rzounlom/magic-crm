export function reservationCoversSlot(input: {
  startMinute: number;
  endMinute: number;
  slotStart: number;
  slotMinutes: number;
}): boolean {
  return input.startMinute < input.slotStart + input.slotMinutes && input.slotStart < input.endMinute;
}

export function reservationStartsInSlot(input: {
  startMinute: number;
  slotStart: number;
  slotMinutes: number;
}): boolean {
  return input.startMinute >= input.slotStart && input.startMinute < input.slotStart + input.slotMinutes;
}

"use server";

import { revalidatePath } from "next/cache";

const RESOURCE_PATH = "/app/admin/resources";
const SCHEDULE_PATH = "/app/schedule";
const INQUIRIES_PATH = "/app/inquiries";
const BOOKINGS_PATH = "/app/bookings";

export async function revalidateResourceAdministration() {
  revalidatePath(RESOURCE_PATH);
  revalidatePath(SCHEDULE_PATH);
}

export async function revalidateScheduleAndInquiry(inquiryId?: string) {
  revalidatePath(SCHEDULE_PATH);
  revalidatePath(INQUIRIES_PATH);
  revalidatePath(BOOKINGS_PATH);
  if (inquiryId) {
    revalidatePath(`${INQUIRIES_PATH}/${inquiryId}`);
  }
}

"use client";

import { useEffect } from "react";

import { useInquiryAwareness } from "@/components/layout/inquiry-awareness-provider";

export function AcknowledgeInquiryView({ inquiryId }: { inquiryId: string }) {
  const awareness = useInquiryAwareness();

  const acknowledge = awareness?.acknowledge;

  useEffect(() => {
    if (!inquiryId || !acknowledge) {
      return;
    }
    void acknowledge(inquiryId);
  }, [acknowledge, inquiryId]);

  return null;
}

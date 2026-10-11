import { MarketingHome } from "@/components/marketing/marketing-home";
import { marketingMetadata } from "@/lib/marketing/metadata";

export const metadata = marketingMetadata();

export default function HomePage() {
  return <MarketingHome />;
}
